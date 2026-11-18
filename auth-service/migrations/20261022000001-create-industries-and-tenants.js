'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create industries table
    await queryInterface.createTable('industries', {
      id: {
        type: Sequelize.STRING(20),
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // 2. Create tenants table
    await queryInterface.createTable('tenants', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      industry_id: {
        type: Sequelize.STRING(20),
        allowNull: false,
        references: {
          model: 'industries',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('tenants', ['industry_id']);

    // 3. Seed predefined platform industries idempotently
    await queryInterface.bulkInsert(
      'industries',
      [
        { id: 'IND01', name: 'Healthcare', created_at: new Date(), updated_at: new Date() },
        { id: 'IND02', name: 'Banking', created_at: new Date(), updated_at: new Date() },
        { id: 'IND03', name: 'IT Services', created_at: new Date(), updated_at: new Date() },
        { id: 'IND04', name: 'Education', created_at: new Date(), updated_at: new Date() },
        { id: 'IND05', name: 'Manufacturing', created_at: new Date(), updated_at: new Date() },
      ],
      { ignoreDuplicates: true }
    );

    // 4. Seed initial tenants for the catalog
    await queryInterface.bulkInsert(
      'tenants',
      [
        {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'Nexnuv Enterprise IT',
          industry_id: 'IND03',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Metro Health System',
          industry_id: 'IND01',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Apex Global Bank',
          industry_id: 'IND02',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: '44444444-4444-4444-4444-444444444444',
          name: 'Pacific University',
          industry_id: 'IND04',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: '55555555-5555-5555-5555-555555555555',
          name: 'Titan Manufacturing Corp',
          industry_id: 'IND05',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: '99999999-9999-9999-9999-999999999999',
          name: 'Logistics & Supply Co',
          industry_id: 'IND05',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      { ignoreDuplicates: true }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('tenants');
    await queryInterface.dropTable('industries');
  },
};
