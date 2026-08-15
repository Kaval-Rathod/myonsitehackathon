import { VerificationEvent, canonicalize } from '@greenlink/shared';
import { DatabaseAdapter } from '../DatabaseAdapter';

export class DomainError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'DomainError';
    this.code = code;
  }
}

export interface StorageStats {
  totalEvents: number;
  pendingEvents: number;
  syncingEvents: number;
  syncedEvents: number;
  failedEvents: number;
  conflictEvents: number;
  databaseSizeBytes: number | null;
}

export class EventRepository {
  constructor(private adapter: DatabaseAdapter) {}

  async createEvent(event: VerificationEvent): Promise<void> {
    const canonicalData = canonicalize(event.data);
    const payloadSize = typeof Buffer !== 'undefined'
      ? Buffer.byteLength(canonicalData, 'utf8')
      : new Blob([canonicalData]).size;
    if (payloadSize > 10 * 1024 * 1024) {
      throw new DomainError('EVENT_PAYLOAD_TOO_LARGE', 'Event data exceeds 10MB limit');
    }

    const now = new Date().toISOString();

    await this.adapter.transaction(async (tx) => {
      // Check for duplicates
      const existing = await tx.query<any>('SELECT * FROM verification_events WHERE event_id = ?', [event.event_id]);
      
      if (existing.length > 0) {
        const row = existing[0];
        if (
          row.verification_id !== event.verification_id ||
          row.source !== event.source ||
          row.confidence !== event.confidence ||
          row.timestamp !== event.timestamp ||
          row.data !== canonicalData
        ) {
          throw new DomainError('DUPLICATE_EVENT_ID_CONFLICT', 'Conflicting payload for event_id: ' + event.event_id);
        }
        return; // Idempotent success
      }

      await tx.execute(
        `INSERT INTO verification_events (event_id, verification_id, source, confidence, timestamp, data, created_at, sync_status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [event.event_id, event.verification_id, event.source, event.confidence, event.timestamp, canonicalData, now, 'pending']
      );

      await tx.execute(
        `INSERT INTO sync_queue (event_id, sync_status, retry_count, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [event.event_id, 'pending', 0, now, now]
      );
    });
  }

  async getEvent(eventId: string): Promise<VerificationEvent | null> {
    const rows = await this.adapter.query<any>('SELECT * FROM verification_events WHERE event_id = ?', [eventId]);
    if (rows.length === 0) return null;
    return this.mapToEvent(rows[0]);
  }

  async getEventsByVerificationId(verificationId: string): Promise<VerificationEvent[]> {
    const rows = await this.adapter.query<any>(
      'SELECT * FROM verification_events WHERE verification_id = ? ORDER BY timestamp ASC, event_id ASC', 
      [verificationId]
    );
    return rows.map(this.mapToEvent);
  }

  async getPendingEvents(): Promise<VerificationEvent[]> {
    const rows = await this.adapter.query<any>(
      `SELECT v.* FROM verification_events v 
       JOIN sync_queue q ON v.event_id = q.event_id 
       WHERE q.sync_status = 'pending' 
       ORDER BY q.created_at ASC, v.event_id ASC`
    );
    return rows.map(this.mapToEvent);
  }

  async getAllEvents(): Promise<VerificationEvent[]> {
    const rows = await this.adapter.query<any>('SELECT * FROM verification_events');
    return rows.map(this.mapToEvent);
  }

  async markEventSyncing(eventId: string): Promise<void> {
    await this.updateSyncStatus(eventId, 'pending', 'syncing', 'failed');
  }

  async markEventSynced(eventId: string): Promise<void> {
    await this.updateSyncStatus(eventId, 'syncing', 'synced');
  }

  async markEventFailed(eventId: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    await this.adapter.transaction(async (tx) => {
      const qResult = await tx.query<any>(`SELECT sync_status FROM sync_queue WHERE event_id = ?`, [eventId]);
      if (qResult.length === 0) {
        throw new DomainError('EVENT_NOT_FOUND', 'Event not found in sync queue: ' + eventId);
      }
      if (qResult[0].sync_status !== 'syncing') {
        throw new DomainError('INVALID_SYNC_TRANSITION', `Cannot transition sync_status from ${qResult[0].sync_status} to failed`);
      }

      await tx.execute(
        `UPDATE sync_queue 
         SET sync_status = 'failed', 
             retry_count = retry_count + 1, 
             last_attempt_timestamp = ?, 
             error_info = ?, 
             updated_at = ? 
         WHERE event_id = ?`,
        [now, error, now, eventId]
      );
      
      await tx.execute(
        `UPDATE verification_events 
         SET sync_status = 'failed' 
         WHERE event_id = ?`,
        [eventId]
      );
    });
  }

  async markEventPending(eventId: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    await this.adapter.transaction(async (tx) => {
      const qResult = await tx.query<any>(`SELECT sync_status FROM sync_queue WHERE event_id = ?`, [eventId]);
      if (qResult.length === 0) {
        throw new DomainError('EVENT_NOT_FOUND', 'Event not found in sync queue: ' + eventId);
      }
      if (qResult[0].sync_status !== 'syncing') {
        throw new DomainError('INVALID_SYNC_TRANSITION', `Cannot transition sync_status from ${qResult[0].sync_status} to pending`);
      }

      await tx.execute(
        `UPDATE sync_queue 
         SET sync_status = 'pending', 
             retry_count = retry_count + 1, 
             last_attempt_timestamp = ?, 
             error_info = ?, 
             updated_at = ? 
         WHERE event_id = ?`,
        [now, error, now, eventId]
      );
      
      await tx.execute(
        `UPDATE verification_events 
         SET sync_status = 'pending' 
         WHERE event_id = ?`,
        [eventId]
      );
    });
  }

  async markEventConflict(eventId: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    await this.adapter.transaction(async (tx) => {
      const qResult = await tx.query<any>(`SELECT sync_status FROM sync_queue WHERE event_id = ?`, [eventId]);
      if (qResult.length === 0) {
        throw new DomainError('EVENT_NOT_FOUND', 'Event not found in sync queue: ' + eventId);
      }
      if (qResult[0].sync_status !== 'syncing') {
        throw new DomainError('INVALID_SYNC_TRANSITION', `Cannot transition sync_status from ${qResult[0].sync_status} to conflict`);
      }

      await tx.execute(
        `UPDATE sync_queue 
         SET sync_status = 'conflict', 
             last_attempt_timestamp = ?, 
             error_info = ?, 
             updated_at = ? 
         WHERE event_id = ?`,
        [now, error, now, eventId]
      );
      
      await tx.execute(
        `UPDATE verification_events 
         SET sync_status = 'conflict' 
         WHERE event_id = ?`,
        [eventId]
      );
    });
  }

  async recoverStaleSyncingEvents(timeoutMs: number): Promise<void> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - timeoutMs).toISOString();
    
