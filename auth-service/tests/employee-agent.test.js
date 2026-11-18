'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const authService = require('../src/modules/auth/auth.service');
const { User, Role } = require('../src/models');

describe('Auth Service: Employee-Based Agent Eligibility, Tenant Isolation, and Role Promotion', () => {
  const defaultTenantId = '00000000-0000-0000-0000-000000000001';
  const otherTenantId = '11111111-1111-1111-1111-111111111111';

  test('1. listEligibleEmployees returns only active employees in the specified tenant', async () => {
    const employees = await authService.listEligibleEmployees(defaultTenantId);
    assert.ok(Array.isArray(employees), 'Must return an array');

    for (const emp of employees) {
      assert.equal(emp.organizationId, defaultTenantId, 'Must strictly belong to queried tenant');
      assert.equal(emp.role, 'employee', 'Must have employee role');
      assert.equal(emp.isActive, true, 'Must be active');
      assert.ok(emp.employeeId, 'Must have employeeId');
      assert.ok(emp.name, 'Must have name');
      assert.ok(emp.email, 'Must have email');
    }
  });

  test('2. listEligibleEmployees excludes Platform Admin, Org Admin, Manager, HR, and Agent', async () => {
    const employees = await authService.listEligibleEmployees(defaultTenantId);
    const emails = employees.map((e) => e.email.toLowerCase());

    assert.equal(emails.includes('superadmin@nexnuv.com'), false, 'super_admin must be excluded');
    assert.equal(emails.includes('admin@nexnuv.com'), false, 'org_admin must be excluded');
    assert.equal(emails.includes('manager@nexnuv.com'), false, 'manager must be excluded');
    assert.equal(emails.includes('hr@nexnuv.com'), false, 'hr must be excluded');
    assert.equal(emails.includes('agent@nexnuv.com'), false, 'agent must be excluded');
  });

  test('3. listEligibleEmployees enforces strict tenant isolation: does not leak users from other tenants', async () => {
    const tenant1Employees = await authService.listEligibleEmployees(defaultTenantId);
    const tenant2Employees = await authService.listEligibleEmployees(otherTenantId);

    const tenant1Ids = new Set(tenant1Employees.map((e) => e.userId));
    for (const emp2 of tenant2Employees) {
      assert.equal(tenant1Ids.has(emp2.userId), false, 'Tenant 2 employee must NOT appear in Tenant 1');
      assert.equal(emp2.organizationId, otherTenantId, 'Tenant 2 employee must have tenant 2 organizationId');
    }
  });

  test('4. getEmployeeForAgentRegistration validates active status, role, and tenant membership', async () => {
    const employees = await authService.listEligibleEmployees(defaultTenantId);
    if (employees.length > 0) {
      const target = employees[0];
      const verified = await authService.getEmployeeForAgentRegistration(defaultTenantId, target.userId);
      assert.equal(verified.userId, target.userId);
      assert.equal(verified.email, target.email);
      assert.equal(verified.role, 'employee');
      assert.equal(verified.organizationId, defaultTenantId);
    }
  });

  test('5. getEmployeeForAgentRegistration rejects cross-tenant employee lookup', async () => {
    const tenant2Employees = await authService.listEligibleEmployees(otherTenantId);
    if (tenant2Employees.length > 0) {
      const foreignEmployee = tenant2Employees[0];
      await assert.rejects(
        async () => {
          await authService.getEmployeeForAgentRegistration(defaultTenantId, foreignEmployee.userId);
        },
        (err) => {
          const code = err.statusCode || err.status;
          assert.equal(code, 403, 'Must reject with 403 Forbidden for cross-tenant access');
          return true;
        }
      );
    }
  });

  test('6. getEmployeeForAgentRegistration rejects non-employee roles (e.g. Org Admin or Manager)', async () => {
    const orgAdmin = await User.findOne({
      include: [{ model: Role, as: 'role', where: { name: 'org_admin' } }],
      where: { organizationId: defaultTenantId },
    });

    if (orgAdmin) {
      await assert.rejects(
        async () => {
          await authService.getEmployeeForAgentRegistration(defaultTenantId, orgAdmin.id);
        },
        (err) => {
          const code = err.statusCode || err.status;
          assert.equal(code, 400, 'Must reject with 400 for non-employee role');
          assert.ok(err.message.includes('role is org_admin') || err.message.includes('does not have the Employee role'));
          return true;
        }
      );
    }
  });

  test('7. promoteEmployeeToAgent updates role to agent while strictly preserving existing password hash and credentials', async () => {
    // Create a temporary test employee
    const employeeRole = await Role.findOne({ where: { name: 'employee' } });
    const originalPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(originalPassword, 10);
    const testEmail = `test.employee.${Date.now()}@example.com`;

    const empId = await authService.generateEmployeeId();
    const testEmployee = await User.create({
      organizationId: defaultTenantId,
      roleId: employeeRole.id,
      employeeId: empId,
      email: testEmail,
      firstName: 'Test',
      lastName: 'Eligible',
      passwordHash,
      status: 'active',
      mustChangePassword: false,
    });

    try {
      // Verify promotion
      const promoted = await authService.promoteEmployeeToAgent({
        userId: testEmployee.id,
        organizationId: defaultTenantId,
      });

      assert.ok(promoted.success, 'Promotion must succeed');
      assert.equal(promoted.user.id, testEmployee.id);
      assert.equal(promoted.user.role, 'agent');

      // Verify DB record
      const refreshedUser = await User.findByPk(testEmployee.id);
      assert.equal(refreshedUser.passwordHash, passwordHash, 'Password hash MUST NOT be modified or reset');
      assert.equal(refreshedUser.mustChangePassword, false, 'No forced password reset for existing employee');

      // Verify the employee can still log in with their original password
      const loginResult = await authService.login({
        email: testEmail,
        password: originalPassword,
      });
      assert.ok(loginResult.token, 'Must return JWT token upon login');
      assert.equal(loginResult.user.role, 'agent', 'JWT user payload must reflect agent role');
      assert.equal(loginResult.user.employeeId, empId, 'Employee ID must be present in login response');
    } finally {
      await testEmployee.destroy();
    }
  });

  test('8. promoteEmployeeToAgent rejects cross-tenant promotion attempt', async () => {
    const employees = await authService.listEligibleEmployees(defaultTenantId);
    if (employees.length > 0) {
      const emp = employees[0];
      await assert.rejects(
        async () => {
          await authService.promoteEmployeeToAgent({
            userId: emp.userId,
            organizationId: otherTenantId, // wrong tenant
          });
        },
        (err) => {
          const code = err.statusCode || err.status;
          assert.equal(code, 403, 'Must return 403 Forbidden for cross-tenant promotion');
          return true;
        }
      );
    }
  });
});
