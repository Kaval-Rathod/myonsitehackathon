import { VerificationEvent, Decision } from '@greenlink/shared';
import { EventRepository, DecisionRepository, AuditLogRepository, AuditLog } from '../repositories/interfaces';
import { reconcile } from '../domain/reconciliation';

export class EventService {
  constructor(
    private readonly eventRepo: EventRepository,
    private readonly decisionRepo: DecisionRepository,
    private readonly auditLogRepo: AuditLogRepository
  ) {}

  async processEvent(event: VerificationEvent): Promise<{ status: 'accepted' | 'duplicate'; decision: Decision }> {
    const { isNew } = await this.eventRepo.insertIfNew(event);

    const events = await this.eventRepo.getEventsByVerificationId(event.verification_id);
    
    // Sort events deterministically as per reconciliation rules before hashing
    const sortedEvents = [...events].sort((a, b) => {
      const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.event_id.localeCompare(b.event_id);
    });

    const decisionResult = reconcile(sortedEvents);

    let latestDecision = await this.decisionRepo.getLatestDecision(event.verification_id);

    // If new decision has the same state_hash as the latest, do not create a new version
    if (latestDecision && latestDecision.state_hash === decisionResult.state_hash) {
      return {
        status: isNew ? 'accepted' : 'duplicate',
        decision: latestDecision,
      };
    }

    const version = latestDecision ? latestDecision.version + 1 : 1;

    const newDecision: Decision = {
      ...decisionResult,
      version,
    };

    const savedDecision = await this.decisionRepo.saveDecision(newDecision);

    // Persist the audit log entry for the new decision version
    await this.auditLogRepo.saveAuditLog({
      verification_id: savedDecision.verification_id,
      decision_version: savedDecision.version,
      considered_event_ids: decisionResult.considered_event_ids,
      explanation: {
        status: savedDecision.status,
        reason: savedDecision.reason,
        evidence: decisionResult.evidence,
      },
      state_hash: savedDecision.state_hash,
    });

    return {
      status: isNew ? 'accepted' : 'duplicate',
      decision: savedDecision,
    };
  }

  async getAuditHistory(id: string): Promise<{
    verification_id: string;
    events: VerificationEvent[];
    history: AuditLog[];
  }> {
    // 1. Check if the id is an event_id
    const event = await this.eventRepo.getEventById(id);
    const verificationId = event ? event.verification_id : id;

    // 2. Fetch all events for that verification case
    const events = await this.eventRepo.getEventsByVerificationId(verificationId);
    
    // Sort events deterministically as per reconciliation rules
    const sortedEvents = [...events].sort((a, b) => {
      const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.event_id.localeCompare(b.event_id);
    });

    // 3. Fetch audit logs for that verification case
    const history = await this.auditLogRepo.getAuditLogsByVerificationId(verificationId);

    return {
      verification_id: verificationId,
      events: sortedEvents,
      history,
    };
  }
}
