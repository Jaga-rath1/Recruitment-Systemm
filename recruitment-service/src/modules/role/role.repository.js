const { Op } = require('sequelize');
const { getModels } = require('../../config/database');
const { toPlain, toPlainList } = require('../../utils/sequelizeHelpers');

async function listPermissions() {
  const { RecruitmentPermission } = getModels();
  const rows = await RecruitmentPermission.findAll({
    order: [
      ['module', 'ASC'],
      ['code', 'ASC']
    ]
  });
  return toPlainList(rows);
}

async function listRoles(organisationId) {
  const { RecruitmentRole, RecruitmentRolePermission, RecruitmentPermission, EmployeeRoleAssignment } = getModels();
  const roles = await RecruitmentRole.findAll({
    where: { organisationId },
    include: [
      {
        model: RecruitmentRolePermission,
        as: 'rolePermissions',
        include: [{ model: RecruitmentPermission, as: 'permission' }]
      }
    ],
    order: [['name', 'ASC']]
  });

  const assignments = await EmployeeRoleAssignment.findAll({
    where: { organisationId },
    attributes: ['roleId']
  });
  const countMap = new Map();
  for (const a of assignments) {
    countMap.set(a.roleId, (countMap.get(a.roleId) || 0) + 1);
  }

  return toPlainList(roles).map((r) => ({
    ...r,
    _count: { employeeAssignments: countMap.get(r.id) || 0 }
  }));
}

async function findRoleById(organisationId, roleId, transaction = null) {
  const { RecruitmentRole, RecruitmentRolePermission, RecruitmentPermission } = getModels();
  const row = await RecruitmentRole.findOne({
    where: { id: roleId, organisationId },
    include: [
      {
        model: RecruitmentRolePermission,
        as: 'rolePermissions',
        include: [{ model: RecruitmentPermission, as: 'permission' }]
      }
    ],
    transaction
  });
  return toPlain(row);
}

async function findRoleByCode(organisationId, code, transaction = null) {
  const { RecruitmentRole } = getModels();
  const row = await RecruitmentRole.findOne({
    where: { organisationId, code },
    transaction
  });
  return toPlain(row);
}

async function createRole(organisationId, data, transaction = null) {
  const { RecruitmentRole } = getModels();
  const row = await RecruitmentRole.create(
    {
      organisationId,
      code: data.code,
      name: data.name,
      description: data.description,
      isSystem: false,
      isActive: true
    },
    { transaction }
  );
  return toPlain(row);
}

async function replaceRolePermissions(organisationId, roleId, permissionIds, transaction = null) {
  const { RecruitmentRolePermission } = getModels();
  await RecruitmentRolePermission.destroy({
    where: { organisationId, roleId },
    transaction
  });

  if (permissionIds.length > 0) {
    await RecruitmentRolePermission.bulkCreate(
      permissionIds.map((permissionId) => ({
        organisationId,
        roleId,
        permissionId
      })),
      { ignoreDuplicates: true, transaction }
    );
  }

  return findRoleById(organisationId, roleId, transaction);
}

async function findPermissionsByCodes(codes, transaction = null) {
  const { RecruitmentPermission } = getModels();
  if (!codes || codes.length === 0) return [];
  const rows = await RecruitmentPermission.findAll({
    where: { code: { [Op.in]: codes } },
    transaction
  });
  return toPlainList(rows);
}

module.exports = {
  listPermissions,
  listRoles,
  findRoleById,
  findRoleByCode,
  createRole,
  replaceRolePermissions,
  findPermissionsByCodes
};
