import { VerificationEvent } from '@greenlink/shared';

export class DomainError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'DomainError';
    this.code = code;
  }
}

export interface DerivedEvidence {
  event_id: string;
  source: 'ai' | 'satellite' | 'manual';
  derived_status: 'verified' | 'rejected' | 'pending';
  confidence: number;
  timestamp: string;
}

export interface ReconciliationContext {
  verification_id: string;
  events: VerificationEvent[];
}
