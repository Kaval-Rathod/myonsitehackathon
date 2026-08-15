import request from 'supertest';
import { app } from '../src/server';

describe('GET /health', () => {
  it('returns status ok and service name', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'greenlink-backend');
  });
});
