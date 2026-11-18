'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const notificationsService = require('../src/modules/notifications/notifications.service');
const Notification = require('../src/modules/notifications/notifications.model');
const sequelize = require('../src/config/database');

test('HRMS Notification Service Compatibility Suite', async (t) => {
  await sequelize.authenticate();

  t.after(async () => {
    try {
      await sequelize.close();
    } catch {}
  });

  const orgId = '00000000-0000-0000-0000-000000000001';
  const testUserId = `hrms-employee-${Date.now()}`;

  let createdNotificationId = '';

  await t.test('1. HRMS in-app notification creation with standard payload (no email)', async () => {
    const notif = await notificationsService.create(orgId, {
      userId: testUserId,
      type: 'LEAVE_REQUEST_SUBMITTED',
      title: 'Leave Request Submitted',
      message: 'Employee John Doe requested 3 days of sick leave',
      data: { leaveId: 'leave-101', days: 3 },
    });

    assert.ok(notif);
    assert.ok(notif.id);
    assert.equal(notif.userId, testUserId);
    assert.equal(notif.organizationId, orgId);
    assert.equal(notif.type, 'LEAVE_REQUEST_SUBMITTED');
    assert.equal(notif.title, 'Leave Request Submitted');
    assert.equal(notif.message, 'Employee John Doe requested 3 days of sick leave');
    assert.equal(notif.isRead, false);
    assert.equal(notif.data?.leaveId, 'leave-101');

    createdNotificationId = notif.id;
  });

  await t.test('2. HRMS unread count returns correct count', async () => {
    const countResult = await notificationsService.unreadCount(orgId, testUserId);
    assert.ok(countResult);
    assert.ok(countResult.count >= 1);
  });

  await t.test('3. HRMS notification listing with pagination', async () => {
    const listResult = await notificationsService.list(orgId, testUserId, { page: '1', limit: '10' });
    assert.ok(listResult.items);
    assert.ok(listResult.items.length >= 1);
    assert.equal(listResult.pagination.page, 1);
    assert.equal(listResult.pagination.limit, 10);
    assert.ok(listResult.pagination.total >= 1);

    const found = listResult.items.find(n => n.id === createdNotificationId);
    assert.ok(found);
  });

  await t.test('4. HRMS mark notification as read', async () => {
    const updated = await notificationsService.markRead(orgId, testUserId, createdNotificationId);
    assert.ok(updated);
    assert.equal(updated.isRead, true);
    assert.ok(updated.readAt);
  });

  await t.test('5. HRMS mark all notifications as read', async () => {
    const result = await notificationsService.markAllRead(orgId, testUserId);
    assert.ok(result);
    assert.equal(typeof result.updated, 'number');

    const unread = await notificationsService.unreadCount(orgId, testUserId);
    assert.equal(unread.count, 0);
  });

  await t.test('6. HRMS delete notification by ID', async () => {
    await notificationsService.deleteById(orgId, testUserId, createdNotificationId);

    // Verify it no longer exists
    await assert.rejects(
      async () => {
        await notificationsService.getById(orgId, testUserId, createdNotificationId);
      },
      (err) => {
        assert.equal(err.status, 404);
        return true;
      }
    );
  });
});
