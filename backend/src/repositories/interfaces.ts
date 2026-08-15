import { VerificationEvent, Decision } from '@greenlink/shared';

export interface InsertEventResult {
  isNew: boolean;
  event: VerificationEvent;
}

export interface EventRepository {
  /**
   * Attempts to insert a new event.
   * If the exact identical payload exists for the event_id, returns { isNew: false, event }.
   * If a conflicting payload exists for the event_id, throws DUPLICATE_EVENT_ID_CONFLICT.
   */
  insertIfNew(event: VerificationEvent): Promise<InsertEventResult>;

  /**
   * Loads all events associated with a given verification_id.
   * Needed for recalculating the decision.
   */
  getEventsByVerificationId(verificationId: string): Promise<VerificationEvent[]>;

  /**
   * Loads a single event by event_id. Returns null if not found.
   */
  getEventById(eventId: string): Promise<VerificationEvent | null>;
}

export interface DecisionRepository {
  /**
   * Retrieves the current highest-version decision for a verification_id.
   * Returns null if no decision exists.
   */
  getLatestDecision(verificationId: string): Promise<Decision | null>;

  /**
   * Inserts a new decision version.
   * Uses unique constraint (verification_id, version) to avoid race conditions.
   */
  saveDecision(decision: Decision): Promise<Decision>;
}

export interface AuditLog {
  id?: number;
  verification_id: string;
  decision_version: number;
  considered_event_ids: string[];
  explanation: {
    status: string;
    reason: string;
    evidence: any[];
  };
  state_hash: string;
  created_at?: string;
}

export interface AuditLogRepository {
  saveAuditLog(log: AuditLog): Promise<AuditLog>;
  getAuditLogsByVerificationId(verificationId: string): Promise<AuditLog[]>;
}
