import { DatabaseAdapter, DatabaseTransaction } from './DatabaseAdapter';

class WebDatabaseTransaction implements DatabaseTransaction {
  constructor(private adapter: WebDatabaseAdapter) {}
  
  async execute(sql: string, params?: unknown[]): Promise<void> {
    return this.adapter.execute(sql, params);
  }
  
  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.adapter.query<T>(sql, params);
  }
}

export class WebDatabaseAdapter implements DatabaseAdapter {
  private events = new Map<string, any>();
  private syncs = new Map<string, any>();

  constructor() {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage() {
    try {
      const savedEvents = localStorage.getItem('greenlink_web_events');
      const savedSyncs = localStorage.getItem('greenlink_web_syncs');
      if (savedEvents) {
        const arr = JSON.parse(savedEvents);
        for (const e of arr) this.events.set(e.event_id, e);
      }
      if (savedSyncs) {
        const arr = JSON.parse(savedSyncs);
        for (const s of arr) this.syncs.set(s.event_id, s);
      }
    } catch (e) {
      console.error('Failed to load from localStorage', e);
    }
  }

  private saveToLocalStorage() {
    try {
      localStorage.setItem('greenlink_web_events', JSON.stringify(Array.from(this.events.values())));
      localStorage.setItem('greenlink_web_syncs', JSON.stringify(Array.from(this.syncs.values())));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const s = sql.trim().toLowerCase().replace(/\s+/g, ' ');
    const p = params || [];

    if (s.startsWith('insert into verification_events')) {
      const row = {
        event_id: p[0],
        verification_id: p[1],
        source: p[2],
        confidence: p[3],
        timestamp: p[4],
        data: p[5],
        created_at: p[6],
        sync_status: p[7]
      };
      this.events.set(row.event_id, row);
    } else if (s.startsWith('insert into sync_queue')) {
      const row = {
        event_id: p[0],
        sync_status: p[1],
        retry_count: p[2],
        created_at: p[3],
        updated_at: p[4]
      };
      this.syncs.set(row.event_id, row);
    } else if (s.includes('update sync_queue') && s.includes('retry_count = retry_count + 1')) {
      const sync = this.syncs.get(p[3]);
      if (sync) {
        sync.sync_status = p[0];
        sync.retry_count = (sync.retry_count || 0) + 1;
        sync.last_attempt_timestamp = p[1];
        sync.error_info = p[2];
        sync.updated_at = p[2];
      }
    } else if (s.includes('update sync_queue') && s.includes('sync_status = ?')) {
      const sync = this.syncs.get(p[2]);
      if (sync) {
        sync.sync_status = p[0];
        sync.updated_at = p[1];
      }
    } else if (s.includes('update sync_queue') && s.includes('sync_status = \'conflict\'')) {
      const sync = this.syncs.get(p[3]);
      if (sync) {
        sync.sync_status = 'conflict';
        sync.last_attempt_timestamp = p[0];
        sync.error_info = p[1];
        sync.updated_at = p[2];
      }
    } else if (s.includes('update verification_events') && s.includes('sync_status = ?')) {
      const event = this.events.get(p[1]);
      if (event) {
        event.sync_status = p[0];
      }
    } else if (s.includes('update verification_events') && s.includes('sync_status = \'failed\'')) {
      const event = this.events.get(p[0]);
      if (event) {
        event.sync_status = 'failed';
      }
    } else if (s.includes('update verification_events') && s.includes('sync_status = \'pending\'')) {
      const event = this.events.get(p[0]);
      if (event) {
        event.sync_status = 'pending';
      }
    } else if (s.includes('update verification_events') && s.includes('sync_status = \'conflict\'')) {
      const event = this.events.get(p[0]);
      if (event) {
        event.sync_status = 'conflict';
      }
    } else if (s.startsWith('delete from sync_queue')) {
      this.syncs.delete(p[0]);
    } else if (s.startsWith('delete from verification_events')) {
      this.events.delete(p[0]);
    }

    this.saveToLocalStorage();
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const s = sql.trim().toLowerCase().replace(/\s+/g, ' ');
    const p = params || [];

    if (s.startsWith('select * from verification_events where event_id = ?')) {
      const row = this.events.get(p[0]);
      return row ? [row as T] : [];
    } else if (s.startsWith('select * from verification_events where verification_id = ?')) {
      const list = Array.from(this.events.values()).filter(e => e.verification_id === p[0]);
      list.sort((a, b) => {
        const t = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        if (t !== 0) return t;
        return a.event_id.localeCompare(b.event_id);
      });
      return list as T[];
    } else if (s.includes('select v.* from verification_events v join sync_queue q')) {
      const list = [];
      for (const e of this.events.values()) {
        const q = this.syncs.get(e.event_id);
        if (q && q.sync_status === 'pending') {
          list.push({ ...e, created_at: q.created_at });
        }
      }
      list.sort((a, b) => {
        const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (t !== 0) return t;
        return a.event_id.localeCompare(b.event_id);
      });
      return list as T[];
    } else if (s.startsWith('select * from verification_events')) {
      return Array.from(this.events.values()) as T[];
    } else if (s.startsWith('select sync_status from sync_queue where event_id = ?')) {
      const q = this.syncs.get(p[0]);
      return q ? [{ sync_status: q.sync_status } as T] : [];
    } else if (s.startsWith('select count(*) as count from verification_events')) {
      return [{ count: this.events.size } as T];
    } else if (s.startsWith('select count(*) as count from sync_queue where sync_status = ?')) {
      const count = Array.from(this.syncs.values()).filter(s => s.sync_status === p[0]).length;
      return [{ count } as T];
    }

    return [];
  }

  async transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    const tx = new WebDatabaseTransaction(this);
    return callback(tx);
  }
}
