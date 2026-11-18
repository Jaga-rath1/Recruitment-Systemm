import React from 'react';
import {
  Building2,
  Calendar,
  CreditCard,
  Layers,
  Clock,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  DollarSign,
  Ban,
  Briefcase
} from 'lucide-react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import LoadingSkeleton from '../../../components/common/LoadingSkeleton';
import OrganisationAdminAccountCard from './OrganisationAdminAccountCard';
import {
  ProvisioningStatusBadge,
  PaymentStatusBadge
} from './OrganisationStatusBadges';
import { formatPlanPrice } from '../../../utils/currency';

export default function OrganisationDetailsModal({
  isOpen,
  onClose,
  details,
  loading,
  onResendActivation,
  onRecoverAccount,
  onTriggerPasswordReset,
  onRequestCancelSubscription,
  actionLoading
}) {
  if (!isOpen) return null;

  const org = details?.organisation;
  const sub = details?.subscription;
  const adminAccount = details?.adminAccount;
  const payments = details?.payments || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={org?.name || 'Organisation Details'}
      size="xl"
    >
      {loading || !details ? (
        <LoadingSkeleton rows={8} />
      ) : (
        <div className="space-y-6">
          {/* Top Organisation Summary Banner */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700 font-extrabold text-lg">
                  {org.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{org.name}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500">
                    <span className="font-mono font-medium">{org.domain || 'no-domain'}</span>
                    <span>•</span>
                    <span>{org.industry || 'General Industry'}</span>
                    <span>•</span>
                    <span>{org.companySize || 'Unknown Size'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ProvisioningStatusBadge status={org.provisioningStatus} />
                <Badge status={org.status} />
              </div>
            </div>

            {/* Tenant UUID Display */}
            <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
              <div>
                <span className="text-slate-500 font-medium">Tenant Organisation ID: </span>
                <span className="font-mono font-semibold text-slate-900">{org.id}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Subscription Ref: </span>
                <span className="font-mono text-slate-700">{org.subscriptionId}</span>
              </div>
            </div>

            {org.provisioningError && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <div>
                  <span className="font-semibold">Provisioning Error: </span>
                  <span>{org.provisioningError}</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 1: Organisation Admin Account Card */}
          <OrganisationAdminAccountCard
            adminAccount={adminAccount}
            organisationId={org.id}
            subscriptionId={org.subscriptionId}
            onResendActivation={onResendActivation}
            onRecoverAccount={onRecoverAccount}
            onTriggerPasswordReset={onTriggerPasswordReset}
            actionLoading={actionLoading}
          />

          {/* Section 2: Subscription & Billing Overview */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Subscription & Entitlements</h4>
                  <p className="text-xs text-slate-500">Tier limits, billing lifecycle & payment status</p>
                </div>
              </div>

              {sub?.status && <Badge status={sub.status} />}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-500 block text-[11px] font-medium">Current Plan</span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block truncate">
                  {sub?.planName || sub?.planCode || 'Standard Plan'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{sub?.planCode}</span>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-500 block text-[11px] font-medium">Billing Cycle</span>
                <span className="font-semibold text-slate-900 text-sm mt-0.5 block capitalize">
                  {sub?.billingCycle || 'Monthly'}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  {sub?.amountCents ? `${sub.currency} ${(sub.amountCents / 100).toLocaleString()}` : 'Free evaluation'}
                </span>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-500 block text-[11px] font-medium">Starts At</span>
                <span className="font-semibold text-slate-900 text-xs mt-0.5 block">
                  {sub?.startsAt ? new Date(sub.startsAt).toLocaleDateString() : 'Immediate'}
                </span>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <span className="text-slate-500 block text-[11px] font-medium">Renews / Ends</span>
                <span className="font-semibold text-slate-900 text-xs mt-0.5 block">
                  {sub?.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : 'Continuous'}
                </span>
              </div>
            </div>

            {/* Active Jobs Metric */}
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <Briefcase className="h-4 w-4 text-slate-500" />
                <span className="font-medium text-slate-700">Active Published Jobs:</span>
              </div>
              <span className="font-bold text-slate-900 text-xs bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
                {details?.jobsSummary?.publishedJobCount ?? 0} jobs
              </span>
            </div>

            {/* Cancellation Status Banner */}
            {sub?.status === 'CANCELLED' && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 space-y-1 text-xs text-rose-800">
                <div className="flex items-center gap-2 font-bold text-rose-950">
                  <AlertCircle className="h-4 w-4 text-rose-600" /> Subscription Cancelled
                </div>
                {sub.cancelledAt && (
                  <p className="text-[11px] text-rose-700">
                    Cancelled on {new Date(sub.cancelledAt).toLocaleString()}
                  </p>
                )}
                {sub.cancellationReason && (
                  <p className="text-[11px] font-medium text-rose-900 mt-1">
                    Reason: {sub.cancellationReason}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Payment History Summary */}
          {payments.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-xs">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-slate-500" /> Payment & Verification Records ({payments.length})
              </h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Reference</th>
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-mono text-[11px] font-medium text-slate-800">
                          {p.paymentReference}
                        </td>
                        <td className="px-3 py-2 text-slate-600 capitalize">{p.paymentMethod}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {p.currency} {((p.amountCents || 0) / 100).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <PaymentStatusBadge status={p.status} />
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div>
              {(sub?.status === 'ACTIVE' || sub?.status === 'TRIAL') && onRequestCancelSubscription && (
                <Button
                  variant="danger"
                  size="sm"
                  icon={Ban}
                  onClick={onRequestCancelSubscription}
                >
                  Cancel Subscription
                </Button>
              )}
            </div>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
