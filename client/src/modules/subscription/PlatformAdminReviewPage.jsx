import React, { useEffect, useState, useCallback } from 'react';
import {
  Check,
  XCircle,
  RefreshCw,
  Download,
  CreditCard,
  Building2,
  Bell,
  ShieldCheck,
  Clock,
  KeyRound,
  FileText,
  Eye,
  Archive
} from 'lucide-react';
import Card from '../../components/common/Card';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Tabs from '../../components/common/Tabs';
import Pagination from '../../components/common/Pagination';
import { TextAreaField } from '../../components/common/FormField';
import { subscriptionApi } from '../../api';
import { downloadAuthenticatedFile } from '../../api/httpClient';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';
import { formatAmountCents } from '../../utils/currency';

// Modular Sub-Components
import QueueFilters from '../../components/platform-admin/queue/QueueFilters';
import BookingDetailsModal from '../../components/platform-admin/queue/BookingDetailsModal';
import BookingArchiveModal from '../../components/platform-admin/queue/BookingArchiveModal';

import PaymentFilters from '../../components/platform-admin/payments/PaymentFilters';
import PaymentTable from '../../components/platform-admin/payments/PaymentTable';
import PaymentDetailsModal from '../../components/platform-admin/payments/PaymentDetailsModal';
import PaymentActionModal from '../../components/platform-admin/payments/PaymentActionModal';

import NotificationFilters from '../../components/platform-admin/notifications/NotificationFilters';
import NotificationHistoryTable from '../../components/platform-admin/notifications/NotificationHistoryTable';
import NotificationDetailsModal from '../../components/platform-admin/notifications/NotificationDetailsModal';
import NotificationClearModal from '../../components/platform-admin/notifications/NotificationClearModal';

