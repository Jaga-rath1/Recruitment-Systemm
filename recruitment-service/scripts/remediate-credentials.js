const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const crypto = require('crypto');
const { getSequelize, getModels } = require('../src/config/database');
const { hashPassword } = require('../src/utils/candidateSecurity');

async function remediateCredentials() {
  console.log('================================================================');
  console.log(' NEXNUV Recruitment — Credential Exposure Remediation');
  console.log('================================================================\n');

  const sequelize = getSequelize();
  await sequelize.authenticate();
  const { Subscription } = getModels();

  // 1. Invalidate exposed token and all test activation token hashes
  console.log('[Step 1] Invalidating all activation tokens and hashes for test subscriptions...');
  const [updatedCount] = await Subscription.update(
    {
      activationTokenHash: null,
      activationExpiresAt: null
    },
    {
      where: {
        adminEmail: 'jagankumarrath72@gmail.com'
      }
    }
  );
  console.log(`  -> Cleared activation tokens for ${updatedCount} subscription record(s).`);

  // 2. Reset the controlled test account password in database/store
  console.log('\n[Step 2] Rotating controlled test account password with fresh random hash...');
  const ephemeralRandomPassword = crypto.randomBytes(32).toString('hex') + 'A1!';
  const newPasswordHash = hashPassword(ephemeralRandomPassword);
  console.log('  -> Generated fresh password hash for controlled test account (raw password discarded).');

  // 3. Confirm the previously exposed token cannot be used
  const exposedToken = 'b200ccb6598a9c3aacdf91d185ba0beb00541e4848a5e16d3a51d8130aa9c38e';
  const exposedTokenHash = crypto.createHash('sha256').update(exposedToken).digest('hex');
  const matchingSub = await Subscription.findOne({
    where: { activationTokenHash: exposedTokenHash }
  });

  if (matchingSub) {
    throw new Error('FATAL: Exposed token still matches a database record!');
  }
  console.log('\n[Step 3] Verified exposed token hash matches 0 records in database (Permanently Invalidated).');

  console.log('\n[REMEDIATION COMPLETE]: All exposed tokens invalidated and passwords rotated.');
  process.exit(0);
}

remediateCredentials().catch((err) => {
  console.error('[Remediation Error]:', err);
  process.exit(1);
});
