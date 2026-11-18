const fs = require('fs');
const net = require('net');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const { setTestDatabaseUrl, disconnectDatabase, getSequelize } = require('../../src/config/database');
const { seedPermissionCatalog } = require('../../src/db/seed');
const { INIT_SQL } = require('../../src/db/migrations/20261110000001-init-recruitment-schema');
const { MIGRATION_SQL: ADD_CANDIDATE_ACCOUNTS_SQL } = require('../../src/db/migrations/20261111000001-add-candidate-accounts-and-indexes');
const { MIGRATION_SQL: ADD_DOC_SECURITY_SQL } = require('../../src/db/migrations/20261111000002-add-document-security-metadata');
const { MIGRATION_SQL: ADD_CLOUDINARY_META_SQL } = require('../../src/db/migrations/20261111000003-add-cloudinary-document-metadata');
const { MIGRATION_SQL: ADD_CANDIDATE_IDENTITY_SQL } = require('../../src/db/migrations/20261112000001-add-candidate-identity-lifecycle');
const { MIGRATION_SQL: ADD_TRIAL_SQL } = require('../../src/db/migrations/20261113000001-add-trial-and-tiered-plans');
const { MIGRATION_SQL: ADD_PROVISIONING_LIFECYCLE_SQL } = require('../../src/db/migrations/20261114000001-add-provisioning-lifecycle');
const { MIGRATION_SQL: ADD_PAYMENT_VOID_LIFECYCLE_SQL } = require('../../src/db/migrations/20261115000001-add-payment-void-and-archive-lifecycle');
const { MIGRATION_SQL: ADD_NOTIFICATION_HISTORY_SQL } = require('../../src/db/migrations/20261116000001-add-recruitment-notification-history');
const { MIGRATION_SQL: ADD_SUBSCRIPTION_BOOKING_ARCHIVE_SQL } = require('../../src/db/migrations/20261117000001-add-subscription-booking-archive-lifecycle');
const { MIGRATION_SQL: ADD_EMPLOYEE_INVITATION_LIFECYCLE_SQL } = require('../../src/db/migrations/20261117000002-add-employee-invitation-lifecycle');
const { MIGRATION_SQL: ADD_SUBSCRIPTION_CANCELLATION_AND_JOB_GOVERNANCE_SQL } = require('../../src/db/migrations/20261117000003-add-subscription-cancellation-and-job-governance');
const authAdapter = require('../../src/integrations/auth/auth.adapter');
const employeeAdapter = require('../../src/integrations/employee/employee.adapter');
const organisationAdapter = require('../../src/integrations/organisation/organisation.adapter');
const notificationAdapter = require('../../src/integrations/notification/notification.adapter');
const platformAdminAdapter = require('../../src/integrations/platform-admin/platformAdmin.adapter');
const hrmsAdapter = require('../../src/integrations/hrms/hrms.adapter');
const emailAdapter = require('../../src/integrations/email/email.adapter');
const { clearProcessedEventCache } = require('../../src/middleware/webhookAuth');

let pgliteDb = null;
let socketServer = null;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const minPort = 24000;
    const maxPort = 29000;
    const candidatePort = Math.floor(Math.random() * (maxPort - minPort)) + minPort;
    const srv = net.createServer();
    srv.unref();
    srv.on('error', () => {
      getFreePort().then(resolve, reject);
    });
    srv.listen(candidatePort, '127.0.0.1', () => {
      srv.close(() => resolve(candidatePort));
    });
  });
}