    await this.adapter.transaction(async (tx) => {
      // Find all syncing events that were updated before the cutoff
      const staleEvents = await tx.query<any>(
        `SELECT event_id FROM sync_queue WHERE sync_status = 'syncing' AND updated_at < ?`,
        [cutoff]
      );

      for (const row of staleEvents) {
        await tx.execute(
          `UPDATE sync_queue SET sync_status = 'pending', updated_at = ? WHERE event_id = ?`,
          [now.toISOString(), row.event_id]
        );
        await tx.execute(
          `UPDATE verification_events SET sync_status = 'pending' WHERE event_id = ?`,
          [row.event_id]
        );
      }
    });
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.adapter.transaction(async (tx) => {
      await tx.execute('DELETE FROM sync_queue WHERE event_id = ?', [eventId]);
      await tx.execute('DELETE FROM verification_events WHERE event_id = ?', [eventId]);
    });
  }

  async getStorageStats(): Promise<StorageStats> {
    const events = await this.adapter.query<{ count: number }>('SELECT COUNT(*) as count FROM verification_events');
    
    const getCount = async (status: string) => {
      const res = await this.adapter.query<{ count: number }>('SELECT COUNT(*) as count FROM sync_queue WHERE sync_status = ?', [status]);
      return res[0].count;
    };
    
    return {
      totalEvents: events[0].count,
      pendingEvents: await getCount('pending'),
      syncingEvents: await getCount('syncing'),
      syncedEvents: await getCount('synced'),
      failedEvents: await getCount('failed'),
      conflictEvents: await getCount('conflict'),
      databaseSizeBytes: null
    };
  }

  private async updateSyncStatus(eventId: string, from1: string, to: string, from2?: string): Promise<void> {
    const now = new Date().toISOString();
    await this.adapter.transaction(async (tx) => {
      const statuses = from2 ? `'${from1}', '${from2}'` : `'${from1}'`;
      
      const qResult = await tx.query<any>(`SELECT sync_status FROM sync_queue WHERE event_id = ?`, [eventId]);
      if (qResult.length === 0) {
        throw new DomainError('EVENT_NOT_FOUND', 'Event not found in sync queue: ' + eventId);
      }
      const currentStatus = qResult[0].sync_status;
      if (currentStatus !== from1 && currentStatus !== from2) {
         throw new DomainError('INVALID_SYNC_TRANSITION', `Cannot transition sync_status from ${currentStatus} to ${to}`);
      }

      await tx.execute(
        `UPDATE sync_queue SET sync_status = ?, updated_at = ? WHERE event_id = ?`,
        [to, now, eventId]
      );
      await tx.execute(
        `UPDATE verification_events SET sync_status = ? WHERE event_id = ?`,
        [to, eventId]
      );
    });
  }

  private mapToEvent(row: any): VerificationEvent {
    return {
      event_id: row.event_id,
      verification_id: row.verification_id,
      source: row.source,
      confidence: row.confidence,
      timestamp: row.timestamp,
      data: JSON.parse(row.data)
    };
  }
}
