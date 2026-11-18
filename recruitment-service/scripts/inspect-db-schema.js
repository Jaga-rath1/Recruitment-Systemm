const { getSequelize } = require('../src/config/database');

async function main() {
  const s = getSequelize();
  const [cols] = await s.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'subscriptions' 
    ORDER BY ordinal_position;
  `);
  console.log('Subscriptions columns:', cols.map(c => `${c.column_name} (${c.data_type})`));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
