export type VerificationSource = 'ai' | 'satellite' | 'manual';

export type VerificationStatus = 'verified' | 'rejected' | 'conflict' | 'pending';

export interface VerificationEvent {
  event_id: string; // UUID, idempotency key
  verification_id: string; // UUID, grouping key
  source: VerificationSource;
  confidence: number; // 0.0 - 1.0
  timestamp: string; // ISO-8601
  data: Record<string, any>;
}

export interface Decision {
  verification_id: string;
  status: VerificationStatus;
  decision_timestamp: string;
  reason: string;
  evidence: Array<{
    event_id: string;
    source: VerificationSource;
    derived_status: 'verified' | 'rejected' | 'pending';
    confidence: number;
    timestamp: string;
  }>;
  considered_event_ids: string[];
  state_hash: string;
  version: number;
}
