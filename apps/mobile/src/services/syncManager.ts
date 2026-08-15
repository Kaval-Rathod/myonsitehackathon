import { EventRepository } from '../database/repositories/eventRepository';
import { ApiClient } from './apiClient';

export interface SyncManagerOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  staleTimeoutMs?: number;
  // Injectable sleep to avoid hanging tests
  sleep?: (ms: number) => Promise<void>;
}

export class SyncManager {
  private isSyncing = false;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly staleTimeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly repository: EventRepository,
    private readonly apiClient: ApiClient,
    options: SyncManagerOptions = {}
  ) {
    this.maxRetries = options.maxRetries ?? 5;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
    this.staleTimeoutMs = options.staleTimeoutMs ?? 5 * 60 * 1000; // 5 minutes default
    this.sleep = options.sleep ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  }

  async syncPendingEvents(): Promise<void> {
    if (this.isSyncing) {
      console.log('[SyncManager] Already syncing, ignoring request.');
      return;
    }
    
    this.isSyncing = true;
    console.log('[SyncManager] Starting synchronization of pending events...');
    
    try {
      // 1. Recover any stale syncing records (crash recovery)
      await this.repository.recoverStaleSyncingEvents(this.staleTimeoutMs);

      // 2. Fetch all pending events (already deterministically sorted by repository)
      const pendingEvents = await this.repository.getPendingEvents();
      console.log(`[SyncManager] Found ${pendingEvents.length} pending events to sync.`);

      for (const event of pendingEvents) {
        console.log(`[SyncManager] Syncing event: ${event.event_id}`);
        // Mark as syncing to claim it
        await this.repository.markEventSyncing(event.event_id);

        let success = false;
        let attempt = 0;

        while (!success && attempt <= this.maxRetries) {
          if (attempt > 0) {
            const delay = Math.min(this.baseDelayMs * Math.pow(2, attempt - 1), this.maxDelayMs);
            console.log(`[SyncManager] Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
            await this.sleep(delay);
          }
          
          const result = await this.apiClient.postEvent(event);
          console.log(`[SyncManager] Post result for ${event.event_id}:`, result);

          if (result.type === 'success') {
            await this.repository.markEventSynced(event.event_id);
            console.log(`[SyncManager] Event ${event.event_id} synced successfully!`);
            success = true;
            break;
          }

          if (result.type === 'conflict') {
            await this.repository.markEventConflict(event.event_id, result.error);
            console.warn(`[SyncManager] Event ${event.event_id} conflict error:`, result.error);
            success = true; // No more retries for this event
            break;
          }

          if (result.type === 'failed') {
            await this.repository.markEventFailed(event.event_id, result.error);
            console.error(`[SyncManager] Event ${event.event_id} permanent failure:`, result.error);
            success = true; // Permanent failure, no retries
            break;
          }

          if (result.type === 'transient') {
            attempt++;
            if (attempt > this.maxRetries) {
              await this.repository.markEventPending(event.event_id, result.error);
              console.error(`[SyncManager] Event ${event.event_id} failed after maximum retries:`, result.error);
              break;
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[SyncManager] Error during sync run:', err);
      throw err;
    } finally {
      this.isSyncing = false;
      console.log('[SyncManager] Synchronization cycle finished.');
    }
  }
}
