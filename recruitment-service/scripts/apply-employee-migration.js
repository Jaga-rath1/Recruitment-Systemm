const { getSequelize, disconnectDatabase } = require('../src/config/database');
const { MIGRATION_SQL } = require('../src/db/migrations/20261117000002-add-employee-invitation-lifecycle');

async function main() {
  const sequelize = getSequelize();
  try {
    console.log('Applying migration 20261117000002-add-employee-invitation-lifecycle...');
    await sequelize.query(MIGRATION_SQL);
    console.log('Migration applied successfully.');

    const [cols] = await sequelize.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'employee_role_assignments'
      ORDER BY ordinal_position;
    `);
    console.log('Updated columns in employee_role_assignments:');
    for (const c of cols) {
      console.log(` - ${c.column_name} (${c.data_type})`);
    }
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    if (disconnectDatabase) await disconnectDatabase();
  }
}

main();