async function startTestDatabase() {
  process.env.NODE_ENV = 'test';
  process.env.INTEGRATION_MODE = 'standalone';
  process.env.STORAGE_LOCAL_ROOT = path.resolve(__dirname, '../../storage-test');
  process.env.TREASURY_BANK_NAME = process.env.TREASURY_BANK_NAME || 'Reserve Trust Bank';
  process.env.TREASURY_ACCOUNT_NUMBER = process.env.TREASURY_ACCOUNT_NUMBER || '987654321012';
  process.env.TREASURY_IFSC_CODE = process.env.TREASURY_IFSC_CODE || 'RSTB0001001';
  process.env.TREASURY_UPI_ID = process.env.TREASURY_UPI_ID || 'nexnuv@rstb';
  process.env.TREASURY_BENEFICIARY_NAME = process.env.TREASURY_BENEFICIARY_NAME || 'NEXNUV Technologies Pvt. Ltd.';
  process.env.NOTIFICATION_WEBHOOK_SECRET = process.env.NOTIFICATION_WEBHOOK_SECRET || 'test_webhook_signing_secret_2026';
  process.env.RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || 'whsec_test_secret_for_vitest_2026_demo';
  process.env.WEBHOOK_TOLERANCE_SECONDS = process.env.WEBHOOK_TOLERANCE_SECONDS || '300';
  process.env.EMAIL_PROVIDER = 'DISABLED';

  pgliteDb = new PGlite();
  await pgliteDb.waitReady;
  await pgliteDb.exec(INIT_SQL);
  await pgliteDb.exec(ADD_CANDIDATE_ACCOUNTS_SQL);
  await pgliteDb.exec(ADD_DOC_SECURITY_SQL);
  await pgliteDb.exec(ADD_CLOUDINARY_META_SQL);
  await pgliteDb.exec(ADD_CANDIDATE_IDENTITY_SQL);
  await pgliteDb.exec(ADD_TRIAL_SQL);
  await pgliteDb.exec(ADD_PROVISIONING_LIFECYCLE_SQL);
  await pgliteDb.exec(ADD_PAYMENT_VOID_LIFECYCLE_SQL);
  await pgliteDb.exec(ADD_NOTIFICATION_HISTORY_SQL);
  await pgliteDb.exec(ADD_SUBSCRIPTION_BOOKING_ARCHIVE_SQL);
  await pgliteDb.exec(ADD_EMPLOYEE_INVITATION_LIFECYCLE_SQL);
  await pgliteDb.exec(ADD_SUBSCRIPTION_CANCELLATION_AND_JOB_GOVERNANCE_SQL);

  const port = await getFreePort();
  socketServer = new PGLiteSocketServer({
    db: pgliteDb,
    host: '127.0.0.1',
    port
  });
  await socketServer.start();

  const conn = socketServer.getServerConn();
  const databaseUrl = `postgresql://postgres:postgres@${conn}/postgres`;
  await setTestDatabaseUrl(databaseUrl);
  await seedPermissionCatalog();

  return { db: pgliteDb, databaseUrl };
}

async function resetTestState() {
  if (pgliteDb) {
    await getSequelize().query(`
      TRUNCATE TABLE
        recruitment_audit_logs,
        joining_records,
        offer_documents,
        offers,
        interview_feedback,
        interview_assignments,
        interviews,
        application_stage_history,
        application_documents,
        applications,
        candidates,
        candidate_accounts,
        job_publications,
        jobs,
        job_sources,
        employee_role_assignments,
        recruitment_role_permissions,
        recruitment_roles,
        subscription_payments,
        subscriptions,
        recruitment_notification_history
      RESTART IDENTITY CASCADE;
    `);
  }

  authAdapter.clearStandaloneUsers();
  organisationAdapter.clearStandaloneOrganisations();
  employeeAdapter.clearStandaloneEmployeeStore();
  notificationAdapter.clearDispatchedNotifications();
  platformAdminAdapter.clearStandaloneVerificationLog();
  hrmsAdapter.clearStandaloneHrmsJobs();
  emailAdapter.clearTestEmailTransport();
  clearProcessedEventCache();
}

async function stopTestDatabase() {
  await disconnectDatabase();
  if (socketServer) {
    await socketServer.stop();
    socketServer = null;
  }
  if (pgliteDb) {
    await pgliteDb.close();
    pgliteDb = null;
  }
  const storageTestDir = path.resolve(__dirname, '../../storage-test');
  fs.rmSync(storageTestDir, { recursive: true, force: true });
}

module.exports = {
  startTestDatabase,
  resetTestState,
  stopTestDatabase
};
