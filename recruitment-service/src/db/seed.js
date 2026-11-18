const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { getModels, disconnectDatabase } = require('../config/database');
const { PERMISSION_CATALOG, DEFAULT_ORG_ROLES } = require('../modules/role/rbacDefinitions');

async function seedPermissionCatalog(transaction = null) {
  const { RecruitmentPermission } = getModels();
  const existing = await RecruitmentPermission.findAll({ transaction });
  const byCode = new Map(existing.map((p) => [p.code, p]));
  const missing = PERMISSION_CATALOG.filter((p) => !byCode.has(p.code));

  if (missing.length > 0) {
    await RecruitmentPermission.bulkCreate(missing, {
      ignoreDuplicates: true,
      transaction
    });
    const refreshed = await RecruitmentPermission.findAll({ transaction });
    return Object.fromEntries(refreshed.map((p) => [p.code, p]));
  }

  return Object.fromEntries(existing.map((p) => [p.code, p]));
}

async function seedOrganisationRoles(organisationId, transaction = null) {
  const { RecruitmentRole, RecruitmentRolePermission } = getModels();
  const permissionMap = await seedPermissionCatalog(transaction);

  const existingRoles = await RecruitmentRole.findAll({
    where: { organisationId },
    transaction
  });
  const rolesByCode = Object.fromEntries(existingRoles.map((r) => [r.code, r]));

  const missingRoles = DEFAULT_ORG_ROLES.filter((r) => !rolesByCode[r.code]);
  if (missingRoles.length > 0) {
    await RecruitmentRole.bulkCreate(
      missingRoles.map((r) => ({
        organisationId,
        code: r.code,
        name: r.name,
        description: r.description,
        isSystem: true,
        isActive: true
      })),
      { ignoreDuplicates: true, transaction }
    );
    const refreshedRoles = await RecruitmentRole.findAll({
      where: { organisationId },
      transaction
    });
    for (const r of refreshedRoles) {
      rolesByCode[r.code] = r;
    }
  }

  const rolePermRows = [];
  for (const roleDef of DEFAULT_ORG_ROLES) {
    const role = rolesByCode[roleDef.code];
    if (!role) continue;
    for (const permCode of roleDef.permissions) {
      const perm = permissionMap[permCode];
      if (!perm) continue;
      rolePermRows.push({
        organisationId,
        roleId: role.id,
        permissionId: perm.id
      });
    }
  }

  if (rolePermRows.length > 0) {
    await RecruitmentRolePermission.bulkCreate(rolePermRows, {
      ignoreDuplicates: true,
      transaction
    });
  }

  return rolesByCode;
}

async function main() {
  try {
    await seedPermissionCatalog();
    console.log(`Seeded ${PERMISSION_CATALOG.length} canonical recruitment permissions.`);
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  });
}

module.exports = {
  seedPermissionCatalog,
  seedOrganisationRoles
};

