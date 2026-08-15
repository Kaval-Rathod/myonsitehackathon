import { VerificationEvent, Decision } from '@greenlink/shared';
import { generateHash, canonicalize } from '@greenlink/shared';
import { sortEventsDeterministically } from './comparator';
import { deriveEvidence } from './rules';
import { DomainError, DerivedEvidence } from './types';

export const reconcile = (events: VerificationEvent[]): Decision => {
  if (!events || events.length === 0) {
    throw new DomainError('EMPTY_INPUT', 'Cannot reconcile empty event list');
  }

  // Verify all events belong to the same verification_id
  const verificationId = events[0].verification_id;
  if (!verificationId) {
    throw new DomainError('INVALID_VERIFICATION_ID', 'Missing verification_id');
  }
  
  for (const event of events) {
    if (event.verification_id !== verificationId) {
      throw new DomainError('MULTIPLE_VERIFICATION_IDS', 'Events must belong to the same verification case');
    }
  }

  // Deduplicate identical events and check for conflicting payloads
  const uniqueEventsMap = new Map<string, VerificationEvent>();
  for (const event of events) {
    const existing = uniqueEventsMap.get(event.event_id);
    if (existing) {
      const existingHash = generateHash(existing);
      const newHash = generateHash(event);
      if (existingHash !== newHash) {
        throw new DomainError('DUPLICATE_EVENT_ID_CONFLICT', `Conflicting payload for event_id: ${event.event_id}`);
      }
    } else {
      uniqueEventsMap.set(event.event_id, event);
    }
  }

  const uniqueEvents = Array.from(uniqueEventsMap.values());
  const sortedEvents = sortEventsDeterministically(uniqueEvents);
  
  const evidence: DerivedEvidence[] = sortedEvents.map(deriveEvidence);
  
  // Find final manual decision
  const manualEvents = evidence.filter(e => e.source === 'manual');
  let finalManualDecision: DerivedEvidence | null = null;
  
  if (manualEvents.length > 0) {
    // sortEventsDeterministically already sorts by timestamp ASC, event_id ASC.
    // The latest event is the last one in the filtered array.
    const latestManual = manualEvents[manualEvents.length - 1];
    if (latestManual.derived_status === 'verified' || latestManual.derived_status === 'rejected') {
      finalManualDecision = latestManual;
    }
  }

  // Get AI and Satellite events (using the latest if there are multiple of same source, although typically there's one)
  const aiEvents = evidence.filter(e => e.source === 'ai');
  const latestAi = aiEvents.length > 0 ? aiEvents[aiEvents.length - 1] : null;

  const satEvents = evidence.filter(e => e.source === 'satellite');
  const latestSat = satEvents.length > 0 ? satEvents[satEvents.length - 1] : null;

  let finalStatus: 'verified' | 'rejected' | 'conflict' = 'conflict';
  let reason = '';

  if (finalManualDecision) {
    finalStatus = finalManualDecision.derived_status as 'verified' | 'rejected';
    reason = `Manual audit ${finalStatus} the verification and therefore overrides all automated evidence.`;
  } else if (latestAi && latestSat) {
    if (latestAi.derived_status === latestSat.derived_status) {
      finalStatus = latestAi.derived_status as 'verified' | 'rejected';
      reason = `AI and satellite independently agreed on ${finalStatus}. No final manual override was present.`;
    } else {
      const diff = Math.abs(latestAi.confidence - latestSat.confidence);
      // diff < 0.1 handles precision nicely in JS but let's be careful with floats. 
      // Using a small epsilon or just diff < 0.1 as per PRD.
      // E.g. Math.abs(0.91 - 0.81) = 0.09999999999999998 < 0.1
      if (diff < 0.0999999) { // Using 0.0999999 to avoid exact 0.1 float imprecision being treated as < 0.1 if it's 0.09999999999
        // Better: let's round to 4 decimals for the comparison to strictly follow the "exact 0.1" rule
        const roundedDiff = Math.round(diff * 10000) / 10000;
        if (roundedDiff < 0.1) {
          finalStatus = latestAi.derived_status as 'verified' | 'rejected';
          reason = `AI classified the verification as ${latestAi.derived_status} with confidence ${latestAi.confidence}, while satellite classified it as ${latestSat.derived_status} with confidence ${latestSat.confidence}. Their confidence difference was ${roundedDiff}, so AI was selected according to the deterministic tie-breaking rule.`;
        } else {
          finalStatus = 'conflict';
          reason = 'AI and satellite evidence conflict and confidence difference does not meet tie-breaker criteria.';
        }
      } else {
        const roundedDiff = Math.round(diff * 10000) / 10000;
        if (roundedDiff < 0.1) {
           finalStatus = latestAi.derived_status as 'verified' | 'rejected';
           reason = `AI classified the verification as ${latestAi.derived_status} with confidence ${latestAi.confidence}, while satellite classified it as ${latestSat.derived_status} with confidence ${latestSat.confidence}. Their confidence difference was ${roundedDiff}, so AI was selected according to the deterministic tie-breaking rule.`;
        } else {
           finalStatus = 'conflict';
           reason = 'AI and satellite evidence conflict and confidence difference does not meet tie-breaker criteria.';
        }
      }
    }
  } else if (latestAi) {
    finalStatus = latestAi.derived_status as 'verified' | 'rejected';
    reason = `AI provided ${finalStatus} evidence. No other valid evidence was present.`;
  } else if (latestSat) {
    finalStatus = latestSat.derived_status as 'verified' | 'rejected';
    reason = `Satellite provided ${finalStatus} evidence. No other valid evidence was present.`;
  } else {
    finalStatus = 'conflict';
    reason = 'Insufficient verification evidence was available.';
  }

  // Calculate max timestamp deterministically
  const decision_timestamp = sortedEvents[sortedEvents.length - 1].timestamp;
  const considered_event_ids = sortedEvents.map(e => e.event_id);

  const decisionState = {
    verification_id: verificationId,
    status: finalStatus,
    reason,
    considered_event_ids,
    evidence,
    version: 1,
    decision_timestamp,
  };

  const state_hash = generateHash(decisionState);

  return {
    ...decisionState,
    state_hash,
  };
};

export const replay = (events: VerificationEvent[]): Decision => {
  return reconcile(events);
};
