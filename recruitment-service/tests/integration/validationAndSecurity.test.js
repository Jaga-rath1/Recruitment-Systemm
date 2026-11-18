import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { createApp } = require('../../src/app');
const authAdapter = require('../../src/integrations/auth/auth.adapter');

let app;

describe('API Validation, Health Checks & Edge Security', () => {
  beforeAll(async () => {
    await startTestDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetTestState();
  });

  it('serves /health and /ready probes cleanly', async () => {
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');
    expect(health.headers['x-request-id']).toBeTruthy();

    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.database).toBe('connected');
  });

  it('rejects malformed subscription payloads and invalid UUID parameters with 422', async () => {
    const badSub = await request(app).post('/api/v1/subscriptions').send({
      organisationName: 'A',
      adminEmail: 'not-an-email'
    });
    expect(badSub.status).toBe(422);
    expect(badSub.body.error.code).toBe('VALIDATION_ERROR');

    const badUuid = await request(app).get('/api/v1/subscriptions/not-a-uuid');
    expect(badUuid.status).toBe(422);
  });

  it('rejects unsupported resume MIME types on public job application', async () => {
    const token = authAdapter.signAccessToken({
      sub: uuidv4(),
      email: 'pa@nexnuv.com',
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN']
    });
    expect(token).toBeTruthy();

    const res = await request(app)
      .post(`/api/v1/applications/public/jobs/${uuidv4()}/apply`)
      .field('fullName', 'Test User')
      .field('email', 'test@example.com')
      .field('mobileNumber', '1234567890')
      .field('location', 'NYC')
      .field('totalExperienceYears', '3')
      .attach('resume', Buffer.from('MZ executable'), {
        filename: 'malware.exe',
        contentType: 'application/x-msdownload'
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('rejects invalid bearer tokens and missing routes cleanly', async () => {
    const unauth = await request(app)
      .get('/api/v1/jobs')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(unauth.status).toBe(401);

    const notFound = await request(app).get('/api/v1/does-not-exist');
    expect(notFound.status).toBe(404);
  });
});

