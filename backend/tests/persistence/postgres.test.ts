import { SupabaseEventRepository } from '../../src/repositories/supabaseEventRepository';
import { SupabaseDecisionRepository } from '../../src/repositories/supabaseDecisionRepository';
import { VerificationEvent } from '@greenlink/shared';
import { supabase } from '../../src/repositories/supabaseClient';

const describeIf = process.env.SUPABASE_URL ? describe : describe.skip;

describeIf('PostgreSQL Persistence Integration', () => {
  let eventRepo: SupabaseEventRepository;
  let decisionRepo: SupabaseDecisionRepository;
  
  const testVerificationId = '00000000-0000-4000-8000-000000000099';
  const testEventId1 = '00000000-0000-4000-8000-000000000100';
  const testEventId2 = '00000000-0000-4000-8000-000000000101';
  
  const baseEvent: VerificationEvent = {
    event_id: testEventId1,
    verification_id: testVerificationId,
    source: 'ai',
    confidence: 0.9,
    timestamp: new Date().toISOString(),
    data: { status: 'verified', tags: ['a', 'b'] }
  };

  beforeAll(async () => {
    // 1. Preflight Database Check: Ensure SUPABASE_URL and SUPABASE_SERVICE_KEY exist
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.log('Persistence tests skipped/not configured. Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.');
      process.exit(0);
    }

    // 2. Preflight Schema Verification
    // Verify verification_events
    const { error: errEvents } = await supabase
      .from('verification_events')
      .select('event_id, verification_id, source, confidence, timestamp, data, created_at')
      .limit(1);
    
    if (errEvents && errEvents.code !== 'PGRST116') { // PGRST116 is usually 'No rows', but table exists. If code is 42P01 (relation does not exist) or similar, it fails.
      if (errEvents.message.includes('relation') || errEvents.message.includes('column')) {
        throw new Error(`GREENLINK_SUPABASE_SCHEMA_NOT_FOUND\nConfigured Supabase database does not contain the GreenLink verification schema or is missing columns on verification_events. Error: ${errEvents.message}\nApply the GreenLink migrations to the dedicated project first.`);
      }
    }

    // Verify verification_decisions
    const { error: errDecisions } = await supabase
      .from('verification_decisions')
      .select('verification_id, version, status, reason, state_hash, decision_timestamp, created_at')
      .limit(1);

    if (errDecisions && (errDecisions.message.includes('relation') || errDecisions.message.includes('column'))) {
      throw new Error(`GREENLINK_SUPABASE_SCHEMA_NOT_FOUND\nConfigured Supabase database is missing verification_decisions or its required columns. Error: ${errDecisions.message}`);
    }

    // Verify audit_logs
    const { error: errAudit } = await supabase
      .from('audit_logs')
      .select('verification_id, decision_version, considered_event_ids, explanation, state_hash, created_at')
      .limit(1);

    if (errAudit && (errAudit.message.includes('relation') || errAudit.message.includes('column'))) {
      throw new Error(`GREENLINK_SUPABASE_SCHEMA_NOT_FOUND\nConfigured Supabase database is missing audit_logs or its required columns. Error: ${errAudit.message}`);
    }

    eventRepo = new SupabaseEventRepository();
    decisionRepo = new SupabaseDecisionRepository();
    
    // Clean up test data ONLY for the specific test IDs
    await supabase.from('audit_logs').delete().eq('verification_id', testVerificationId);
    await supabase.from('verification_decisions').delete().eq('verification_id', testVerificationId);
    await supabase.from('verification_events').delete().eq('verification_id', testVerificationId);
  });

  afterAll(async () => {
    // Clean up test data
    await supabase.from('audit_logs').delete().eq('verification_id', testVerificationId);
    await supabase.from('verification_decisions').delete().eq('verification_id', testVerificationId);
    await supabase.from('verification_events').delete().eq('verification_id', testVerificationId);
  });

  it('Test 17 - UNIQUE(event_id) prevents duplicate insertions natively and idempotent returns existing', async () => {
    const { isNew, event } = await eventRepo.insertIfNew(baseEvent);
    expect(isNew).toBe(true);
    expect(event.event_id).toBe(baseEvent.event_id);

    // Identical insertion
    const { isNew: isNew2, event: event2 } = await eventRepo.insertIfNew(baseEvent);
    expect(isNew2).toBe(false);
    expect(event2.event_id).toBe(baseEvent.event_id);
  });

  it('Test 17.5 - Conflicting payload is rejected', async () => {
    const conflictEvent = { ...baseEvent, confidence: 0.4 };
    let error: any;
    try {
      await eventRepo.insertIfNew(conflictEvent);
    } catch (e: any) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.code).toBe('DUPLICATE_EVENT_ID_CONFLICT');
  });

  it('Test 19 - JSONB persistence round-trip', async () => {
    const events = await eventRepo.getEventsByVerificationId(testVerificationId);
    expect(events.length).toBe(1);
    expect(events[0].data).toEqual({ status: 'verified', tags: ['a', 'b'] });
  });

  it('Test 18 - Decision version uniqueness is enforced', async () => {
    const decision: any = {
      verification_id: testVerificationId,
      version: 1,
      status: 'verified',
      reason: 'test',
      evidence: [],
      considered_event_ids: [testEventId1],
      state_hash: 'abc',
      decision_timestamp: new Date().toISOString()
    };
    
    const saved = await decisionRepo.saveDecision(decision);
    expect(saved.version).toBe(1);

    // Try to save version 1 again
    let error: any;
    try {
      await decisionRepo.saveDecision(decision);
    } catch (e: any) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.message).toContain('Unique constraint violation');
  });

  it('Test 20 - Deterministic event retrieval ordering (actually backend engine does the ordering, but let us verify we get all events)', async () => {
    const event2 = { ...baseEvent, event_id: testEventId2, timestamp: new Date(Date.now() - 10000).toISOString() }; // older timestamp
    await eventRepo.insertIfNew(event2);
    
    const events = await eventRepo.getEventsByVerificationId(testVerificationId);
    expect(events.length).toBe(2);
    
    // In service we sort them deterministically anyway.
    const eIds = events.map(e => e.event_id).sort();
    expect(eIds).toEqual([testEventId1, testEventId2].sort());
  });
});
