import { VerificationEvent } from '@greenlink/shared';
import { EventRepository, DomainError } from '../database/repositories/eventRepository';

export class EventService {
  constructor(private repository: EventRepository) {}

  async createVerificationEvent(event: VerificationEvent): Promise<void> {
    if (!event.event_id || typeof event.event_id !== 'string') {
      throw new DomainError('INVALID_EVENT_ID', 'Event ID must be a non-empty string');
    }
    if (!event.verification_id || typeof event.verification_id !== 'string') {
      throw new DomainError('INVALID_VERIFICATION_ID', 'Verification ID must be a non-empty string');
    }
    if (event.source !== 'ai' && event.source !== 'satellite' && event.source !== 'manual') {
      throw new DomainError('INVALID_SOURCE', 'Invalid event source');
    }
    if (typeof event.confidence !== 'number' || isNaN(event.confidence) || !isFinite(event.confidence) || event.confidence < 0 || event.confidence > 1) {
      throw new DomainError('INVALID_CONFIDENCE', 'Confidence must be a number between 0 and 1');
    }
    if (!event.timestamp || isNaN(Date.parse(event.timestamp))) {
      throw new DomainError('INVALID_TIMESTAMP', 'Timestamp must be a valid ISO-8601 string');
    }
    if (!event.data || typeof event.data !== 'object') {
      throw new DomainError('INVALID_DATA', 'Data must be a valid JSON-compatible object');
    }

    // Pass validated event to repository
    await this.repository.createEvent(event);
  }

  async getVerificationEvents(verificationId: string): Promise<VerificationEvent[]> {
    return await this.repository.getEventsByVerificationId(verificationId);
  }

  async getPendingEventCount(): Promise<number> {
    const stats = await this.repository.getStorageStats();
    return stats.pendingEvents;
  }
}
