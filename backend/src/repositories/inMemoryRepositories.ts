import { VerificationEvent, Decision } from '@greenlink/shared';
import { EventRepository, DecisionRepository, InsertEventResult, AuditLog, AuditLogRepository } from './interfaces';
import { DomainError } from '../domain/reconciliation/types';

export class InMemoryEventRepository implements EventRepository {
  private events: Map<string, VerificationEvent> = new Map();

  private canonicalize(data: any): string {
    if (typeof data !== 'object' || data === null) {
      return JSON.stringify(data);
    }
    const keys = Object.keys(data).sort();
    const sorted: any = {};
    for (const k of keys) {
      sorted[k] = data[k];
    }
    return JSON.stringify(sorted);
  }

  async insertIfNew(event: VerificationEvent): Promise<InsertEventResult> {
    const existing = this.events.get(event.event_id);
    if (existing) {
      if (
        existing.verification_id !== event.verification_id ||
        existing.source !== event.source ||
        existing.confidence !== event.confidence ||
        existing.timestamp !== event.timestamp ||
        this.canonicalize(existing.data) !== this.canonicalize(event.data)
      ) {
        throw new DomainError('DUPLICATE_EVENT_ID_CONFLICT', 'Conflicting payload for event_id: ' + event.event_id);
      }
      return { isNew: false, event: existing };
    }
    this.events.set(event.event_id, event);
    return { isNew: true, event };
  }

  async getEventsByVerificationId(verificationId: string): Promise<VerificationEvent[]> {
    const results: VerificationEvent[] = [];
    for (const event of this.events.values()) {
      if (event.verification_id === verificationId) {
        results.push(event);
      }
    }
    return results;
  }

  async getEventById(eventId: string): Promise<VerificationEvent | null> {
    return this.events.get(eventId) || null;
  }
}

export class InMemoryDecisionRepository implements DecisionRepository {
  private decisions: Decision[] = [];

  async getLatestDecision(verificationId: string): Promise<Decision | null> {
    let latest: Decision | null = null;
    for (const d of this.decisions) {
      if (d.verification_id === verificationId) {
        if (!latest || d.version > latest.version) {
          latest = d;
        }
      }
    }
    return latest;
  }

  async saveDecision(decision: Decision): Promise<Decision> {
    // Check for unique (verification_id, version)
    const existing = this.decisions.find(
      (d) => d.verification_id === decision.verification_id && d.version === decision.version
    );
    if (existing) {
      throw new Error(`Unique constraint violation: decision version ${decision.version} already exists for verification ${decision.verification_id}`);
    }
    this.decisions.push(decision);
    return decision;
  }
}

export class InMemoryAuditLogRepository implements AuditLogRepository {
  private logs: AuditLog[] = [];

  async saveAuditLog(log: AuditLog): Promise<AuditLog> {
    const newLog = {
      ...log,
      id: this.logs.length + 1,
      created_at: new Date().toISOString(),
    };
    this.logs.push(newLog);
    return newLog;
  }

  async getAuditLogsByVerificationId(verificationId: string): Promise<AuditLog[]> {
    return this.logs
      .filter((l) => l.verification_id === verificationId)
      .sort((a, b) => a.decision_version - b.decision_version);
  }
}
