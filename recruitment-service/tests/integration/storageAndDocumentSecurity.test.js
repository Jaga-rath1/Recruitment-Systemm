import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const fs = require('fs');
const net = require('net');
const path = require('path');
const { Writable } = require('stream');
const cloudinary = require('cloudinary').v2;
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { startTestDatabase, resetTestState, stopTestDatabase } = require('../helpers/testDb');
const { registerAndVerifyCandidate } = require('../helpers/candidateAuthHelper');
const { createApp } = require('../../src/app');
const env = require('../../src/config/env');
const { getModels, getSequelize } = require('../../src/config/database');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const storageAdapter = require('../../src/integrations/storage/storage.adapter');
const { seedOrganisationRoles } = require('../../src/db/seed');

let app;
const VALID_PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF');
const VALID_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('IHDR_MOCK_PNG_CONTENT')
]);

async function createOrgWithPublishedJob(orgName, prefix) {
  const platformToken = authAdapter.signAccessToken({
    sub: uuidv4(),
    email: 'pa@nexnuv.com',
    name: 'Platform Admin',
    userType: 'PLATFORM_ADMIN',
    roles: ['PLATFORM_ADMIN']
  });

  const subRes = await request(app).post('/api/v1/subscriptions').send({
    organisationName: orgName,
    organisationDomain: `${prefix}.io`,
    industry: 'Software',
    companySize: '50-200',
    adminName: `${orgName} Admin`,
    adminEmail: `admin@${prefix}.io`
  });
  const subId = subRes.body.data.id;

  await request(app)
    .post(`/api/v1/subscriptions/${subId}/payments`)
    .field('paymentReference', `PAY-${subId.slice(0, 8)}`)
    .field('paymentMethod', 'WIRE_TRANSFER')
    .attach('proof', VALID_PNG, 'wire-receipt.png');

  const verifyRes = await request(app)
    .post(`/api/v1/subscriptions/platform-admin/${subId}/verify`)
    .set('Authorization', `Bearer ${platformToken}`)
    .send({ decision: 'APPROVE' });

  const actRes = await request(app).post('/api/v1/subscriptions/activate').send({
    activationToken: verifyRes.body.data.invitationPreview.activationToken,
    password: 'StrongPassword#2026'
  });

  const orgId = actRes.body.data.user.organisationId;
  const adminToken = actRes.body.data.token;

  const jobRes = await request(app)
    .post('/api/v1/jobs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: `${orgName} Engineer`,
      department: 'Engineering',
      location: 'Remote',
      employmentType: 'FULL_TIME',
      experienceMinYears: 2,
      experienceMaxYears: 6,
      description: 'Build secure recruitment workflows with PostgreSQL and Node.js.'
    });

  const jobId = jobRes.body.data.id;
  await request(app).post(`/api/v1/jobs/${jobId}/publish`).set('Authorization', `Bearer ${adminToken}`);

  return { subId, platformToken, orgId, adminToken, jobId };
}

function startMockClamAvServer(behaviorFn) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      let buffer = Buffer.alloc(0);
      let headerParsed = false;
      let ended = false;

      socket.on('data', async (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (!headerParsed && buffer.length >= 10) {
          headerParsed = true;
          buffer = buffer.subarray(10); // strip zINSTREAM\0
        }
        // Detect zero-length 4-byte stream terminator at end
        while (headerParsed && buffer.length >= 4 && !ended) {
          const len = buffer.readUInt32BE(0);
          if (len === 0) {
            ended = true;
            await behaviorFn(socket);
            break;
          }
          if (buffer.length < 4 + len) break;
          buffer = buffer.subarray(4 + len);
        }
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

function createMockCloudinaryHarness() {
  const assets = new Map();
  let failMode = null; // null | 'AUTH_401' | 'ERROR_500' | 'DELETE_500'
  const origFetch = globalThis.fetch;

  const uploadStreamSpy = vi
    .spyOn(cloudinary.uploader, 'upload_stream')
    .mockImplementation((options, callback) => {
      const chunks = [];
      return new Writable({
        write(chunk, _enc, cb) {
          chunks.push(Buffer.from(chunk));
          cb();
        },
        final(cb) {
          const buffer = Buffer.concat(chunks);
          cb();
          if (failMode === 'AUTH_401') {
            return callback({ http_code: 401, message: 'Invalid Cloudinary credentials' });
          }
          if (failMode === 'ERROR_500') {
            return callback({ http_code: 500, message: 'Cloudinary backend error' });
          }
          const resourceType = options.resource_type === 'image' ? 'image' : 'raw';
          const publicId = options.public_id;
          const format = resourceType === 'image' ? 'png' : null;
          assets.set(publicId, {
            body: buffer,
            resourceType,
            type: options.type,
            accessMode: options.access_mode,
            format
          });
          return callback(null, {
            public_id: publicId,
            version: 1794396500,
            resource_type: resourceType,
            type: options.type,
            access_mode: options.access_mode,
            format,
            bytes: buffer.length
          });
        }
      });
    });

  const destroySpy = vi
    .spyOn(cloudinary.uploader, 'destroy')
    .mockImplementation(async (publicId) => {
      if (failMode === 'DELETE_500') {
        const err = new Error('Cloudinary destroy failure');
        err.http_code = 500;
        throw err;
      }
      const existed = assets.delete(publicId);
      return { result: existed ? 'ok' : 'not found' };
    });

  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const strUrl = String(url);
    if (!strUrl.startsWith('https://api.cloudinary.com/')) {
      return origFetch(url, init);
    }
    if (failMode === 'AUTH_401') {
      return new Response('Unauthorized', { status: 401 });
    }
    const urlObj = new URL(strUrl);
    const publicId = urlObj.searchParams.get('public_id');
    const type = urlObj.searchParams.get('type');
    const signature = urlObj.searchParams.get('signature');
    const expiresAt = Number(urlObj.searchParams.get('expires_at') || 0);
    if (type !== 'authenticated' || !signature || expiresAt <= Math.floor(Date.now() / 1000)) {
      return new Response('Invalid or expired signed Cloudinary download', { status: 401 });
    }
    const stored = assets.get(publicId);
    if (!stored) {
      return new Response('Resource not found', { status: 404 });
    }
    return new Response(stored.body, { status: 200 });
  });

  return {
    assets,
    uploadStreamSpy,
    destroySpy,
    setFailMode: (mode) => {
      failMode = mode;
    },
    restore: () => {
      uploadStreamSpy.mockRestore();
      destroySpy.mockRestore();
      fetchSpy.mockRestore();
    }
  };
}