export default function PlatformAdminReviewPage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('queue');

  // Subscriptions Queue state
  const [queueItems, setQueueItems] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueMeta, setQueueMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [queueSearch, setQueueSearch] = useState('');
  const [queueStatus, setQueueStatus] = useState('ALL');
  const [queuePage, setQueuePage] = useState(1);
  const [selectedQueueBooking, setSelectedQueueBooking] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [activationPreview, setActivationPreview] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [resendingId, setResendingId] = useState(null);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [queueArchiveFilter, setQueueArchiveFilter] = useState('ACTIVE');
  const [bookingArchiveTarget, setBookingArchiveTarget] = useState(null);
  const [bookingArchiveReason, setBookingArchiveReason] = useState('');
  const [bookingArchiveLoading, setBookingArchiveLoading] = useState(false);

  // Payments Management state
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsMeta, setPaymentsMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('ALL');
  const [paymentPage, setPaymentPage] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [paymentActionTarget, setPaymentActionTarget] = useState(null);
  const [paymentActionType, setPaymentActionType] = useState('VOID'); // 'VOID' or 'ARCHIVE'
  const [paymentActionReason, setPaymentActionReason] = useState('');
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  // Notification History state
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsMeta, setNotificationsMeta] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [notifSearch, setNotifSearch] = useState('');
  const [notifEventType, setNotifEventType] = useState('ALL');
  const [notifDeliveryStatus, setNotifDeliveryStatus] = useState('ALL');
  const [notifPage, setNotifPage] = useState(1);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [clearTarget, setClearTarget] = useState(null);
  const [isBulkClear, setIsBulkClear] = useState(false);
  const [clearReason, setClearReason] = useState('');
  const [clearLoading, setClearLoading] = useState(false);

  const loadQueue = useCallback(async (page = queuePage, search = queueSearch, status = queueStatus, archiveFilter = queueArchiveFilter) => {
    setQueueLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        ...(search ? { search: search.trim() } : {}),
        ...(status && status !== 'ALL' ? { status } : {}),
        ...(archiveFilter === 'ARCHIVED' ? { archived: 'true' } : archiveFilter === 'ALL' ? { archived: 'all' } : { archived: 'false' })
      };
      const res = await subscriptionApi.listAdminQueue(params);
      setQueueItems(res.data || []);
      if (res.meta) setQueueMeta(res.meta);
    } catch (err) {
      addToast({ title: 'Failed to load queue', message: err.message, variant: 'error' });
    } finally {
      setQueueLoading(false);
    }
  }, [queuePage, queueSearch, queueStatus, queueArchiveFilter, addToast]);

  const loadPayments = useCallback(async (page = paymentPage, search = paymentSearch, status = paymentStatus) => {
    setPaymentsLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        ...(search ? { search: search.trim() } : {}),
        ...(status && status !== 'ALL' ? { status } : {})
      };
      const res = await subscriptionApi.listPayments(params);
      setPayments(res.data || []);
      if (res.meta) setPaymentsMeta(res.meta);
    } catch (err) {
      addToast({ title: 'Failed to load payments', message: err.message, variant: 'error' });
    } finally {
      setPaymentsLoading(false);
    }
  }, [paymentPage, paymentSearch, paymentStatus, addToast]);

  const loadNotifications = useCallback(async (page = notifPage, search = notifSearch, eventType = notifEventType, deliveryStatus = notifDeliveryStatus) => {
    setNotificationsLoading(true);
    try {
      const params = {
        page,
        limit: 15,
        ...(search ? { search: search.trim() } : {}),
        ...(eventType && eventType !== 'ALL' ? { eventType } : {}),
        ...(deliveryStatus && deliveryStatus !== 'ALL' ? { deliveryStatus } : {})
      };
      const res = await subscriptionApi.listNotificationHistory(params);
      setNotifications(res.data || []);
      if (res.meta) setNotificationsMeta(res.meta);
    } catch (err) {
      addToast({ title: 'Failed to load notifications', message: err.message, variant: 'error' });
    } finally {
      setNotificationsLoading(false);
    }
  }, [notifPage, notifSearch, notifEventType, notifDeliveryStatus, addToast]);

  useEffect(() => {
    if (activeTab === 'queue') {
      loadQueue(queuePage, queueSearch, queueStatus, queueArchiveFilter);
    } else if (activeTab === 'payments') {
      loadPayments(paymentPage, paymentSearch, paymentStatus);
    } else if (activeTab === 'notifications') {
      loadNotifications(notifPage, notifSearch, notifEventType, notifDeliveryStatus);
    }
  }, [activeTab, queuePage, queueSearch, queueStatus, queueArchiveFilter, paymentPage, paymentSearch, paymentStatus, notifPage, notifSearch, notifEventType, notifDeliveryStatus, loadQueue, loadPayments, loadNotifications]);

  const handleApprove = async (sub) => {
    if (approvingId) return;
    setApprovingId(sub.id);
    try {
      const res = await subscriptionApi.verifyPayment(sub.id, { decision: 'APPROVE' });
      addToast({
        title: 'Payment Approved',
        message: `${sub.organisationName} provisioned successfully! Activation email dispatched.`,
        variant: 'success'
      });
      if (res.data?.invitationPreview) {
        setActivationPreview({
          organisationName: sub.organisationName,
          adminEmail: sub.adminEmail,
          ...res.data.invitationPreview
        });
      }
      if (selectedQueueBooking?.id === sub.id) {
        setSelectedQueueBooking(null);
      }
      loadQueue();
      if (activeTab === 'payments') loadPayments();
    } catch (err) {
      addToast({ title: 'Approval Failed', message: err.message, variant: 'error' });
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectTarget || rejectLoading) return;
    setRejectLoading(true);
    try {
      await subscriptionApi.verifyPayment(rejectTarget.id, {
        decision: 'REJECT',
        reason: rejectReason.trim() || undefined
      });
      addToast({
        title: 'Payment Rejected',
        message: `Subscription for ${rejectTarget.organisationName} rejected. Re-upload notice dispatched.`,
        variant: 'info'
      });
      const rejectedId = rejectTarget.id;
      setRejectTarget(null);
      setRejectReason('');
      if (selectedQueueBooking?.id === rejectedId) {
        setSelectedQueueBooking(null);
      }
      loadQueue();
      if (activeTab === 'payments') loadPayments();
    } catch (err) {
      addToast({ title: 'Rejection Failed', message: err.message, variant: 'error' });
    } finally {
      setRejectLoading(false);
    }
  };

  const handleResendInvitation = async (sub) => {
    if (resendingId) return;
    setResendingId(sub.id);
    try {
      const res = await subscriptionApi.resendActivationInvitation(sub.id);
      addToast({
        title: 'Invitation Resent',
        message: `Fresh activation invitation link issued for ${sub.organisationName}`,
        variant: 'success'
      });
      if (res.data?.invitationPreview) {
        setActivationPreview({
          organisationName: sub.organisationName,
          adminEmail: sub.adminEmail,
          ...res.data.invitationPreview
        });
      }
      loadQueue();
    } catch (err) {
      addToast({ title: 'Resend Failed', message: err.message, variant: 'error' });
    } finally {
      setResendingId(null);
    }
  };

  const handleArchiveBookingConfirm = async () => {
    if (!bookingArchiveTarget) return;
    if (!bookingArchiveReason || bookingArchiveReason.trim().length < 5) {
      addToast({
        title: 'Mandatory Reason Required',
        message: 'Please provide a clear reason (at least 5 characters).',
        variant: 'error'
      });
      return;
    }

    setBookingArchiveLoading(true);
    try {
      await subscriptionApi.archiveBooking(bookingArchiveTarget.id, {
        reason: bookingArchiveReason.trim()
      });
      addToast({
        title: 'Booking Removed from History',
        message: `Booking for ${bookingArchiveTarget.organisationName} removed from active view. Financial & audit records preserved.`,
        variant: 'success'
      });
      const targetId = bookingArchiveTarget.id;
      setBookingArchiveTarget(null);
      setBookingArchiveReason('');
      if (selectedQueueBooking?.id === targetId) {
        setSelectedQueueBooking(null);
      }
      if (queueArchiveFilter === 'ACTIVE') {
        setQueueItems((prev) => prev.filter((b) => b.id !== targetId));
        setQueueMeta((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      }
      loadQueue(queuePage, queueSearch, queueStatus, queueArchiveFilter);
    } catch (err) {
      addToast({ title: 'Archival Failed', message: err.message, variant: 'error' });
    } finally {
      setBookingArchiveLoading(false);
    }
  };

  const handlePaymentActionConfirm = async () => {
    if (!paymentActionTarget) return;
    if (!paymentActionReason || paymentActionReason.trim().length < 5) {
      addToast({
        title: 'Mandatory Reason Required',
        message: 'Please provide a clear reason (at least 5 characters).',
        variant: 'error'
      });
      return;
    }

    setPaymentActionLoading(true);
    try {
      if (paymentActionType === 'ARCHIVE') {
        await subscriptionApi.archivePayment(paymentActionTarget.id, { reason: paymentActionReason.trim() });
        addToast({
          title: 'Payment Archived',
          message: `Payment ${paymentActionTarget.paymentReference} was archived. Financial audit record preserved.`,
          variant: 'success'
        });
      } else {
        await subscriptionApi.voidPayment(paymentActionTarget.id, { reason: paymentActionReason.trim() });
        addToast({
          title: 'Payment Voided',
          message: `Payment ${paymentActionTarget.paymentReference} was voided. Financial audit record preserved.`,
          variant: 'success'
        });
      }
      setPaymentActionTarget(null);
      setPaymentActionReason('');
      loadPayments(paymentPage);
      loadQueue();
    } catch (err) {
      addToast({ title: `${paymentActionType} Failed`, message: err.message, variant: 'error' });
    } finally {
      setPaymentActionLoading(false);
    }
  };

  const handleDownloadProof = async (payment) => {
    if (!payment.proofDownloadUrl) return;
    setDownloadLoading(true);
    try {
      await downloadAuthenticatedFile(payment.proofDownloadUrl, payment.proofFileName || 'payment-proof');
    } catch (err) {
      addToast({ title: 'Download Failed', message: err.message, variant: 'error' });
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleClearNotificationConfirm = async () => {
    if (!clearReason || clearReason.trim().length < 5) {
      addToast({
        title: 'Mandatory Reason Required',
        message: 'Please provide a clear reason (at least 5 characters).',
        variant: 'error'
      });
      return;
    }

    setClearLoading(true);
    try {
      if (isBulkClear) {
        const res = await subscriptionApi.bulkClearNotificationHistory({
          reason: clearReason.trim(),
          eventType: notifEventType !== 'ALL' ? notifEventType : undefined
        });
        addToast({
          title: 'Notifications Cleared',
          message: `Successfully cleared ${res.data?.clearedCount || 0} notification history records.`,
          variant: 'success'
        });
      } else if (clearTarget) {
        await subscriptionApi.clearNotificationHistory(clearTarget.id, { reason: clearReason.trim() });
        addToast({
          title: 'Notification Cleared',
          message: 'Notification record soft-deleted from active history.',
          variant: 'success'
        });
      }
      setClearTarget(null);
      setIsBulkClear(false);
      setClearReason('');
      loadNotifications(notifPage);
    } catch (err) {
      addToast({ title: 'Clear Failed', message: err.message, variant: 'error' });
    } finally {
      setClearLoading(false);
    }
  };

  const formatAmount = (cents, currency = 'INR') => {
    return formatAmountCents(cents, currency);
  };

  const getActivationBadge = (sub) => {
    const status = sub.activationStatus || (sub.status === 'ACTIVE' ? 'ACTIVATION_COMPLETED' : sub.status === 'APPROVED' ? 'INVITATION_PENDING' : sub.status);
    const variants = {
      ACTIVATION_COMPLETED: { label: 'Active & Dashboard Ready', variant: 'success' },
      INVITATION_PENDING: { label: 'Invitation Pending', variant: 'warning' },
      INVITATION_EXPIRED: { label: 'Invitation Expired', variant: 'danger' },
      PAYMENT_PENDING_VERIFICATION: { label: 'Payment Under Review', variant: 'info' },
      PAYMENT_PENDING: { label: 'Awaiting Remittance', variant: 'neutral' },
      PAYMENT_REJECTED: { label: 'Payment Rejected', variant: 'danger' },
      TRIAL_ACTIVE: { label: 'Evaluation Trial', variant: 'brand' }
    };
    const info = variants[status] || { label: status, variant: 'neutral' };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const queueColumns = [
    {
      key: 'organisationName',
      label: 'Organisation',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900">{row.organisationName}</p>
          <p className="text-xs text-slate-500">
            {row.adminName} · {row.adminEmail}
          </p>
        </div>
      )
    },
    {
      key: 'plan',
      label: 'Plan & Billing',
      render: (row) => (
        <span className="text-xs font-medium text-slate-700">
          {row.billingCycle} · {formatAmount(row.amountCents, row.currency)}
        </span>
      )
    },
    {
      key: 'paymentRef',
      label: 'Payment Proof',
      render: (row) => {
        const p = row.payments?.[0];
        return p ? (
          <div>
            <p className="font-mono text-xs font-semibold text-slate-900">{p.paymentReference}</p>
            <p className="text-[11px] text-slate-500">{p.paymentMethod} · {p.status}</p>
            {p.proofDownloadUrl && (
              <button
                type="button"
                onClick={() => handleDownloadProof(p)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline"
              >
                <Download className="h-3 w-3" />
                Download Proof
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">No proof uploaded</span>
        );
      }
    },
    {
      key: 'activationState',
      label: 'Customer Lifecycle State',
      render: (row) => (
        <div className="flex flex-col gap-1 items-start">
          {row.isArchived && (
            <Badge variant="warning">Archived from History</Badge>
          )}
          {getActivationBadge(row)}
        </div>
      )
    },
    {
      key: 'actions',
      label: 'Platform Actions',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={Eye}
            onClick={() => setSelectedQueueBooking(row)}
            title="Inspect Booking & Remittance Details"
          >
            Review
          </Button>
          {!row.isArchived && (
            <Button
              size="sm"
              variant="outline"
              icon={Archive}
              className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-200"
              onClick={() => setBookingArchiveTarget(row)}
              title="Archive and remove this booking individually from active history"
            >
              Archive
            </Button>
          )}
          {row.status === 'PENDING_VERIFICATION' && !row.isArchived && (
            <>
              <Button
                size="sm"
                icon={Check}
                loading={approvingId === row.id}
                disabled={Boolean(approvingId)}
                onClick={() => handleApprove(row)}
                title="Atomically verify payment, provision tenant organisation, and dispatch activation invitation"
              >
                {approvingId === row.id ? 'Provisioning...' : 'Approve & Create Organisation'}
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={XCircle}
                disabled={Boolean(approvingId)}
                onClick={() => setRejectTarget(row)}
              >
                Reject
              </Button>
            </>
          )}
          {row.status === 'APPROVED' && !row.activatedAt && !row.isArchived && (
            <Button
              size="sm"
              variant="secondary"
              icon={RefreshCw}
              loading={resendingId === row.id}
              disabled={Boolean(resendingId)}
              onClick={() => handleResendInvitation(row)}
              title="Dispatch fresh single-use activation invitation"
            >
              {resendingId === row.id ? 'Sending...' : 'Resend Activation Email'}
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Platform Treasury & Activation Governance
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review customer payments, monitor tenant provisioning, manage notices, and govern financial lifecycle states.
          </p>
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'queue', label: 'Subscription Approvals Queue', count: queueMeta.total },
          { id: 'payments', label: 'All Payment Records', count: paymentsMeta.total },
          { id: 'notifications', label: 'Notification & Notice History', count: notificationsMeta.total }
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'queue' && (
        <Card
          title="Customer Verification Queue"
          subtitle="Review incoming remittances, verify bank references, provision tenant organisations, and dispatch activation invitations."
        >
          <QueueFilters
            searchQuery={queueSearch}
            onSearchChange={(v) => { setQueueSearch(v); setQueuePage(1); }}
            statusFilter={queueStatus}
            onStatusChange={(v) => { setQueueStatus(v); setQueuePage(1); }}
            archiveFilter={queueArchiveFilter}
            onArchiveChange={(v) => { setQueueArchiveFilter(v); setQueuePage(1); }}
            onRefresh={() => loadQueue(queuePage, queueSearch, queueStatus, queueArchiveFilter)}
            loading={queueLoading}
          />

          <DataTable
            columns={queueColumns}
            rows={queueItems}
            loading={queueLoading}
            emptyTitle="No subscriptions in queue"
            emptyDescription="No customer bookings currently match your search or filter criteria."
          />

          <div className="mt-4">
            <Pagination
              currentPage={queueMeta.page}
              totalPages={queueMeta.totalPages}
              totalItems={queueMeta.total}
              pageSize={queueMeta.limit}
              onPageChange={setQueuePage}
            />
          </div>
        </Card>
      )}

      {activeTab === 'payments' && (
        <Card
          title="Payment Records & Safe Archive"
          subtitle="Audit all customer transaction proofs. Eligible incorrect or duplicate records can be safely archived or voided with mandatory reasons."
        >
          <PaymentFilters
            searchQuery={paymentSearch}
            onSearchChange={(v) => { setPaymentSearch(v); setPaymentPage(1); }}
            statusFilter={paymentStatus}
            onStatusChange={(v) => { setPaymentStatus(v); setPaymentPage(1); }}
            onRefresh={() => loadPayments(paymentPage, paymentSearch, paymentStatus)}
          />

          <PaymentTable
            payments={payments}
            loading={paymentsLoading}
            onViewDetails={setSelectedPayment}
            onDownloadProof={handleDownloadProof}
            onOpenArchiveModal={(p) => {
              setPaymentActionTarget(p);
              setPaymentActionType('ARCHIVE');
              setPaymentActionReason('');
            }}
            onOpenVoidModal={(p) => {
              setPaymentActionTarget(p);
              setPaymentActionType('VOID');
              setPaymentActionReason('');
            }}
          />

          <div className="mt-4">
            <Pagination
              currentPage={paymentsMeta.page}
              totalPages={paymentsMeta.totalPages}
              totalItems={paymentsMeta.total}
              pageSize={paymentsMeta.limit}
              onPageChange={setPaymentPage}
            />
          </div>
        </Card>
      )}

      {activeTab === 'notifications' && (
        <Card
          title="Centralized Notice & Notification History"
          subtitle="Cross-tenant audit history of all dispatched notifications, invitation emails, and candidate alerts with token redaction."
        >
          <NotificationFilters
            searchQuery={notifSearch}
            onSearchChange={(v) => { setNotifSearch(v); setNotifPage(1); }}
            eventTypeFilter={notifEventType}
            onEventTypeChange={(v) => { setNotifEventType(v); setNotifPage(1); }}
            deliveryStatusFilter={notifDeliveryStatus}
            onDeliveryStatusChange={(v) => { setNotifDeliveryStatus(v); setNotifPage(1); }}
            onRefresh={() => loadNotifications(notifPage, notifSearch, notifEventType, notifDeliveryStatus)}
            onBulkClear={() => {
              setIsBulkClear(true);
              setClearTarget(null);
              setClearReason('');
            }}
          />

          <NotificationHistoryTable
            notifications={notifications}
            loading={notificationsLoading}
            onViewDetails={setSelectedNotification}
            onClearRecord={(n) => {
              setClearTarget(n);
              setIsBulkClear(false);
              setClearReason('');
            }}
          />

          <div className="mt-4">
            <Pagination
              currentPage={notificationsMeta.page}
              totalPages={notificationsMeta.totalPages}
              totalItems={notificationsMeta.total}
              pageSize={notificationsMeta.limit}
              onPageChange={setNotifPage}
            />
          </div>
        </Card>
      )}

      {/* Reject Reason Modal */}
      <Modal
        isOpen={Boolean(rejectTarget)}
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject Remittance Proof"
        subtitle={`Rejecting payment for ${rejectTarget?.organisationName}`}
        description={`Rejecting payment for ${rejectTarget?.organisationName}`}
      >
        <div className="space-y-4">
          <TextAreaField
            label="Rejection Reason"
            placeholder="Explain reason for rejection (e.g. Reference mismatch, blurred screenshot)..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" disabled={rejectLoading} onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={rejectLoading} disabled={rejectLoading} onClick={handleRejectSubmit}>
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* Payment Details Modal */}
      <PaymentDetailsModal
        isOpen={Boolean(selectedPayment)}
        open={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
        payment={selectedPayment}
        onDownloadProof={handleDownloadProof}
        downloadLoading={downloadLoading}
      />

      {/* Payment Void/Archive Modal */}
      <PaymentActionModal
        isOpen={Boolean(paymentActionTarget)}
        open={Boolean(paymentActionTarget)}
        onClose={() => setPaymentActionTarget(null)}
        targetPayment={paymentActionTarget}
        actionType={paymentActionType}
        reason={paymentActionReason}
        onReasonChange={setPaymentActionReason}
        onConfirm={handlePaymentActionConfirm}
        loading={paymentActionLoading}
      />

      {/* Notification Details Modal */}
      <NotificationDetailsModal
        isOpen={Boolean(selectedNotification)}
        open={Boolean(selectedNotification)}
        onClose={() => setSelectedNotification(null)}
        notification={selectedNotification}
      />

      {/* Notification Clear Modal */}
      <NotificationClearModal
        isOpen={Boolean(clearTarget) || isBulkClear}
        open={Boolean(clearTarget) || isBulkClear}
        onClose={() => {
          setClearTarget(null);
          setIsBulkClear(false);
        }}
        targetNotification={clearTarget}
        isBulk={isBulkClear}
        reason={clearReason}
        onReasonChange={setClearReason}
        onConfirm={handleClearNotificationConfirm}
        loading={clearLoading}
      />

      {/* Booking Details Modal */}
      <BookingDetailsModal
        isOpen={Boolean(selectedQueueBooking)}
        open={Boolean(selectedQueueBooking)}
        onClose={() => setSelectedQueueBooking(null)}
        booking={selectedQueueBooking}
        onApprove={handleApprove}
        onReject={setRejectTarget}
        onArchive={setBookingArchiveTarget}
        onResendInvitation={handleResendInvitation}
        onDownloadProof={handleDownloadProof}
        downloadLoading={downloadLoading}
        approving={approvingId === selectedQueueBooking?.id}
        resending={resendingId === selectedQueueBooking?.id}
      />

      {/* Individual Booking Archive Modal */}
      <BookingArchiveModal
        isOpen={Boolean(bookingArchiveTarget)}
        open={Boolean(bookingArchiveTarget)}
        onClose={() => {
          setBookingArchiveTarget(null);
          setBookingArchiveReason('');
        }}
        booking={bookingArchiveTarget}
        reason={bookingArchiveReason}
        onReasonChange={setBookingArchiveReason}
        onConfirm={handleArchiveBookingConfirm}
        loading={bookingArchiveLoading}
      />

      {/* Activation Preview Modal */}
      <Modal
        isOpen={Boolean(activationPreview)}
        open={Boolean(activationPreview)}
        onClose={() => setActivationPreview(null)}
        title="Activation Invitation Dispatched"
        subtitle={`Secure invitation generated for ${activationPreview?.organisationName}`}
        description={`Secure invitation generated for ${activationPreview?.organisationName}`}
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-200 text-emerald-900 space-y-2">
            <p className="font-semibold text-sm">Tenant Provisioned & Invitation Sent</p>
            <p>
              An activation email containing password setup instructions was dispatched to{' '}
              <strong>{activationPreview?.adminEmail}</strong>.
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 text-slate-600 space-y-1">
            <span className="font-semibold text-slate-700 block">Invitation Expiry:</span>
            <p>Token expires in 48 hours. After password setup, the administrator gains access to their dashboard.</p>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => setActivationPreview(null)}>Done</Button>
          </div>
        </div>
      </Modal>
    </PageTransition>
  );
}
