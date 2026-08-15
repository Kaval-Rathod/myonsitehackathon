import { VerificationEvent } from '@greenlink/shared';
import { reconcile } from '../src/domain/reconciliation';
import { DomainError } from '../src/domain/reconciliation/types';

describe('Deterministic Reconciliation Engine', () => {
  const baseEvent: VerificationEvent = {
    event_id: '1',
    verification_id: 'V001',
    source: 'ai',
    confidence: 0.9,
    timestamp: '2026-08-15T10:00:00.000Z',
    data: {},
  };

  describe('Basic Edge Cases', () => {
    it('Test 1 - AI verified', () => {
      const decision = reconcile([{ ...baseEvent, source: 'ai', confidence: 0.91 }]);
      expect(decision.status).toBe('verified');
      expect(decision.reason).toContain('AI provided verified evidence');
    });

    it('Test 2 - AI rejected', () => {
      const decision = reconcile([{ ...baseEvent, source: 'ai', confidence: 0.70 }]);
      expect(decision.status).toBe('rejected');
    });

    it('Test 3 - Satellite verified', () => {
      const decision = reconcile([{ ...baseEvent, source: 'satellite', confidence: 0.9, data: { vegetation_index: 0.72 } }]);
      expect(decision.status).toBe('verified');
    });

    it('Test 4 - Satellite rejected', () => {
      const decision = reconcile([{ ...baseEvent, source: 'satellite', confidence: 0.9, data: { vegetation_index: 0.41 } }]);
      expect(decision.status).toBe('rejected');
    });

    it('Test 5 - AI + satellite agree', () => {
      const decision = reconcile([
        { ...baseEvent, event_id: 'A1', source: 'ai', confidence: 0.91 },
        { ...baseEvent, event_id: 'S1', source: 'satellite', confidence: 0.9, data: { vegetation_index: 0.72 } },
      ]);
      expect(decision.status).toBe('verified');
      expect(decision.reason).toContain('agreed');
    });

    it('Test 6 - AI + satellite disagree (diff >= 0.1)', () => {
      const decision = reconcile([
        { ...baseEvent, event_id: 'A1', source: 'ai', confidence: 0.91 },
        { ...baseEvent, event_id: 'S1', source: 'satellite', confidence: 0.70, data: { vegetation_index: 0.41 } },
      ]);
      expect(decision.status).toBe('conflict');
      expect(decision.reason).toContain('conflict');
    });

    it('Test 7 - AI tie-break (diff < 0.1)', () => {
      const decision = reconcile([
        { ...baseEvent, event_id: 'A1', source: 'ai', confidence: 0.91 },
        { ...baseEvent, event_id: 'S1', source: 'satellite', confidence: 0.85, data: { vegetation_index: 0.41 } },
      ]);
      expect(decision.status).toBe('verified');
      expect(decision.reason).toContain('tie-breaking rule');
    });

    it('Test 8 - Exact 0.1 boundary', () => {
      const decision = reconcile([
        { ...baseEvent, event_id: 'A1', source: 'ai', confidence: 0.91 },
        { ...baseEvent, event_id: 'S1', source: 'satellite', confidence: 0.81, data: { vegetation_index: 0.41 } },
      ]);
      expect(decision.status).toBe('conflict');
    });

    it('Test 9 - Manual verified override', () => {
      const decision = reconcile([
        { ...baseEvent, event_id: 'A1', source: 'ai', confidence: 0.70 },
        { ...baseEvent, event_id: 'S1', source: 'satellite', confidence: 0.9, data: { vegetation_index: 0.41 } },
        { ...baseEvent, event_id: 'M1', source: 'manual', confidence: 1.0, data: { status: 'verified' } },
      ]);
      expect(decision.status).toBe('verified');
      expect(decision.reason).toContain('Manual audit verified');
    });

    it('Test 10 - Manual rejected override', () => {
      const decision = reconcile([
        { ...baseEvent, event_id: 'A1', source: 'ai', confidence: 0.91 },
        { ...baseEvent, event_id: 'S1', source: 'satellite', confidence: 0.9, data: { vegetation_index: 0.72 } },
        { ...baseEvent, event_id: 'M1', source: 'manual', confidence: 1.0, data: { status: 'rejected' } },
      ]);
      expect(decision.status).toBe('rejected');
    });

    it('Test 11 - Manual pending', () => {
      const decision = reconcile([
        { ...baseEvent, event_id: 'A1', source: 'ai', confidence: 0.91 },
        { ...baseEvent, event_id: 'M1', source: 'manual', confidence: 1.0, data: { status: 'pending' } },
      ]);
      expect(decision.status).toBe('verified');
    });

    it('Test 12 - Multiple manual audits', () => {
      const decision = reconcile([
        { ...baseEvent, event_id: 'M1', source: 'manual', confidence: 1.0, timestamp: '2026-08-15T10:00:00.000Z', data: { status: 'rejected' } },
        { ...baseEvent, event_id: 'M2', source: 'manual', confidence: 1.0, timestamp: '2026-08-15T10:05:00.000Z', data: { status: 'verified' } },
      ]);
      expect(decision.status).toBe('verified');
    });

    it('Test 13 - Duplicate identical event', () => {
      const a = { ...baseEvent, event_id: 'A1', source: 'ai' as const, confidence: 0.91 };
      const b = { ...baseEvent, event_id: 'B1', source: 'satellite' as const, confidence: 0.9, data: { vegetation_index: 0.72 } };
      
      const d1 = reconcile([a, b]);
      const d2 = reconcile([a, a, b]);

      expect(d1).toEqual(d2);
    });

    it('Test 14 - Conflicting duplicate event ID', () => {
      const a1 = { ...baseEvent, event_id: 'A1', source: 'ai' as const, confidence: 0.91 };
      const a2 = { ...baseEvent, event_id: 'A1', source: 'ai' as const, confidence: 0.41 };
      
      expect(() => reconcile([a1, a2])).toThrow('DUPLICATE_EVENT_ID_CONFLICT');
      try {
        reconcile([a1, a2]);
      } catch (error: any) {
        expect(error).toBeInstanceOf(DomainError);
        expect(error.code).toBe('DUPLICATE_EVENT_ID_CONFLICT');
      }
    });

    it('Test 15 - Out-of-order events', () => {
      const a = { ...baseEvent, event_id: 'A1', timestamp: '2026-08-15T10:00:00.000Z', source: 'ai' as const, confidence: 0.91 };
      const b = { ...baseEvent, event_id: 'B1', timestamp: '2026-08-15T10:01:00.000Z', source: 'satellite' as const, confidence: 0.9, data: { vegetation_index: 0.72 } };
      const c = { ...baseEvent, event_id: 'C1', timestamp: '2026-08-15T10:02:00.000Z', source: 'manual' as const, confidence: 1.0, data: { status: 'pending' } };

      const d1 = reconcile([a, b, c]);
      const d2 = reconcile([b, c, a]);
      const d3 = reconcile([c, a, b]);

      expect(d1).toEqual(d2);
      expect(d2).toEqual(d3);
    });

    it('Test 16 - Timestamp tie', () => {
      const m1 = { ...baseEvent, event_id: 'M1', source: 'manual' as const, confidence: 1.0, timestamp: '2026-08-15T10:00:00.000Z', data: { status: 'rejected' } };
      const m2 = { ...baseEvent, event_id: 'M2', source: 'manual' as const, confidence: 1.0, timestamp: '2026-08-15T10:00:00.000Z', data: { status: 'verified' } };

      const d1 = reconcile([m1, m2]);
      const d2 = reconcile([m2, m1]);

      expect(d1.status).toBe('verified');
      expect(d1).toEqual(d2);
    });

    it('Test 17 - Multiple verification IDs', () => {
      const a = { ...baseEvent, verification_id: 'V001' };
      const b = { ...baseEvent, verification_id: 'V002' };
      
      expect(() => reconcile([a, b])).toThrow('MULTIPLE_VERIFICATION_IDS');
      try {
        reconcile([a, b]);
      } catch (error: any) {
        expect(error).toBeInstanceOf(DomainError);
        expect(error.code).toBe('MULTIPLE_VERIFICATION_IDS');
      }
    });

    it('Test 18 - Missing satellite vegetation index', () => {
      const sat = { ...baseEvent, source: 'satellite' as const, confidence: 0.9, data: {} };
      expect(() => reconcile([sat])).toThrow('INVALID_VEGETATION_INDEX');
      try {
        reconcile([sat]);
      } catch (error: any) {
        expect(error).toBeInstanceOf(DomainError);
        expect(error.code).toBe('INVALID_VEGETATION_INDEX');
      }
    });

    it('Test 19 - No usable evidence', () => {
      const decision = reconcile([{ ...baseEvent, source: 'manual', data: { status: 'pending' } }]);
      expect(decision.status).toBe('conflict');
      expect(decision.reason).toContain('Insufficient verification evidence');
    });

    it('Test 20 - Midnight transition', () => {
      const e1 = { ...baseEvent, event_id: 'E1', timestamp: '2026-08-15T23:59:59.000Z', source: 'ai' as const, confidence: 0.91 };
      const e2 = { ...baseEvent, event_id: 'E2', timestamp: '2026-08-16T00:00:01.000Z', source: 'manual' as const, data: { status: 'rejected' } };
      
      const decision = reconcile([e1, e2]);
      expect(decision.decision_timestamp).toBe('2026-08-16T00:00:01.000Z');
      expect(decision.status).toBe('rejected');
    });

    it('Empty input', () => {
      expect(() => reconcile([])).toThrow('EMPTY_INPUT');
      try {
        reconcile([]);
      } catch (error: any) {
        expect(error).toBeInstanceOf(DomainError);
        expect(error.code).toBe('EMPTY_INPUT');
      }
    });

    it('Event validation: invalid confidence', () => {
      const a = { ...baseEvent, confidence: 1.5 };
      expect(() => reconcile([a])).toThrow('INVALID_CONFIDENCE');
      try {
        reconcile([a]);
      } catch (error: any) {
        expect(error).toBeInstanceOf(DomainError);
        expect(error.code).toBe('INVALID_CONFIDENCE');
      }
    });
  });

  describe('Permutation Invariance', () => {
    it('produces identical state regardless of input order', () => {
      const a = { ...baseEvent, event_id: 'A', timestamp: '2026-08-15T10:00:00.000Z', source: 'ai' as const, confidence: 0.91 };
      const b = { ...baseEvent, event_id: 'B', timestamp: '2026-08-15T10:01:00.000Z', source: 'satellite' as const, confidence: 0.9, data: { vegetation_index: 0.72 } };
      const c = { ...baseEvent, event_id: 'C', timestamp: '2026-08-15T10:02:00.000Z', source: 'manual' as const, confidence: 1.0, data: { status: 'pending' } };

      const permutations = [
        [a, b, c], [a, c, b],
        [b, a, c], [b, c, a],
        [c, a, b], [c, b, a]
      ];

      const baseline = reconcile(permutations[0]);

      for (const p of permutations) {
        const result = reconcile(p);
        expect(result).toEqual(baseline);
      }
    });
  });

  describe('Performance Test', () => {
    it('reconciles 100 events in less than 5 seconds', () => {
      const events: VerificationEvent[] = [];
      for (let i = 0; i < 100; i++) {
        events.push({
          ...baseEvent,
          event_id: `EV-${i}`,
          timestamp: new Date(1000000000000 + i * 1000).toISOString(),
        });
      }

      const start = Date.now();
      const decision = reconcile(events);
      const end = Date.now();

      expect(end - start).toBeLessThan(5000);
      expect(decision.considered_event_ids.length).toBe(100);
    });
  });
});
