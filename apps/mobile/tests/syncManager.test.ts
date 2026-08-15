import { SyncManager } from '../src/services/syncManager';
import { EventRepository } from '../src/database/repositories/eventRepository';
import { ApiClient, ApiResult } from '../src/services/apiClient';
import { VerificationEvent } from '@greenlink/shared';
import { NodeAdapter } from './NodeAdapter';
import { createTablesSQL } from '../src/database/schema';

describe('SyncManager', () => {
  let adapter: NodeAdapter;
  let repository: EventRepository;
  let mockApiClient: jest.Mocked<ApiClient>;
  let syncManager: SyncManager;
  let sleepMock: jest.Mock;

  const baseEvent: VerificationEvent = {
    event_id: '11111111-1111-4111-8111-111111111111',
    verification_id: '22222222-2222-4222-8222-222222222222',
    source: 'ai',
    confidence: 0.9,
    timestamp: new Date().toISOString(),
    data: { test: true },
  };

  beforeEach(async () => {
    adapter = new NodeAdapter(':memory:');
    
    // Initialize schema
    for (const sql of createTablesSQL) {
      await adapter.execute(sql);
    }

    repository = new EventRepository(adapter);
    
    mockApiClient = {
      postEvent: jest.fn(),
    };

    sleepMock = jest.fn().mockResolvedValue(undefined);

    syncManager = new SyncManager(repository, mockApiClient, {
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 50,
      staleTimeoutMs: 1000,
      sleep: sleepMock,
    });
  });

  afterEach(async () => {
    await adapter.close();
  });

  const getSyncQueue = async (eventId: string) => {
    const rows = await adapter.query<any>('SELECT * FROM sync_queue WHERE event_id = ?', [eventId]);
    return rows[0];
  };

  const getVerificationEvent = async (eventId: string) => {
    const rows = await adapter.query<any>('SELECT * FROM verification_events WHERE event_id = ?', [eventId]);
    return rows[0];
  };

  it('1. successful 201', async () => {
    await repository.createEvent(baseEvent);
    mockApiClient.postEvent.mockResolvedValueOnce({ type: 'success', status: 201, data: {} });
    
    await syncManager.syncPendingEvents();
    
    const queue = await getSyncQueue(baseEvent.event_id);
    expect(queue.sync_status).toBe('synced');
    expect(mockApiClient.postEvent).toHaveBeenCalledTimes(1);
    
    // 14. successful sync preserves evidence
    const vEvent = await getVerificationEvent(baseEvent.event_id);
    expect(vEvent).toBeDefined();
    expect(vEvent.sync_status).toBe('synced');
  });

  it('2. successful 200 duplicate', async () => {
    await repository.createEvent(baseEvent);
    mockApiClient.postEvent.mockResolvedValueOnce({ type: 'success', status: 200, data: {} });
    
    await syncManager.syncPendingEvents();
    
    const queue = await getSyncQueue(baseEvent.event_id);
    expect(queue.sync_status).toBe('synced');
  });

  it('3. 409 conflict', async () => {
    await repository.createEvent(baseEvent);
    mockApiClient.postEvent.mockResolvedValueOnce({ type: 'conflict', error: 'conflict error' });
    
    await syncManager.syncPendingEvents();
    
    const queue = await getSyncQueue(baseEvent.event_id);
    expect(queue.sync_status).toBe('conflict');
    expect(queue.error_info).toBe('conflict error');
    
    // 16. conflict preserves evidence
    const vEvent = await getVerificationEvent(baseEvent.event_id);
    expect(vEvent).toBeDefined();
  });

  it('4. 400 failure', async () => {
    await repository.createEvent(baseEvent);
    mockApiClient.postEvent.mockResolvedValueOnce({ type: 'failed', error: 'bad request' });
    
    await syncManager.syncPendingEvents();
    
    const queue = await getSyncQueue(baseEvent.event_id);
    expect(queue.sync_status).toBe('failed');
    
    // 15. failed sync preserves evidence
    const vEvent = await getVerificationEvent(baseEvent.event_id);
    expect(vEvent).toBeDefined();
  });

  it('5. 413 failure', async () => {
    await repository.createEvent(baseEvent);
    mockApiClient.postEvent.mockResolvedValueOnce({ type: 'failed', error: 'too large' });
    
    await syncManager.syncPendingEvents();
    
    const queue = await getSyncQueue(baseEvent.event_id);
    expect(queue.sync_status).toBe('failed');
  });

  it('6. 500 retry and 8. retry_count increment', async () => {
    await repository.createEvent(baseEvent);
    mockApiClient.postEvent.mockResolvedValue({ type: 'transient', error: 'internal server error' });
    
    await syncManager.syncPendingEvents();
    
    const queue = await getSyncQueue(baseEvent.event_id);
    expect(queue.sync_status).toBe('pending');
    expect(queue.retry_count).toBe(1);
    expect(queue.error_info).toBe('internal server error');
    expect(mockApiClient.postEvent).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(sleepMock).toHaveBeenCalledTimes(2); // Slept twice
  });

  it('7. network failure', async () => {
    await repository.createEvent(baseEvent);
    mockApiClient.postEvent.mockResolvedValue({ type: 'transient', error: 'Network error' });
    
    await syncManager.syncPendingEvents();
    
    const queue = await getSyncQueue(baseEvent.event_id);
    expect(queue.sync_status).toBe('pending');
    expect(queue.retry_count).toBe(1); // One full sync cycle failure increments retry_count by 1
  });

  it('9. error_info persistence', async () => {
    await repository.createEvent(baseEvent);
    mockApiClient.postEvent.mockResolvedValueOnce({ type: 'failed', error: 'specific error context' });
    
    await syncManager.syncPendingEvents();
    
    const queue = await getSyncQueue(baseEvent.event_id);
    expect(queue.error_info).toBe('specific error context');
  });

  it('10. deterministic event ordering', async () => {
    const e1 = { ...baseEvent, event_id: 'a1111111-1111-4111-8111-111111111111' };
    const e2 = { ...baseEvent, event_id: 'b2222222-2222-4222-8222-222222222222' };
    
    await repository.createEvent(e2); // created first
    await new Promise(r => setTimeout(r, 10)); // small delay to ensure created_at differs
    await repository.createEvent(e1); // created second

    mockApiClient.postEvent.mockResolvedValue({ type: 'success', status: 201, data: {} });
    
    await syncManager.syncPendingEvents();
    
    // They should be processed in order of created_at ASC
    expect(mockApiClient.postEvent.mock.calls[0][0].event_id).toBe(e2.event_id);
    expect(mockApiClient.postEvent.mock.calls[1][0].event_id).toBe(e1.event_id);
  });

  it('11. concurrency lock', async () => {
    await repository.createEvent(baseEvent);
    
    // Simulate a slow API call
    mockApiClient.postEvent.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 100));
      return { type: 'success', status: 201, data: {} };
    });
    
    const promise1 = syncManager.syncPendingEvents();
    const promise2 = syncManager.syncPendingEvents();
    
    await Promise.all([promise1, promise2]);
    
    // Post event should only be called once, because the second call returned immediately due to the lock
    expect(mockApiClient.postEvent).toHaveBeenCalledTimes(1);
  });

  it('12. stale syncing recovery', async () => {
    await repository.createEvent(baseEvent);
    // Force it into a stale syncing state
    await adapter.execute(
      `UPDATE sync_queue SET sync_status = 'syncing', updated_at = ? WHERE event_id = ?`,
      [new Date(Date.now() - 2000).toISOString(), baseEvent.event_id] // 2 seconds old (> 1000ms staleTimeoutMs)
    );
    
    mockApiClient.postEvent.mockResolvedValueOnce({ type: 'success', status: 201, data: {} });
    
    await syncManager.syncPendingEvents();
    
    const queue = await getSyncQueue(baseEvent.event_id);
    // Should have recovered and synced successfully
    expect(queue.sync_status).toBe('synced');
  });

  it('13. empty queue', async () => {
    await syncManager.syncPendingEvents();
    expect(mockApiClient.postEvent).toHaveBeenCalledTimes(0);
  });

  it('17. duplicate retry is safe', async () => {
    await repository.createEvent(baseEvent);
    // Pretend it failed transiently once
    mockApiClient.postEvent
      .mockResolvedValueOnce({ type: 'transient', error: 'Network error' })
      .mockResolvedValueOnce({ type: 'transient', error: 'Network error' })
      .mockResolvedValueOnce({ type: 'transient', error: 'Network error' });
    await syncManager.syncPendingEvents();
    
    // Now it's pending again
    expect((await getSyncQueue(baseEvent.event_id)).sync_status).toBe('pending');
    
    // Next run, it succeeds (maybe it actually created on the server but we didn't get the ack)
    mockApiClient.postEvent.mockResolvedValueOnce({ type: 'success', status: 200, data: {} });
    await syncManager.syncPendingEvents();
    
    const queue = await getSyncQueue(baseEvent.event_id);
    expect(queue.sync_status).toBe('synced');
  });

  it('18. multiple pending events', async () => {
    const e1 = { ...baseEvent, event_id: 'a1111111-1111-4111-8111-111111111111' };
    const e2 = { ...baseEvent, event_id: 'b2222222-2222-4222-8222-222222222222' };
    await repository.createEvent(e1);
    await repository.createEvent(e2);
    
    mockApiClient.postEvent.mockResolvedValue({ type: 'success', status: 201, data: {} });
    
    await syncManager.syncPendingEvents();
    
    expect((await getSyncQueue(e1.event_id)).sync_status).toBe('synced');
    expect((await getSyncQueue(e2.event_id)).sync_status).toBe('synced');
  });
});
