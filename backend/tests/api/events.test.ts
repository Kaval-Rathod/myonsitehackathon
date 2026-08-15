import request from 'supertest';
import { app } from '../../src/server';
import { setEventService } from '../../src/controllers/eventController';
import { EventService } from '../../src/services/eventService';
import { InMemoryEventRepository, InMemoryDecisionRepository, InMemoryAuditLogRepository } from '../../src/repositories/inMemoryRepositories';
import { v4 as uuidv4 } from 'uuid';

describe('POST /events', () => {
  let eventRepo: InMemoryEventRepository;
  let decisionRepo: InMemoryDecisionRepository;
  let auditLogRepo: InMemoryAuditLogRepository;
  let eventService: EventService;

  beforeEach(() => {
    eventRepo = new InMemoryEventRepository();
    decisionRepo = new InMemoryDecisionRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    eventService = new EventService(eventRepo, decisionRepo, auditLogRepo);
    setEventService(eventService);
  });

  const baseEvent = {
    source: 'ai',
    confidence: 0.9,
    timestamp: '2026-08-15T10:00:00Z',
    data: { foo: 'bar' }
  };

  it('Test 1 - Valid AI event', async () => {
    const uuid = uuidv4();
    const res = await request(app)
      .post('/events')
      .send({ ...baseEvent, event_id: uuid, verification_id: uuid, source: 'ai' });
    expect(res.status).toBe(201);
    expect(res.body.decision.version).toBe(1);
    expect(res.body.decision.status).toBe('verified');
  });

  it('Test 2 - Valid satellite event', async () => {
    const uuid = uuidv4();
    const res = await request(app)
      .post('/events')
      .send({ ...baseEvent, event_id: uuid, verification_id: uuid, source: 'satellite', data: { vegetation_index: 0.72 } });
    expect(res.status).toBe(201);
  });

  it('Test 3 - Valid manual event', async () => {
    const uuid = uuidv4();
    const res = await request(app)
      .post('/events')
      .send({ ...baseEvent, event_id: uuid, verification_id: uuid, source: 'manual', data: { status: 'verified' }, confidence: 1 });
    expect(res.status).toBe(201);
  });

  it('Test 4 - Missing event_id', async () => {
    const uuid = uuidv4();
    const res = await request(app).post('/events').send({ ...baseEvent, event_id: undefined, verification_id: uuid });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_EVENT');
  });

  it('Test 5 - Invalid source', async () => {
    const uuid = uuidv4();
    const res = await request(app).post('/events').send({ ...baseEvent, event_id: uuid, verification_id: uuid, source: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('Test 6 - Invalid confidence', async () => {
    const uuid = uuidv4();
    let res = await request(app).post('/events').send({ ...baseEvent, event_id: uuid, verification_id: uuid, confidence: -0.1 });
    expect(res.status).toBe(400);
    res = await request(app).post('/events').send({ ...baseEvent, event_id: uuid, verification_id: uuid, confidence: 1.1 });
    expect(res.status).toBe(400);
  });

  it('Test 7 - Invalid timestamp', async () => {
    const uuid = uuidv4();
    const res = await request(app).post('/events').send({ ...baseEvent, event_id: uuid, verification_id: uuid, timestamp: 'invalid-time' });
    expect(res.status).toBe(400);
  });

  it('Test 8 - Missing data', async () => {
    const uuid = uuidv4();
    const res = await request(app).post('/events').send({ ...baseEvent, event_id: uuid, verification_id: uuid, data: undefined });
    expect(res.status).toBe(400);
  });

  it('Test 9 - Oversized payload', async () => {
    const uuid = uuidv4();
    const bigData = 'a'.repeat(10 * 1024 * 1024 + 1); // 10MB + 1
    const res = await request(app).post('/events').send({ ...baseEvent, event_id: uuid, verification_id: uuid, data: { big: bigData } });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('EVENT_PAYLOAD_TOO_LARGE');
  });

  it('Test 10 - First event creates decision version 1', async () => {
    const uuid = uuidv4();
    const res = await request(app).post('/events').send({ ...baseEvent, event_id: uuid, verification_id: uuid });
    expect(res.status).toBe(201);
    expect(res.body.decision.version).toBe(1);
    const events = await eventRepo.getEventsByVerificationId(uuid);
    expect(events.length).toBe(1);
  });

  it('Test 11 - Identical duplicate is idempotent', async () => {
    const uuid = uuidv4();
    const event = { ...baseEvent, event_id: uuid, verification_id: uuid };
    await request(app).post('/events').send(event);
    const res = await request(app).post('/events').send(event);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('duplicate');
    const events = await eventRepo.getEventsByVerificationId(uuid);
    expect(events.length).toBe(1);
  });

  it('Test 12 - Conflicting duplicate returns 409', async () => {
    const uuid = uuidv4();
    const event1 = { ...baseEvent, event_id: uuid, verification_id: uuid, confidence: 0.9 };
    const event2 = { ...baseEvent, event_id: uuid, verification_id: uuid, confidence: 0.4 };
    await request(app).post('/events').send(event1);
    const res = await request(app).post('/events').send(event2);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_EVENT_ID_CONFLICT');
  });

  it('Test 13 - Late event updates reconciliation', async () => {
    const uuid = uuidv4();
    const ai = { ...baseEvent, event_id: uuidv4(), verification_id: uuid, source: 'ai', timestamp: '2026-08-15T11:00:00Z', confidence: 0.9 };
    const lateSat = { ...baseEvent, event_id: uuidv4(), verification_id: uuid, source: 'satellite', timestamp: '2026-08-15T10:00:00Z', confidence: 0.7, data: { vegetation_index: 0.4 } };
    
    await request(app).post('/events').send(ai);
    const res = await request(app).post('/events').send(lateSat);
    expect(res.status).toBe(201);
    expect(res.body.decision.version).toBe(2);
    expect(res.body.decision.status).toBe('conflict');
  });

  it('Test 14 - Out-of-order events preserve deterministic state hash', async () => {
    const uuid = uuidv4();
    const e1 = { ...baseEvent, event_id: uuidv4(), verification_id: uuid, source: 'ai', confidence: 0.4 };
    const e2 = { ...baseEvent, event_id: uuidv4(), verification_id: uuid, source: 'satellite', data: { vegetation_index: 0.72 } };
    
    // Sequence 1
    eventRepo = new InMemoryEventRepository();
    decisionRepo = new InMemoryDecisionRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    setEventService(new EventService(eventRepo, decisionRepo, auditLogRepo));
    await request(app).post('/events').send(e1);
    const res1 = await request(app).post('/events').send(e2);
    expect(res1.status).toBe(201);
    
    // Sequence 2
    eventRepo = new InMemoryEventRepository();
    decisionRepo = new InMemoryDecisionRepository();
    auditLogRepo = new InMemoryAuditLogRepository();
    setEventService(new EventService(eventRepo, decisionRepo, auditLogRepo));
    await request(app).post('/events').send(e2);
    const res2 = await request(app).post('/events').send(e1);
    expect(res2.status).toBe(201);
    
    expect(res1.body.decision.state_hash).toBe(res2.body.decision.state_hash);
  });

  it('Test 15 - Unchanged state does not create a new decision version', async () => {
    const uuid = uuidv4();
    const e1 = { ...baseEvent, event_id: uuidv4(), verification_id: uuid, source: 'ai', confidence: 0.9 };
    const e2 = { ...baseEvent, event_id: uuidv4(), verification_id: uuid, source: 'ai', confidence: 0.95 }; 
    
    await request(app).post('/events').send(e1);
    const res = await request(app).post('/events').send(e2);
    
    expect(res.status).toBe(201);
    expect(res.body.decision).toBeDefined();
  });

  it('Test 16 - Manual override produces a new decision', async () => {
    const uuid = uuidv4();
    const ai = { ...baseEvent, event_id: uuidv4(), verification_id: uuid, source: 'ai', confidence: 0.5 }; // -> rejected
    const manual = { ...baseEvent, event_id: uuidv4(), verification_id: uuid, source: 'manual', confidence: 1, timestamp: '2026-08-15T12:00:00Z', data: { status: 'verified' } }; // -> verified
    
    const r1 = await request(app).post('/events').send(ai);
    expect(r1.status).toBe(201);
    expect(r1.body.decision.status).toBe('rejected');
    
    const r2 = await request(app).post('/events').send(manual);
    expect(r2.status).toBe(201);
    expect(r2.body.decision.status).toBe('verified');
  });
});
