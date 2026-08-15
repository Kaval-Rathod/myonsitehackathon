import { NodeAdapter } from './NodeAdapter';
import { EventRepository, DomainError } from '../src/database/repositories/eventRepository';
import { PRAGMAS, createTablesSQL } from '../src/database/schema';
import { VerificationEvent } from '@greenlink/shared';

describe('Offline-First Mobile Event Capture', () => {
  let adapter: NodeAdapter;
  let repo: EventRepository;

  beforeEach(async () => {
    adapter = new NodeAdapter(':memory:');
    await adapter.execute(PRAGMAS);
    for (const sql of createTablesSQL) {
      await adapter.execute(sql);
    }
    repo = new EventRepository(adapter);
  });

  afterEach(async () => {
    await adapter.close();
  });

  const baseEvent: VerificationEvent = {
    event_id: '1',
    verification_id: 'V001',
    source: 'ai',
    confidence: 0.9,
    timestamp: '2026-08-15T10:00:00.000Z',
    data: { key: 'value' },
  };

  it('Test 1 - Database initializes successfully', async () => {
    const stats = await repo.getStorageStats();
    expect(stats.totalEvents).toBe(0);
  });

  it('Test 2 - Initialization is idempotent', async () => {
    await repo.createEvent(baseEvent);
    // Initialize again
    await adapter.execute(PRAGMAS);
    for (const sql of createTablesSQL) {
      await adapter.execute(sql);
    }
    const events = await repo.getAllEvents();
    expect(events.length).toBe(1);
    expect(events[0].event_id).toBe('1');
  });

  it('Test 3 - Create valid event', async () => {
    await repo.createEvent(baseEvent);
    const event = await repo.getEvent('1');
    expect(event).toBeTruthy();
    expect(event?.event_id).toBe('1');
  });

  it('Test 4 - Create event while offline (No HTTP dependencies)', async () => {
    // We are entirely in-memory, simulating no network.
    await repo.createEvent({ ...baseEvent, event_id: 'offline1' });
    const pending = await repo.getPendingEvents();
    expect(pending.length).toBe(1);
  });

  it('Test 5 - Duplicate identical event', async () => {
    await repo.createEvent(baseEvent);
    await repo.createEvent(baseEvent); // Duplicate identical

    const stats = await repo.getStorageStats();
    expect(stats.totalEvents).toBe(1);
    expect(stats.pendingEvents).toBe(1); // 1 queue item
  });

  it('Test 6 - Conflicting duplicate event', async () => {
    await repo.createEvent(baseEvent);
    
    const conflictEvent = { ...baseEvent, confidence: 0.4 };
    let errorCode = '';
    try {
      await repo.createEvent(conflictEvent);
    } catch (e: any) {
      errorCode = e.code;
    }
    expect(errorCode).toBe('DUPLICATE_EVENT_ID_CONFLICT');

    // Original remains unchanged
    const stored = await repo.getEvent('1');
    expect(stored?.confidence).toBe(0.9);
  });

  it('Test 7 - Invalid source', async () => {
    const service = new (require('../src/services/eventService').EventService)(repo);
    await expect(service.createVerificationEvent({ ...baseEvent, source: 'invalid' as any })).rejects.toThrow('INVALID_SOURCE');
  });

  it('Test 8 - Invalid confidence', async () => {
    const service = new (require('../src/services/eventService').EventService)(repo);
    await expect(service.createVerificationEvent({ ...baseEvent, confidence: -0.1 })).rejects.toThrow('INVALID_CONFIDENCE');
    await expect(service.createVerificationEvent({ ...baseEvent, confidence: 1.1 })).rejects.toThrow('INVALID_CONFIDENCE');
    await expect(service.createVerificationEvent({ ...baseEvent, confidence: NaN })).rejects.toThrow('INVALID_CONFIDENCE');
    await expect(service.createVerificationEvent({ ...baseEvent, confidence: Infinity })).rejects.toThrow('INVALID_CONFIDENCE');
  });

  it('Test 9 - Invalid timestamp', async () => {
    const service = new (require('../src/services/eventService').EventService)(repo);
    await expect(service.createVerificationEvent({ ...baseEvent, timestamp: 'invalid-date' })).rejects.toThrow('INVALID_TIMESTAMP');
  });

  it('Test 10 - Missing required fields', async () => {
    const service = new (require('../src/services/eventService').EventService)(repo);
    await expect(service.createVerificationEvent({ ...baseEvent, event_id: '' })).rejects.toThrow('INVALID_EVENT_ID');
    await expect(service.createVerificationEvent({ ...baseEvent, verification_id: '' })).rejects.toThrow('INVALID_VERIFICATION_ID');
    await expect(service.createVerificationEvent({ ...baseEvent, data: null as any })).rejects.toThrow('INVALID_DATA');
  });

  it('Test 11 - Event retrieval ordering', async () => {
    const e2 = { ...baseEvent, event_id: 'E2', timestamp: '2026-08-15T11:00:00.000Z' };
    const e1 = { ...baseEvent, event_id: 'E1', timestamp: '2026-08-15T10:00:00.000Z' };
    const e3 = { ...baseEvent, event_id: 'E3', timestamp: '2026-08-15T10:00:00.000Z' }; // Ties timestamp with E1

    await repo.createEvent(e2);
    await repo.createEvent(e3);
    await repo.createEvent(e1);

    const sorted = await repo.getEventsByVerificationId('V001');
    expect(sorted[0].event_id).toBe('E1');
    expect(sorted[1].event_id).toBe('E3');
    expect(sorted[2].event_id).toBe('E2');
  });

  it('Test 12 - Atomic event + queue insertion', async () => {
    // Simulating transaction failure by breaking the queue constraint.
    await repo.createEvent(baseEvent);
    
    // Attempt inserting an event with the same ID directly into events but bypassing queue?
    // We can simulate an error by messing up the schema temporarily.
    await adapter.execute('DROP TABLE sync_queue');
    
    try {
      await repo.createEvent({ ...baseEvent, event_id: 'FAIL_EVENT' });
    } catch (e) {
      // should rollback
    }
    
    const events = await adapter.query<any>('SELECT * FROM verification_events WHERE event_id = ?', ['FAIL_EVENT']);
    expect(events.length).toBe(0); // Rolled back
  });

  it('Test 13 - Sync status transitions', async () => {
    await repo.createEvent(baseEvent);
    await repo.markEventSyncing('1');
    
    let rows = await adapter.query<any>('SELECT sync_status FROM sync_queue WHERE event_id = "1"');
    expect(rows[0].sync_status).toBe('syncing');

    await repo.markEventSynced('1');
    rows = await adapter.query<any>('SELECT sync_status FROM sync_queue WHERE event_id = "1"');
    expect(rows[0].sync_status).toBe('synced');
  });

  it('Test 14 - Failed event preserves evidence', async () => {
    await repo.createEvent(baseEvent);
    await repo.markEventSyncing('1');
    await repo.markEventFailed('1', 'Network error');

    const rows = await adapter.query<any>('SELECT * FROM sync_queue WHERE event_id = "1"');
    expect(rows[0].sync_status).toBe('failed');
    expect(rows[0].retry_count).toBe(1);
    expect(rows[0].error_info).toBe('Network error');

    const event = await repo.getEvent('1');
    expect(event).toBeTruthy(); // Evidence remains
  });

  it('Test 15 - 10MB event boundary', async () => {
    const hugeData = 'a'.repeat(10 * 1024 * 1024 + 1);
    
    let code = '';
    try {
      await repo.createEvent({ ...baseEvent, event_id: 'HUGE', data: { big: hugeData } });
    } catch (e: any) {
      code = e.code;
    }
    expect(code).toBe('EVENT_PAYLOAD_TOO_LARGE');
  });

  it('Test 16 - Storage statistics', async () => {
    await repo.createEvent(baseEvent);
    await repo.createEvent({ ...baseEvent, event_id: '2' });
    await repo.markEventSyncing('1');
    await repo.markEventSynced('1'); // Event 1 is synced
    
    // Event 2 is still pending
    const stats = await repo.getStorageStats();
    expect(stats.totalEvents).toBe(2);
    expect(stats.pendingEvents).toBe(1);
  });

  it('Test 17 - Foreign key enforcement', async () => {
    let error: any = null;
    try {
      // sync_queue has FK to verification_events
      await adapter.execute("INSERT INTO sync_queue (event_id, sync_status, created_at, updated_at) VALUES ('ORPHAN', 'pending', 'now', 'now')");
    } catch (e: any) {
      error = e;
    }
    expect(error).toBeTruthy();
    expect(error.message.toLowerCase()).toContain('foreign key constraint failed');
  });

  it('Test 19 - Canonical duplicate comparison', async () => {
    const e1 = { ...baseEvent, data: { region: "A", veg: 0.72 } };
    const e2 = { ...baseEvent, data: { veg: 0.72, region: "A" } }; // Different insertion order
    
    await repo.createEvent(e1);
    await repo.createEvent(e2); // Should be considered identical due to canonicalization

    const stats = await repo.getStorageStats();
    expect(stats.totalEvents).toBe(1);
  });

  it('Test 20 - Midnight ordering', async () => {
    const e1 = { ...baseEvent, event_id: 'M1', timestamp: '2026-08-15T23:59:59Z' };
    const e2 = { ...baseEvent, event_id: 'M2', timestamp: '2026-08-16T00:00:01Z' };
    
    // Insert reverse
    await repo.createEvent(e2);
    await repo.createEvent(e1);

    const sorted = await repo.getEventsByVerificationId('V001');
    expect(sorted[0].event_id).toBe('M1');
    expect(sorted[1].event_id).toBe('M2');
  });

  it('Test 21 - Failed event preservation exactly', async () => {
    await repo.createEvent(baseEvent);
    await repo.markEventSyncing('1');
    await repo.markEventFailed('1', 'TIMEOUT');
    
    const ev = await repo.getEvent('1');
    expect(ev?.data).toEqual(baseEvent.data); // Unchanged evidence
  });
});
