'use strict';

/**
 * Creates (or resets the password of) a platform admin account.
 *
 *   SUPER_ADMIN_EMAIL=owner@example.com SUPER_ADMIN_PASSWORD=... node scripts/create-super-admin.js
 *
 * Credentials are read from the environment so they never land in shell
 * history files or logs. The password is never printed.
 */
require('dotenv').config();
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignored if already set
}
const bcrypt = require('bcryptjs');
const { sequelize, User, Role } = require('../src/models/index');

async function main() {
  const email = (process.env.SUPER_ADMIN_EMAIL || process.argv[2] || 'platformadmin@nexnuv.com').trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || process.argv[3] || 'Welcome@123';
  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set');
  }
  if (password.length < 8) throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters');

  const role = await Role.findOne({ where: { name: 'super_admin' } });
  if (!role) throw new Error("Role 'super_admin' not found — run migrations first");

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ where: { email } });

  if (existing) {
    await existing.update({ passwordHash, roleId: role.id, organizationId: null, status: 'active', mustChangePassword: false });
    console.log(`Platform admin updated: ${email}`);
  } else {
    await User.create({ email, passwordHash, roleId: role.id, status: 'active' });
    console.log(`Platform admin created: ${email}`);
  }
}

main()
  .catch((err) => { console.error('Failed:', err.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
