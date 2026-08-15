import { VerificationEvent } from '@greenlink/shared';
import { DomainError } from './types';

/**
 * Validates that a string is a valid ISO-8601 timestamp with explicit timezone info.
 * For simplicity in validation, we check if Date.parse returns a valid number.
 */
export const validateTimestamp = (timestamp: string): void => {
  if (!timestamp || isNaN(Date.parse(timestamp))) {
    throw new DomainError('INVALID_TIMESTAMP', `Invalid ISO-8601 timestamp: ${timestamp}`);
  }
};

/**
 * Deterministically sorts events by timestamp ascending.
 * Uses event_id as a deterministic tie-breaker.
 */
export const sortEventsDeterministically = (events: VerificationEvent[]): VerificationEvent[] => {
  return [...events].sort((a, b) => {
    validateTimestamp(a.timestamp);
    validateTimestamp(b.timestamp);
    
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    
    // Tie-breaker
    return a.event_id.localeCompare(b.event_id);
  });
};
