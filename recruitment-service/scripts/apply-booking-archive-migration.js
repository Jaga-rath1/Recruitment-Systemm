const { getSequelize } = require('../src/config/database');
const { MIGRATION_SQL } = require('../src/db/migrations/20261117000001-add-subscription-booking-archive-lifecycle');

async function main() {
  const sequelize = getSequelize();
  console.log('[Migration] Applying subscription booking archive columns to database...');
  await sequelize.query(MIGRATION_SQL);
  console.log('✔ Migration applied successfully.');

  const [cols] = await sequelize.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'subscriptions' 
      AND column_name IN ('is_archived', 'archived_at', 'archived_by', 'archive_reason')
    ORDER BY column_name;
  `);
  console.log('Confirmed columns in subscriptions table:', cols);
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
