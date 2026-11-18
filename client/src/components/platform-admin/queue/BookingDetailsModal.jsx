import React from 'react';
import {
  Download,
  Building2,
  Calendar,
  CreditCard,
  Mail,
  User,
  FileText,
  Check,
  XCircle,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Clock,
  CheckCircle2,
  Archive,
  AlertTriangle
} from 'lucide-react';
import Modal from '../../common/Modal';
import Badge from '../../common/Badge';
import Button from '../../common/Button';
import { formatAmountCents } from '../../../utils/currency';

export default function BookingDetailsModal({
  isOpen,
  open,
  onClose,
  booking,
  onApprove,
  onReject,
  onArchive,
  onResendInvitation,
  onDownloadProof,
  downloadLoading,
  approving = false,
  resending = false
}) {
  const isVisible = isOpen !== undefined ? Boolean(isOpen) : Boolean(open);
  if (!isVisible || !booking) return null;

  const latestPayment = booking.payments?.[0];
  const isPendingVerification = booking.status === 'PENDING_VERIFICATION';
  const isApproved = booking.status === 'APPROVED';
  const isActive = booking.status === 'ACTIVE';

  const statusVariants = {
    ACTIVE: 'success',
    APPROVED: 'brand',
    PENDING_VERIFICATION: 'warning',
    PENDING_PAYMENT: 'neutral',
    REJECTED: 'danger',
    EXPIRED: 'danger'
  };

  return (
    <Modal
      isOpen={isVisible}
      open={isVisible}
      onClose={onClose}
      title="Subscription Booking & Payment Review"
      subtitle={`Subscription Reference: #${booking.id.slice(0, 8).toUpperCase()}`}
      description={`Subscription Reference: #${booking.id.slice(0, 8).toUpperCase()}`}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5 text-sm">
        {/* Top Summary Card */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-4 border border-slate-200">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan & Subscription Fee</span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              {formatAmountCents(booking.amountCents, booking.currency)}
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              {booking.planCode} • {booking.billingCycle} Cycle
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lifecycle Status</span>
            <div className="mt-1 flex items-center justify-end gap-1.5">
              {booking.isArchived && (
                <Badge variant="warning">Archived</Badge>
              )}
              <Badge variant={statusVariants[booking.status] || 'neutral'}>{booking.status}</Badge>
            </div>
          </div>
        </div>

        {/* Archived Booking Audit Notice */}
        {booking.isArchived && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-950 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <Archive className="h-4 w-4 text-amber-700" />
              <span>Archived Booking (Hidden from Active History)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-amber-900">
              <div>
                <span className="font-semibold">Archived At:</span>{' '}
                {booking.archivedAt ? new Date(booking.archivedAt).toLocaleString() : 'N/A'}
              </div>
              <div>
                <span className="font-semibold">Archived By (Actor ID):</span>{' '}
                <span className="font-mono">{booking.archivedBy || 'Platform Administrator'}</span>
              </div>
            </div>
            {booking.archiveReason && (
              <div className="text-[11px] text-amber-950 pt-1.5 border-t border-amber-200">
                <span className="font-semibold">Mandatory Archive Reason:</span> {booking.archiveReason}
              </div>
            )}
            <p className="text-[10px] text-amber-800 italic">
              Note: Underlying subscription, payment transactions, and audit histories remain 100% intact.
            </p>
          </div>
        )}

        {/* Customer Lifecycle Status Stepper (Phase 5) */}
        <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-white">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-brand-600" /> Customer Onboarding Lifecycle Journey
          </h4>
          <div className="space-y-3">
            {/* 1. Registration */}
            <div className="flex items-start gap-3 text-xs">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold">
                ✓
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">1. Registration Received</p>
                <p className="text-slate-500">
                  Plan: {booking.planCode} ({booking.billingCycle}) • {booking.adminName} ({booking.adminEmail})
                </p>
              </div>
            </div>

            {/* 2. Payment Proof */}
            <div className="flex items-start gap-3 text-xs">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  latestPayment ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {latestPayment ? '✓' : '2'}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">2. Payment Remittance Proof</p>
                <p className="text-slate-500">
                  {latestPayment
                    ? `Ref: ${latestPayment.paymentReference} • ${latestPayment.paymentMethod} • ${formatAmountCents(
                        latestPayment.amountCents || booking.amountCents,
                        latestPayment.currency || booking.currency
                      )}`
                    : 'Awaiting customer payment proof upload'}
                </p>
              </div>
            </div>

            {/* 3. Verification & Approval */}
            <div className="flex items-start gap-3 text-xs">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  ['APPROVED', 'ACTIVE'].includes(booking.status)
                    ? 'bg-emerald-100 text-emerald-700 font-bold'
                    : booking.status === 'REJECTED'
                    ? 'bg-rose-100 text-rose-700 font-bold'
                    : 'bg-amber-100 text-amber-700 font-bold'
                }`}
              >
                {['APPROVED', 'ACTIVE'].includes(booking.status) ? '✓' : booking.status === 'REJECTED' ? '✕' : '3'}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">3. Platform Admin Verification</p>
                <p className="text-slate-500">
                  {['APPROVED', 'ACTIVE'].includes(booking.status)
                    ? 'Payment verified and approved by Platform Administration'
                    : booking.status === 'REJECTED'
                    ? `Payment rejected: ${booking.rejectedReason || 'Proof document insufficient'}`
                    : 'Awaiting Platform Admin review & verification'}
                </p>
              </div>
            </div>

            {/* 4. Tenant Provisioning */}
            <div className="flex items-start gap-3 text-xs">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  booking.organisationId ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {booking.organisationId ? '✓' : '4'}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">4. Tenant Organisation Provisioning</p>
                <p className="text-slate-500">
                  {booking.organisationId
                    ? `Organisation Tenant Provisioned: ID #${booking.organisationId}`
                    : 'Pending payment approval'}
                </p>
              </div>
            </div>

            {/* 5. Activation Email */}
            <div className="flex items-start gap-3 text-xs">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  ['APPROVED', 'ACTIVE'].includes(booking.status)
                    ? 'bg-emerald-100 text-emerald-700 font-bold'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {['APPROVED', 'ACTIVE'].includes(booking.status) ? '✓' : '5'}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">5. Organisation Admin Activation Email</p>
                <p className="text-slate-500">
                  {['APPROVED', 'ACTIVE'].includes(booking.status)
                    ? `Single-use activation invitation sent to ${booking.adminEmail} (Valid for 48 hours)`
                    : 'Invitation will be dispatched upon approval'}
                </p>
              </div>
            </div>

            {/* 6. Password Setup & Workspace Access */}
            <div className="flex items-start gap-3 text-xs">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  isActive || booking.activatedAt
                    ? 'bg-emerald-100 text-emerald-700 font-bold'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {isActive || booking.activatedAt ? '✓' : '6'}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">6. Password Setup & Dashboard Login</p>
                <p className="text-slate-500">
                  {isActive || booking.activatedAt
                    ? 'Administrator active • Workspace live at /login'
                    : 'Awaiting customer password setup via activation link'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Organisation & Admin Metadata */}
        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-brand-600" /> Organisation &amp; Subscription Lifecycle Details
            </h4>
            {booking.organisationId && (
              <a
                href={`/platform-admin/organisations?orgId=${booking.organisationId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
              >
                <span>View Created Organisation</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500">Organisation Name:</span>
              <p className="font-semibold text-slate-900">{booking.organisationName}</p>
            </div>
            <div>
              <span className="text-slate-500">Tenant Organisation ID:</span>
              <p className="font-mono text-slate-900 truncate" title={booking.organisationId || 'Pending Provisioning'}>
                {booking.organisationId || 'Pending Provisioning'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Domain:</span>
              <p className="font-semibold text-slate-900">{booking.organisationDomain}</p>
            </div>
            <div>
              <span className="text-slate-500">Industry &amp; Size:</span>
              <p className="font-semibold text-slate-900">
                {booking.industry || 'Technology'} • {booking.companySize || '11-50'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Administrator Name:</span>
              <p className="font-semibold text-slate-900">{booking.adminName}</p>
            </div>
            <div>
              <span className="text-slate-500">Administrator Email:</span>
              <p className="font-semibold text-slate-900">{booking.adminEmail}</p>
            </div>
            <div>
              <span className="text-slate-500">Plan Start Date:</span>
              <p className="font-semibold text-slate-900">
                {booking.startsAt
                  ? new Date(booking.startsAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                  : isApproved || isActive
                  ? 'Immediate upon activation'
                  : 'Pending Approval'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Plan End Date:</span>
              <p className="font-semibold text-slate-900">
                {booking.expiresAt
                  ? new Date(booking.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                  : isApproved || isActive
                  ? '1 Year from start'
                  : 'Pending Approval'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Provisioning Status:</span>
              <p className="font-semibold text-slate-900">
                {booking.provisioningStatus || (booking.organisationId ? 'PROVISIONED' : 'PENDING')}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Activation Email Status:</span>
              <p className="font-semibold text-slate-900">
                {booking.invitationSentAt
                  ? `Dispatched (${new Date(booking.invitationSentAt).toLocaleTimeString()})`
                  : isApproved
                  ? 'Dispatched to admin'
                  : 'Pending Approval'}
              </p>
            </div>
          </div>
        </div>

        {/* Payment Remittance Details */}
        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <CreditCard className="h-4 w-4 text-brand-600" /> Remittance Proof & Settlement
          </h4>
          {latestPayment ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Payment Reference:</span>
                  <p className="font-mono font-semibold text-slate-900">{latestPayment.paymentReference}</p>
                </div>
                <div>
                  <span className="text-slate-500">Remittance Method:</span>
                  <p className="font-semibold text-slate-900">{latestPayment.paymentMethod}</p>
                </div>
                <div>
                  <span className="text-slate-500">Submitted Timestamp:</span>
                  <p className="font-semibold text-slate-900">
                    {latestPayment.createdAt ? new Date(latestPayment.createdAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Remitted Amount:</span>
                  <p className="font-semibold text-slate-900">
                    {formatAmountCents(
                      latestPayment.amountCents || booking.amountCents,
                      latestPayment.currency || booking.currency
                    )}
                  </p>
                </div>
              </div>

              {latestPayment.notes && (
                <div className="rounded-lg bg-slate-50 p-2.5 text-xs">
                  <span className="text-slate-500 font-medium">Customer Notes:</span>
                  <p className="text-slate-800 mt-0.5">{latestPayment.notes}</p>
                </div>
              )}

              {latestPayment.proofDownloadUrl ? (
                <div className="pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    onClick={() => onDownloadProof(latestPayment)}
                    loading={downloadLoading}
                  >
                    Download Remittance Document ({latestPayment.proofFileName || 'receipt.pdf'})
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No document attached.</p>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              Customer has registered organisation details but has not yet attached wire/ACH transfer proof.
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            {!booking.isArchived && onArchive && (
              <Button
                variant="outline"
                size="sm"
                icon={Archive}
                onClick={() => {
                  onClose();
                  onArchive(booking);
                }}
                className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-200"
                title="Archive and hide this booking from active history"
              >
                Archive Booking
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {booking.organisationId && (
              <a
                href={`/platform-admin/organisations?orgId=${booking.organisationId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors"
                title="View Organisation Profile & Entitlements"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>View Tenant</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            {isPendingVerification && (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  icon={XCircle}
                  disabled={approving}
                  onClick={() => {
                    onClose();
                    onReject(booking);
                  }}
                >
                  Reject Remittance
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Check}
                  loading={approving}
                  disabled={approving}
                  onClick={() => onApprove(booking)}
                >
                  {approving ? 'Provisioning & Creating Organisation...' : 'Approve & Create Organisation'}
                </Button>
              </>
            )}

            {isApproved && !booking.activatedAt && onResendInvitation && (
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                loading={resending}
                disabled={resending}
                onClick={() => onResendInvitation(booking)}
              >
                {resending ? 'Dispatching...' : 'Resend Activation Email'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
