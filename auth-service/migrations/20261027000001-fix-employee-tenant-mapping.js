'use strict';

/**
 * Migration: Fix Employee and Orphaned Users Tenant Association
 * 
 * Re-maps employee@nexnuv.com and other orphaned @nexnuv.com corporate accounts
 * from the unseeded/legacy tenant ID ('2e118174-598c-4fe3-a2be-b110d6285fc1')
 * to the authoritative production IT Tenant:
 * '00000000-0000-0000-0000-000000000001' ('Nexnuv Enterprise IT', IND03 - IT Services).
 */

const IT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ORPHANED_TENANT_ID = '2e118174-598c-4fe3-a2be-b110d6285fc1';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Update employee@nexnuv.com specifically
    await queryInterface.sequelize.query(`
      UPDATE users 
      SET organization_id = :itTenantId, updated_at = NOW()
      WHERE LOWER(email) = 'employee@nexnuv.com'
    `, {
      replacements: { itTenantId: IT_TENANT_ID }
    });

    // 2. Update any other users orphaned with the non-existent tenant ID
    await queryInterface.sequelize.query(`
      UPDATE users 
      SET organization_id = :itTenantId, updated_at = NOW()
      WHERE organization_id = :orphanedTenantId
    `, {
      replacements: { itTenantId: IT_TENANT_ID, orphanedTenantId: ORPHANED_TENANT_ID }
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Reversible if necessary
    await queryInterface.sequelize.query(`
      UPDATE users 
      SET organization_id = :orphanedTenantId, updated_at = NOW()
      WHERE LOWER(email) = 'employee@nexnuv.com'
    `, {
      replacements: { orphanedTenantId: ORPHANED_TENANT_ID }
    });
  }
};
