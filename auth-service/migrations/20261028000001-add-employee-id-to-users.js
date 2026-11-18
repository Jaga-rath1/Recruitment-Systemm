'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create sequence for employee_id if it doesn't exist
    await queryInterface.sequelize.query(`
      CREATE SEQUENCE IF NOT EXISTS employee_id_seq START WITH 1 INCREMENT BY 1;
    `);

    // 2. Add employee_id column to users table if not exists
    const [cols] = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'employee_id';
    `);

    if (cols.length === 0) {
      await queryInterface.addColumn('users', 'employee_id', {
        type: Sequelize.STRING(50),
        allowNull: true,
      });
    }

    // 3. Backfill existing users with sequential EMP001, EMP002, etc. ordered by created_at
    const [users] = await queryInterface.sequelize.query(`
      SELECT id, employee_id 
      FROM users 
      WHERE employee_id IS NULL 
      ORDER BY created_at ASC;
    `);

    for (const u of users) {
      await queryInterface.sequelize.query(`
        UPDATE users 
        SET employee_id = 'EMP' || LPAD(nextval('employee_id_seq')::TEXT, 3, '0')
        WHERE id = :id AND employee_id IS NULL;
      `, {
        replacements: { id: u.id },
      });
    }

    // 4. Create index on employee_id
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_users_org_employee ON users(organization_id, employee_id);
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'employee_id');
    await queryInterface.sequelize.query(`DROP SEQUENCE IF EXISTS employee_id_seq;`);
  },
};