describe('Phase 4.3.1 — Cloudinary Storage & Document Security Suite', () => {
  const originalEnvSnapshot = {
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    STORAGE_LOCAL_ROOT: process.env.STORAGE_LOCAL_ROOT,
    STORAGE_QUARANTINE_ROOT: process.env.STORAGE_QUARANTINE_ROOT,
    MALWARE_SCANNER_MODE: process.env.MALWARE_SCANNER_MODE,
    MALWARE_SCAN_REQUIRED: process.env.MALWARE_SCAN_REQUIRED,
    CLAMAV_HOST: process.env.CLAMAV_HOST,
    CLAMAV_PORT: process.env.CLAMAV_PORT,
    MALWARE_SCAN_TIMEOUT_MS: process.env.MALWARE_SCAN_TIMEOUT_MS,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    CLOUDINARY_FOLDER_PREFIX: process.env.CLOUDINARY_FOLDER_PREFIX,
    CLOUDINARY_UPLOAD_PREFIX: process.env.CLOUDINARY_UPLOAD_PREFIX,
    CLOUDINARY_TIMEOUT_MS: process.env.CLOUDINARY_TIMEOUT_MS,
    CLOUDINARY_DOWNLOAD_TTL_SECONDS: process.env.CLOUDINARY_DOWNLOAD_TTL_SECONDS
  };

  beforeAll(async () => {
    await startTestDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetTestState();
    for (const [k, v] of Object.entries(originalEnvSnapshot)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    process.env.STORAGE_DRIVER = 'LOCAL_SECURE';
    process.env.STORAGE_LOCAL_ROOT = path.resolve(__dirname, '../../storage-test');
    process.env.STORAGE_QUARANTINE_ROOT = path.resolve(__dirname, '../../storage-test/_quarantine');
    process.env.MALWARE_SCANNER_MODE = 'DISABLED';
    process.env.MALWARE_SCAN_REQUIRED = 'false';
  });

  it('A. Upload security: rejects oversized, unsupported MIME, disguised EXE/HTML/SVG, double extensions, missing extension, and empty buffers', async () => {
    const { jobId } = await createOrgWithPublishedJob('SecureCorp', 'seccorp');

    const baseFields = (req, email) =>
      req
        .field('fullName', 'Security Test Candidate')
        .field('email', email)
        .field('mobileNumber', '+1-555-0199')
        .field('location', 'New York')
        .field('totalExperienceYears', '5')
        .field('skills', 'Security,Node.js');

    // 1. Oversized (> 10MB)
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 512, 0x25);
    const largeRes = await baseFields(
      request(app).post(`/api/v1/applications/public/jobs/${jobId}/apply`),
      'large@test.io'
    ).attach('resume', oversized, { filename: 'huge.pdf', contentType: 'application/pdf' });
    expect(largeRes.status).toBe(400);
    expect(largeRes.body.error.code).toBe('FILE_UPLOAD_ERROR');
    expect(JSON.stringify(largeRes.body)).not.toContain('storage-test');

    // 2. Unsupported MIME type
    const mimeRes = await baseFields(
      request(app).post(`/api/v1/applications/public/jobs/${jobId}/apply`),
      'mime@test.io'
    ).attach('resume', Buffer.from('MZ\x90\x00binary'), {
      filename: 'evil.exe',
      contentType: 'application/x-msdownload'
    });
    expect(mimeRes.status).toBe(400);
    expect(['UNSUPPORTED_FILE_TYPE', 'UNSUPPORTED_FILE_EXTENSION']).toContain(mimeRes.body.error.code);

    // 3. Disguised PE executable (MZ) as PDF
    const mzRes = await baseFields(
      request(app).post(`/api/v1/applications/public/jobs/${jobId}/apply`),
      'mz@test.io'
    ).attach('resume', Buffer.from('MZ\x90\x00\x03\x00\x00\x00'), {
      filename: 'payload.pdf',
      contentType: 'application/pdf'
    });
    expect(mzRes.status).toBe(400);
    expect(mzRes.body.error.code).toBe('INVALID_FILE_SIGNATURE');

    // 4. HTML/SVG XSS script disguised as PDF
    const svgRes = await baseFields(
      request(app).post(`/api/v1/applications/public/jobs/${jobId}/apply`),
      'svg@test.io'
    ).attach('resume', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), {
      filename: 'xss.pdf',
      contentType: 'application/pdf'
    });
    expect(svgRes.status).toBe(400);
    expect(svgRes.body.error.code).toBe('INVALID_FILE_SIGNATURE');

    // 5. Double extension (resume.exe.pdf and resume.pdf.exe)
    const dblInner = await baseFields(
      request(app).post(`/api/v1/applications/public/jobs/${jobId}/apply`),
      'dbl1@test.io'
    ).attach('resume', VALID_PDF, { filename: 'resume.exe.pdf', contentType: 'application/pdf' });
    expect(dblInner.status).toBe(400);
    expect(dblInner.body.error.code).toBe('UNSUPPORTED_FILE_EXTENSION');

    const dblOuter = await baseFields(
      request(app).post(`/api/v1/applications/public/jobs/${jobId}/apply`),
      'dbl2@test.io'
    ).attach('resume', VALID_PDF, { filename: 'resume.pdf.exe', contentType: 'application/pdf' });
    expect(dblOuter.status).toBe(400);
    expect(dblOuter.body.error.code).toBe('UNSUPPORTED_FILE_EXTENSION');

    // 6. Missing extension
    const noExt = await baseFields(
      request(app).post(`/api/v1/applications/public/jobs/${jobId}/apply`),
      'noext@test.io'
    ).attach('resume', VALID_PDF, { filename: 'resume', contentType: 'application/pdf' });
    expect(noExt.status).toBe(400);
    expect(noExt.body.error.code).toBe('UNSUPPORTED_FILE_EXTENSION');

    // 7. Empty buffer rejected
    const emptyRes = await baseFields(
      request(app).post(`/api/v1/applications/public/jobs/${jobId}/apply`),
      'empty@test.io'
    ).attach('resume', Buffer.alloc(0), { filename: 'empty.pdf', contentType: 'application/pdf' });
    expect(emptyRes.status).toBe(400);

    // 8. Filename with traversal prefix sanitized safely without leaving localRoot
    const validRes = await baseFields(
      request(app).post(`/api/v1/applications/public/jobs/${jobId}/apply`),
      'clean@test.io'
    ).attach('resume', VALID_PDF, { filename: '../../../clean-cv.pdf', contentType: 'application/pdf' });
    expect(validRes.status).toBe(201);

    const { ApplicationDocument } = getModels();
    const doc = await ApplicationDocument.findOne({ where: { applicationId: validRes.body.data.applicationId } });
    expect(doc.fileName).toBe('clean-cv.pdf');
    expect(doc.storageKey).not.toContain('..');
    expect(doc.checksumSha256).toHaveLength(64);
    expect(doc.scanStatus).toBe('NOT_SCANNED'); // Honest when DISABLED
  });

  it('B. Download authorization: enforces tenant, candidate, interviewer-assignment, platform-proof, deleted-DB, tampered-token, and cache headers', async () => {
    const orgA = await createOrgWithPublishedJob('OrgAlpha', 'alpha');
    const orgB = await createOrgWithPublishedJob('OrgBeta', 'beta');

    // Register and verify two distinct candidates
    const { token: cand1Token } = await registerAndVerifyCandidate(request, app, {
      fullName: 'Alice Candidate',
      email: 'alice@example.com',
      password: 'CandPassword#1'
    });
    const { token: cand2Token } = await registerAndVerifyCandidate(request, app, {
      fullName: 'Bob Candidate',
      email: 'bob@example.com',
      password: 'CandPassword#2'
    });

    // Cand 1 and Cand 2 apply to Org A job
    const apply1 = await request(app)
      .post(`/api/v1/applications/public/jobs/${orgA.jobId}/apply`)
      .set('Authorization', `Bearer ${cand1Token}`)
      .field('fullName', 'Alice Candidate')
      .field('email', 'alice@example.com')
      .field('mobileNumber', '+1-555-1001')
      .field('location', 'Austin')
      .field('totalExperienceYears', '4')
      .field('skills', 'React,Node')
      .attach('resume', VALID_PDF, 'alice-cv.pdf');
    const app1Id = apply1.body.data.applicationId;

    const apply2 = await request(app)
      .post(`/api/v1/applications/public/jobs/${orgA.jobId}/apply`)
      .set('Authorization', `Bearer ${cand2Token}`)
      .field('fullName', 'Bob Candidate')
      .field('email', 'bob@example.com')
      .field('mobileNumber', '+1-555-1002')
      .field('location', 'Boston')
      .field('totalExperienceYears', '6')
      .field('skills', 'Go,PostgreSQL')
      .attach('resume', VALID_PDF, 'bob-cv.pdf');
    const app2Id = apply2.body.data.applicationId;

    // Fetch Cand 1 download URL as Org A Admin
    const app1Detail = await request(app)
      .get(`/api/v1/applications/${app1Id}`)
      .set('Authorization', `Bearer ${orgA.adminToken}`);
    const cand1DownloadUrl = app1Detail.body.data.documents[0].downloadUrl;

    const app2Detail = await request(app)
      .get(`/api/v1/applications/${app2Id}`)
      .set('Authorization', `Bearer ${orgA.adminToken}`);
    const cand2DownloadUrl = app2Detail.body.data.documents[0].downloadUrl;

    // 1. Unauthenticated -> 401
    const noAuthRes = await request(app).get(cand1DownloadUrl);
    expect(noAuthRes.status).toBe(401);

    // 2. Tampered / expired download token -> 401
    const tamperedUrl = `${cand1DownloadUrl}tamper`;
    const tamperedRes = await request(app).get(tamperedUrl).set('Authorization', `Bearer ${orgA.adminToken}`);
    expect(tamperedRes.status).toBe(401);

    const { ApplicationDocument } = getModels();
    const doc1 = await ApplicationDocument.findOne({ where: { applicationId: app1Id } });
    const expiredUrl = storageAdapter.buildSignedDownloadUrl({
      storageKey: doc1.storageKey,
      fileName: doc1.fileName,
      mimeType: doc1.mimeType,
      organisationId: orgA.orgId,
      docScope: 'APPLICATION',
      ttlSeconds: -10
    });
    const expRes = await request(app).get(expiredUrl).set('Authorization', `Bearer ${orgA.adminToken}`);
    expect(expRes.status).toBe(401);

    // 3. Cross-tenant org B user -> 403
    const crossOrgRes = await request(app).get(cand1DownloadUrl).set('Authorization', `Bearer ${orgB.adminToken}`);
    expect(crossOrgRes.status).toBe(403);
    expect(crossOrgRes.body.error.code).toBe('CROSS_TENANT_DENIED');

    // 4. Cross-candidate -> 403
    const crossCandRes = await request(app).get(cand1DownloadUrl).set('Authorization', `Bearer ${cand2Token}`);
    expect(crossCandRes.status).toBe(403);
    expect(crossCandRes.body.error.code).toBe('CROSS_CANDIDATE_DENIED');

    // 5. Platform Admin cannot download tenant resume -> 403
    const paTenantRes = await request(app).get(cand1DownloadUrl).set('Authorization', `Bearer ${orgA.platformToken}`);
    expect(paTenantRes.status).toBe(403);

    // 6. Platform Admin CAN download subscription payment proof; Org Admin CANNOT
    const paQueue = await request(app)
      .get('/api/v1/subscriptions/platform-admin/queue')
      .set('Authorization', `Bearer ${orgA.platformToken}`);
    const proofUrl = paQueue.body.data[0].payments[0].proofDownloadUrl;
    expect(proofUrl).toContain('/api/v1/files/download?token=');

    const orgAdminProof = await request(app).get(proofUrl).set('Authorization', `Bearer ${orgA.adminToken}`);
    expect(orgAdminProof.status).toBe(403);

    const paProofOk = await request(app).get(proofUrl).set('Authorization', `Bearer ${orgA.platformToken}`);
    expect(paProofOk.status).toBe(200);
    expect(paProofOk.headers['cache-control']).toContain('private');
    expect(paProofOk.headers['cache-control']).toContain('no-store');
    expect(paProofOk.headers['x-content-type-options']).toBe('nosniff');

    // 7. Owner Candidate downloads own resume -> 200 + strict headers
    const candSelfRes = await request(app).get(cand1DownloadUrl).set('Authorization', `Bearer ${cand1Token}`);
    expect(candSelfRes.status).toBe(200);
    expect(candSelfRes.headers['content-disposition']).toContain('attachment; filename="alice-cv.pdf"');
    expect(candSelfRes.headers['x-content-type-options']).toBe('nosniff');
    expect(candSelfRes.headers['cache-control']).toBe('private, no-store, no-cache');
    expect(candSelfRes.headers['x-frame-options']).toBe('DENY');

    // 8. Technical Interviewer: create interviewer & assign ONLY to Alice (app1), NOT Bob (app2)
    const empRes = await request(app)
      .post('/api/v1/organisations/employees')
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .send({
        fullName: 'Tech Interviewer',
        email: 'tech@alpha.io',
        roleCode: 'TECHNICAL_INTERVIEWER',
        department: 'Engineering',
        designation: 'Staff Engineer'
      });
    expect(empRes.status).toBe(201);
    const techEmp = empRes.body.data;
    const techEmployeeId = techEmp.employeeId;

    const techToken = authAdapter.signAccessToken({
      sub: techEmp.authUserId,
      email: techEmp.email,
      name: techEmp.fullName,
      organisationId: orgA.orgId,
      employeeId: techEmployeeId,
      userType: 'ORG_USER',
      roles: ['TECHNICAL_INTERVIEWER']
    });

    // Shortlist Alice and assign Tech Interviewer to Alice's interview
    const screenRes = await request(app)
      .post(`/api/v1/applications/${app1Id}/screen`)
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .send({
        decision: 'SHORTLIST',
        technicalInterviewerEmployeeId: techEmployeeId,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        durationMinutes: 60,
        meetingMode: 'VIDEO',
        meetingLinkOrLocation: 'https://meet.example.com/alice'
      });
    expect(screenRes.status).toBe(200);

    // Tech interviewer CAN download assigned Alice's resume
    const techAliceOk = await request(app).get(cand1DownloadUrl).set('Authorization', `Bearer ${techToken}`);
    expect(techAliceOk.status).toBe(200);

    // Tech interviewer CANNOT download unassigned Bob's resume -> 403
    const techBobDenied = await request(app).get(cand2DownloadUrl).set('Authorization', `Bearer ${techToken}`);
    expect(techBobDenied.status).toBe(403);
    expect(techBobDenied.body.error.code).toBe('INTERVIEW_ASSIGNMENT_REQUIRED');

    // Offer document scope: move Alice to FINAL_SELECTION and issue Offer with PDF
    await request(app)
      .post(`/api/v1/applications/${app1Id}/final-decision`)
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .send({ decision: 'SELECTED', notes: 'Strong technical signal' });

    const offerRes = await request(app)
      .post('/api/v1/offers')
      .set('Authorization', `Bearer ${orgA.adminToken}`)
      .field('applicationId', app1Id)
      .field('offeredSalary', '135000')
      .field('salaryCurrency', 'USD')
      .field('designation', 'Staff Engineer')
      .field('department', 'Engineering')
      .field('joiningDate', new Date(Date.now() + 14 * 86400000).toISOString())
      .field('offerValidUntil', new Date(Date.now() + 7 * 86400000).toISOString())
      .field('sendImmediately', 'true')
      .attach('offerLetter', VALID_PDF, 'alice-offer.pdf');
    expect(offerRes.status).toBe(201);
    const offerDownloadUrl = offerRes.body.data.documents[0].downloadUrl;

    // Candidate 1 CAN download own Offer -> 200; Candidate 2, Org B, and Tech Interviewer -> 403
    const cand1OfferOk = await request(app).get(offerDownloadUrl).set('Authorization', `Bearer ${cand1Token}`);
    expect(cand1OfferOk.status).toBe(200);
    const cand2OfferDenied = await request(app).get(offerDownloadUrl).set('Authorization', `Bearer ${cand2Token}`);
    expect(cand2OfferDenied.status).toBe(403);
    const orgBOfferDenied = await request(app).get(offerDownloadUrl).set('Authorization', `Bearer ${orgB.adminToken}`);
    expect(orgBOfferDenied.status).toBe(403);
    const techOfferDenied = await request(app).get(offerDownloadUrl).set('Authorization', `Bearer ${techToken}`);
    expect(techOfferDenied.status).toBe(403);
    expect(techOfferDenied.body.error.code).toBe('INSUFFICIENT_PERMISSION');

    // 9. Deleted or quarantined DB record cannot be downloaded even with valid unexpired token
    await doc1.update({ scanStatus: 'QUARANTINED' });
    const quarantinedRes = await request(app).get(cand1DownloadUrl).set('Authorization', `Bearer ${orgA.adminToken}`);
    expect(quarantinedRes.status).toBe(403);
    expect(quarantinedRes.body.error.code).toBe('DOCUMENT_QUARANTINED');

    await doc1.destroy();
    const deletedRes = await request(app).get(cand1DownloadUrl).set('Authorization', `Bearer ${orgA.adminToken}`);
    expect(deletedRes.status).toBe(404);
  });

  it('C. Malware scanning: supports ClamAV TCP CLEAN, INFECTED quarantine, timeout fail-closed, unavailable fail-closed, and required-disabled fail-closed', async () => {
    const { orgId, jobId } = await createOrgWithPublishedJob('ScanOrg', 'scanorg');

    // 1. Clean scan via mock ClamAV daemon
    const cleanServer = await startMockClamAvServer(async (socket) => {
      socket.end('stream: OK\0');
    });
    process.env.MALWARE_SCANNER_MODE = 'CLAMAV';
    process.env.MALWARE_SCAN_REQUIRED = 'true';
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(cleanServer.port);

    try {
      const okApply = await request(app)
        .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
        .field('fullName', 'Clean Applicant')
        .field('email', 'clean.scan@test.io')
        .field('mobileNumber', '+1-555-3001')
        .field('location', 'Seattle')
        .field('totalExperienceYears', '3')
        .field('skills', 'TypeScript')
        .attach('resume', VALID_PDF, 'clean-scanned.pdf');
      expect(okApply.status).toBe(201);

      const { ApplicationDocument } = getModels();
      const doc = await ApplicationDocument.findOne({ where: { applicationId: okApply.body.data.applicationId } });
      expect(doc.scanStatus).toBe('CLEAN');
      expect(doc.scanEngine).toBe('CLAMAV');
      expect(doc.scanCheckedAt).not.toBeNull();
    } finally {
      await new Promise((r) => cleanServer.server.close(r));
    }

    // 2. Infected scan -> 422 MALWARE_DETECTED + quarantined + NOT saved in org resumes folder
    const infectedServer = await startMockClamAvServer(async (socket) => {
      socket.end('stream: Eicar-Test-Signature FOUND\0');
    });
    process.env.CLAMAV_PORT = String(infectedServer.port);

    const orgResumeDir = path.join(process.env.STORAGE_LOCAL_ROOT, orgId, 'resumes');
    const beforeFiles = fs.existsSync(orgResumeDir) ? fs.readdirSync(orgResumeDir).length : 0;

    try {
      const badApply = await request(app)
        .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
        .field('fullName', 'Infected Applicant')
        .field('email', 'infected@test.io')
        .field('mobileNumber', '+1-555-3002')
        .field('location', 'Denver')
        .field('totalExperienceYears', '3')
        .field('skills', 'Java')
        .attach('resume', VALID_PDF, 'infected-cv.pdf');
      expect(badApply.status).toBe(422);
      expect(badApply.body.error.code).toBe('MALWARE_DETECTED');

      const afterFiles = fs.existsSync(orgResumeDir) ? fs.readdirSync(orgResumeDir).length : 0;
      expect(afterFiles).toBe(beforeFiles); // Not placed in active org storage!

      const quarantineOrgDir = path.join(process.env.STORAGE_QUARANTINE_ROOT, orgId, 'resumes');
      expect(fs.existsSync(quarantineOrgDir)).toBe(true);
      const qFiles = fs.readdirSync(quarantineOrgDir);
      expect(qFiles.some((f) => f.endsWith('.quarantine'))).toBe(true);
      expect(qFiles.some((f) => f.endsWith('.quarantine.meta.json'))).toBe(true);
    } finally {
      await new Promise((r) => infectedServer.server.close(r));
    }

    // 3. Scanner timeout -> fail-closed 503
    const slowServer = await startMockClamAvServer(async () => {
      // intentionally hang past timeout
    });
    process.env.CLAMAV_PORT = String(slowServer.port);
    process.env.MALWARE_SCAN_TIMEOUT_MS = '120';

    try {
      const timeoutApply = await request(app)
        .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
        .field('fullName', 'Timeout Applicant')
        .field('email', 'timeout@test.io')
        .field('mobileNumber', '+1-555-3003')
        .field('location', 'Chicago')
        .field('totalExperienceYears', '3')
        .field('skills', 'Python')
        .attach('resume', VALID_PDF, 'timeout.pdf');
      expect(timeoutApply.status).toBe(503);
      expect(timeoutApply.body.error.code).toBe('MALWARE_SCANNER_UNAVAILABLE');
    } finally {
      await new Promise((r) => slowServer.server.close(r));
    }

    // 4. Scanner unavailable / unreachable port -> fail-closed 503
    process.env.CLAMAV_PORT = '59999';
    process.env.MALWARE_SCAN_TIMEOUT_MS = '500';
    const unavailableApply = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .field('fullName', 'Down Scanner')
      .field('email', 'down@test.io')
      .field('mobileNumber', '+1-555-3004')
      .field('location', 'Miami')
      .field('totalExperienceYears', '3')
      .field('skills', 'Go')
      .attach('resume', VALID_PDF, 'down.pdf');
    expect(unavailableApply.status).toBe(503);
    expect(unavailableApply.body.error.code).toBe('MALWARE_SCANNER_UNAVAILABLE');

    // 5. Required=true while Mode=DISABLED -> fail-closed 503
    process.env.MALWARE_SCANNER_MODE = 'DISABLED';
    process.env.MALWARE_SCAN_REQUIRED = 'true';
    const disabledRequired = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .field('fullName', 'Req Disabled')
      .field('email', 'reqdisabled@test.io')
      .field('mobileNumber', '+1-555-3005')
      .field('location', 'Miami')
      .field('totalExperienceYears', '3')
      .field('skills', 'Go')
      .attach('resume', VALID_PDF, 'reqdisabled.pdf');
    expect(disabledRequired.status).toBe(503);
    expect(disabledRequired.body.error.code).toBe('MALWARE_SCANNER_UNAVAILABLE');
  });

  it('D. Storage reliability: auto-creates missing dirs, cleans up orphaned files on DB failure/duplicate, and masks disk errors cleanly', async () => {
    const { orgId, jobId } = await createOrgWithPublishedJob('ReliantOrg', 'reliant');

    // 1. Auto-creates missing nested local root
    const nestedRoot = path.join(process.env.STORAGE_LOCAL_ROOT, 'auto-nested-sub');
    fs.rmSync(nestedRoot, { recursive: true, force: true });
    process.env.STORAGE_LOCAL_ROOT = nestedRoot;

    const firstApply = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .field('fullName', 'Reliability Candidate')
      .field('email', 'rel@test.io')
      .field('mobileNumber', '+1-555-4001')
      .field('location', 'Remote')
      .field('totalExperienceYears', '5')
      .field('skills', 'SQL')
      .attach('resume', VALID_PDF, 'first.pdf');
    expect(firstApply.status).toBe(201);
    const resumeDir = path.join(nestedRoot, orgId, 'resumes');
    expect(fs.readdirSync(resumeDir)).toHaveLength(1);

    // 2. Duplicate submission leaves ZERO orphaned file
    const dupApply = await request(app)
      .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
      .field('fullName', 'Reliability Candidate')
      .field('email', 'rel@test.io')
      .field('mobileNumber', '+1-555-4001')
      .field('location', 'Remote')
      .field('totalExperienceYears', '5')
      .field('skills', 'SQL')
      .attach('resume', VALID_PDF, 'duplicate.pdf');
    expect(dupApply.status).toBe(409);
    expect(fs.readdirSync(resumeDir)).toHaveLength(1);

    // 3. Simulated DB failure during transaction deletes orphaned uploaded file (pure SQL constraint, no plpgsql)
    const sequelize = getSequelize();
    await sequelize.query(`
      ALTER TABLE application_documents
      ADD CONSTRAINT chk_fail_doc_test CHECK (file_name <> 'rollback.pdf');
    `);

    try {
      const rollbackApply = await request(app)
        .post(`/api/v1/applications/public/jobs/${jobId}/apply`)
        .field('fullName', 'Rollback Candidate')
        .field('email', 'rollback@test.io')
        .field('mobileNumber', '+1-555-4002')
        .field('location', 'Remote')
        .field('totalExperienceYears', '5')
        .field('skills', 'SQL')
        .attach('resume', VALID_PDF, 'rollback.pdf');
      expect([400, 500]).toContain(rollbackApply.status);
      // Still only 1 physical file (first.pdf); rollback.pdf was deleted cleanly!
      expect(fs.readdirSync(resumeDir)).toHaveLength(1);
      const orphanCand = await getModels().Candidate.findOne({ where: { email: 'rollback@test.io' } });
      expect(orphanCand).toBeNull();
    } finally {
      await sequelize.query(`
        ALTER TABLE application_documents DROP CONSTRAINT IF EXISTS chk_fail_doc_test;
      `);
    }

    // 4. Write failure when storage root is invalid file -> safe 503 without exposing OS path
    const blockingFile = path.join(process.env.STORAGE_LOCAL_ROOT, 'not-a-dir-file');
    fs.mkdirSync(path.dirname(blockingFile), { recursive: true });
    fs.writeFileSync(blockingFile, 'lock');
    process.env.STORAGE_LOCAL_ROOT = blockingFile;

    await expect(
      storageAdapter.saveFile({
        organisationId: orgId,
        folder: 'resumes',
        originalName: 'err.pdf',
        mimeType: 'application/pdf',
        buffer: VALID_PDF
      })
    ).rejects.toMatchObject({ statusCode: 503, code: 'STORAGE_UNAVAILABLE' });
  });

  it('E. Cloudinary driver & config validation: blocks S3_COMPATIBLE/invalid drivers, enforces authenticated uploads, handles invalid credentials & deletion failure', async () => {
    // 1. Fail-fast config validation (S3 rejected; Cloudinary credentials required; HTTPS prefix in production)
    expect(() =>
      env.validateStorageConfiguration({ ...env.storage, driver: 'S3_COMPATIBLE' }, 'development')
    ).toThrow(/Unsupported STORAGE_DRIVER/);

    expect(() =>
      env.validateStorageConfiguration({ ...env.storage, driver: 'INVALID_DRIVER' }, 'development')
    ).toThrow(/Unsupported STORAGE_DRIVER/);

    expect(() =>
      env.validateStorageConfiguration(
        {
          ...env.storage,
          driver: 'CLOUDINARY',
          cloudinary: { cloudName: '', apiKey: '', apiSecret: '', downloadUrlTtlSeconds: 120, uploadTimeoutMs: 5000 }
        },
        'development'
      )
    ).toThrow(/CLOUDINARY_CLOUD_NAME/);

    expect(() =>
      env.validateStorageConfiguration(
        {
          ...env.storage,
          driver: 'CLOUDINARY',
          cloudinary: {
            cloudName: 'prod-cloud',
            apiKey: '12345',
            apiSecret: 'secret-val',
            uploadPrefix: 'http://insecure.cloudinary.internal',
            downloadUrlTtlSeconds: 120,
            uploadTimeoutMs: 5000
          }
        },
        'production'
      )
    ).toThrow(/HTTPS/);

    expect(() =>
      env.validateStorageConfiguration(
        { ...env.storage, driver: 'LOCAL_SECURE', allowLocalInProduction: false },
        'production'
      )
    ).toThrow(/ALLOW_LOCAL_STORAGE_IN_PRODUCTION/);

    // 2. Official Cloudinary SDK upload, authenticated asset enforcement, short-lived download URL, credential errors, and deletion failures
    const cldMock = createMockCloudinaryHarness();
    process.env.STORAGE_DRIVER = 'CLOUDINARY';
    process.env.CLOUDINARY_CLOUD_NAME = 'nexnuv-mock-cloud';
    process.env.CLOUDINARY_API_KEY = '9988776655';
    process.env.CLOUDINARY_API_SECRET = 'mock_cloudinary_api_secret_do_not_expose';
    process.env.CLOUDINARY_FOLDER_PREFIX = 'nexnuv-rec-test';
    delete process.env.CLOUDINARY_UPLOAD_PREFIX;
    process.env.CLOUDINARY_DOWNLOAD_TTL_SECONDS = '120';

    try {
      const savedPdf = await storageAdapter.saveFile({
        organisationId: '11111111-1111-4111-8111-111111111111',
        folder: 'offers',
        originalName: 'offer.pdf',
        mimeType: 'application/pdf',
        buffer: VALID_PDF
      });

      expect(savedPdf.storageProvider).toBe('CLOUDINARY');
      expect(savedPdf.storageVisibility).toBe('AUTHENTICATED');
      expect(savedPdf.cloudinaryResourceType).toBe('raw');
      expect(savedPdf.cloudinaryPublicId).toMatch(/^nexnuv-rec-test\/11111111-1111-4111-8111-111111111111\/offers\/.+offer\.pdf$/);

      const storedMockAsset = cldMock.assets.get(savedPdf.cloudinaryPublicId);
      expect(storedMockAsset).toBeDefined();
      expect(storedMockAsset.type).toBe('authenticated');
      expect(storedMockAsset.accessMode).toBe('authenticated');

      // Image upload uses 'image' resource_type and strips double extension in public_id
      const savedPng = await storageAdapter.saveFile({
        organisationId: null,
        folder: 'subscription-proofs',
        originalName: 'wire.png',
        mimeType: 'image/png',
        buffer: VALID_PNG
      });
      expect(savedPng.cloudinaryResourceType).toBe('image');
      expect(savedPng.cloudinaryFormat).toBe('png');
      expect(savedPng.cloudinaryPublicId).not.toMatch(/\.png$/);

      // Private signed Cloudinary URL contains signature & expires_at
      const signedCldUrl = storageAdapter.generateCloudinaryPrivateUrl({
        cloudinaryPublicId: savedPdf.cloudinaryPublicId,
        cloudinaryResourceType: savedPdf.cloudinaryResourceType,
        cloudinaryFormat: savedPdf.cloudinaryFormat,
        expiresInSeconds: 120
      });
      expect(signedCldUrl).toContain('https://api.cloudinary.com/v1_1/nexnuv-mock-cloud/raw/download');
      expect(signedCldUrl).toContain('type=authenticated');
      expect(signedCldUrl).toContain('signature=');
      expect(signedCldUrl).toContain('expires_at=');

      // Fetch private asset bytes via adapter
      const fetchedPdf = await storageAdapter.readFileBuffer(savedPdf.storageKey, savedPdf);
      expect(fetchedPdf.equals(VALID_PDF)).toBe(true);

      // Invalid Cloudinary credentials rejected cleanly without exposing API secret
      cldMock.setFailMode('AUTH_401');
      let authErr;
      try {
        await storageAdapter.saveFile({
          organisationId: '11111111-1111-4111-8111-111111111111',
          folder: 'offers',
          originalName: 'bad-creds.pdf',
          mimeType: 'application/pdf',
          buffer: VALID_PDF
        });
      } catch (err) {
        authErr = err;
      }
      expect(authErr).toMatchObject({ statusCode: 503, code: 'STORAGE_AUTH_ERROR' });
      expect(JSON.stringify(authErr)).not.toContain('mock_cloudinary_api_secret_do_not_expose');

      // Deletion failure handled safely (returns { deleted: false } without crashing caller)
      cldMock.setFailMode('DELETE_500');
      const failedDel = await storageAdapter.deleteFile(savedPdf.storageKey, savedPdf);
      expect(failedDel.deleted).toBe(false);
      expect(cldMock.assets.has(savedPdf.cloudinaryPublicId)).toBe(true);

      // Normal deletion removes asset from Cloudinary mock
      cldMock.setFailMode(null);
      const okDel = await storageAdapter.deleteFile(savedPdf.storageKey, savedPdf);
      expect(okDel.deleted).toBe(true);
      expect(cldMock.assets.has(savedPdf.cloudinaryPublicId)).toBe(false);
      await expect(storageAdapter.readFileBuffer(savedPdf.storageKey, savedPdf)).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      cldMock.restore();
    }
  });

  it('F. End-to-end Cloudinary PostgreSQL workflow: stores Cloudinary metadata, blocks cross-org/unauthorized downloads, and rolls back orphans cleanly', async () => {
    const orgA = await createOrgWithPublishedJob('CloudOrgA', 'cloudorga');
    const orgB = await createOrgWithPublishedJob('CloudOrgB', 'cloudorgb');

    const cand1Verified = await registerAndVerifyCandidate(request, app, {
      fullName: 'Clara Candidate',
      email: 'clara@cloud.io',
      password: 'CandPassword#1'
    });
    const cand2Verified = await registerAndVerifyCandidate(request, app, {
      fullName: 'Dan Candidate',
      email: 'dan@cloud.io',
      password: 'CandPassword#2'
    });

    const cldMock = createMockCloudinaryHarness();
    process.env.STORAGE_DRIVER = 'CLOUDINARY';
    process.env.CLOUDINARY_CLOUD_NAME = 'nexnuv-e2e-cloud';
    process.env.CLOUDINARY_API_KEY = '7766554433';
    process.env.CLOUDINARY_API_SECRET = 'e2e_secret_key_val';
    process.env.CLOUDINARY_FOLDER_PREFIX = 'nexnuv-e2e';
    delete process.env.CLOUDINARY_UPLOAD_PREFIX;

    try {
      // 1. Submit application stored in Cloudinary
      const applyRes = await request(app)
        .post(`/api/v1/applications/public/jobs/${orgA.jobId}/apply`)
        .set('Authorization', `Bearer ${cand1Verified.token}`)
        .field('fullName', 'Clara Candidate')
        .field('email', 'clara@cloud.io')
        .field('mobileNumber', '+1-555-8801')
        .field('location', 'San Jose')
        .field('totalExperienceYears', '5')
        .field('skills', 'Cloudinary,Security')
        .attach('resume', VALID_PDF, 'clara-cloudinary-cv.pdf');
      expect(applyRes.status).toBe(201);

      const appId = applyRes.body.data.applicationId;
      const docRow = await getModels().ApplicationDocument.findOne({ where: { applicationId: appId } });
      expect(docRow.storageProvider).toBe('CLOUDINARY');
      expect(docRow.storageVisibility).toBe('AUTHENTICATED');
      expect(docRow.cloudinaryResourceType).toBe('raw');
      expect(docRow.cloudinaryPublicId).toContain('clara-cloudinary-cv.pdf');
      expect(docRow.cloudinaryVersion).toBe('1794396500');
      expect(docRow.checksumSha256).toHaveLength(64);
      expect(cldMock.assets.has(docRow.cloudinaryPublicId)).toBe(true);

      // 2. Detail API exposes ONLY backend download token path, NEVER raw Cloudinary URL or API keys
      const portalRes = await request(app)
        .get('/api/v1/portal/overview')
        .set('Authorization', `Bearer ${cand1Verified.token}`);
      expect(portalRes.status).toBe(200);
      const docDownloadUrl = portalRes.body.data.applications[0].documents[0].downloadUrl;
      expect(docDownloadUrl).toMatch(/^\/api\/v1\/files\/download\?token=/);
      expect(JSON.stringify(portalRes.body)).not.toContain('e2e_secret_key_val');
      expect(JSON.stringify(portalRes.body)).not.toContain('api.cloudinary.com');

      // 3. Authorized candidate & Org A admin CAN download; unauthorized candidate & Org B CANNOT
      const candOk = await request(app)
        .get(docDownloadUrl)
        .set('Authorization', `Bearer ${cand1Verified.token}`);
      expect(candOk.status).toBe(200);
      expect(Buffer.from(candOk.body).equals(VALID_PDF)).toBe(true);
      expect(candOk.headers['cache-control']).toBe('private, no-store, no-cache');

      const unauthCand = await request(app)
        .get(docDownloadUrl)
        .set('Authorization', `Bearer ${cand2Verified.token}`);
      expect(unauthCand.status).toBe(403);
      expect(unauthCand.body.error.code).toBe('CROSS_CANDIDATE_DENIED');

      const crossOrg = await request(app)
        .get(docDownloadUrl)
        .set('Authorization', `Bearer ${orgB.adminToken}`);
      expect(crossOrg.status).toBe(403);
      expect(crossOrg.body.error.code).toBe('CROSS_TENANT_DENIED');

      // 4. DB transaction failure rolls back & destroys orphaned Cloudinary asset
      const assetCountBeforeRollback = cldMock.assets.size;
      const sequelize = getSequelize();
      await sequelize.query(`
        ALTER TABLE application_documents
        ADD CONSTRAINT chk_fail_cloudinary_rollback CHECK (file_name <> 'rollback-cloud.pdf');
      `);
      try {
        const failApply = await request(app)
          .post(`/api/v1/applications/public/jobs/${orgA.jobId}/apply`)
          .field('fullName', 'Rollback Cloud')
          .field('email', 'rb.cloud@test.io')
          .field('mobileNumber', '+1-555-8802')
          .field('location', 'Austin')
          .field('totalExperienceYears', '3')
          .field('skills', 'Node')
          .attach('resume', VALID_PDF, 'rollback-cloud.pdf');
        expect([400, 500]).toContain(failApply.status);
        expect(cldMock.assets.size).toBe(assetCountBeforeRollback);
        expect(cldMock.destroySpy).toHaveBeenCalled();
      } finally {
        await sequelize.query(`
          ALTER TABLE application_documents DROP CONSTRAINT IF EXISTS chk_fail_cloudinary_rollback;
        `);
      }
    } finally {
      cldMock.restore();
    }
  });
});
