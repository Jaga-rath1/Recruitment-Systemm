import React, { useState } from 'react';
import {
  Building2,
  Copy,
  Check,
  Eye,
  RefreshCw,
  ExternalLink,
  Mail,
  User,
  Calendar
} from 'lucide-react';
import Button from '../../../components/common/Button';
import {
  AccountStatusBadge,
  ProvisioningStatusBadge,
  InvitationLifecycleBadge,
  PaymentStatusBadge
} from './OrganisationStatusBadges';

export default function OrganisationDirectoryTable({
  organisations,
  loading,
  onViewOrganisation,
  onResendActivation,
  resendingId
}) {
  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-500">
        <RefreshCw className="mx-auto h-8 w-8 animate-spin text-brand-600 mb-2" />
        <p className="text-sm">Loading Organisation Directory from database...</p>
      </div>
    );
  }

  if (!organisations || organisations.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
        <Building2 className="mx-auto h-10 w-10 text-slate-300 mb-2" />
        <p className="text-sm font-semibold text-slate-800">No organisations found</p>
        <p className="text-xs text-slate-500 mt-1">Adjust search filters or create an organisation via free trial / paid approval.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
      <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
        <thead className="bg-slate-50/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
          <tr>
            <th className="px-4 py-3">Organisation</th>
            <th className="px-4 py-3">Organisation ID</th>
            <th className="px-4 py-3">Admin Name</th>
            <th className="px-4 py-3">Admin Login Email</th>
            <th className="px-4 py-3">Admin Status</th>
            <th className="px-4 py-3">Plan</th>
            <th className="px-4 py-3">Starts At</th>
            <th className="px-4 py-3">Ends At</th>
            <th className="px-4 py-3">Payment</th>
            <th className="px-4 py-3">Provisioning</th>
            <th className="px-4 py-3">Invitation</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
          {organisations.map((org) => {
            const orgId = org.organisationId || org.subscriptionId;
            const isInvited = org.adminAccountStatus === 'INVITED';
            const isResending = resendingId === org.subscriptionId;

            return (
              <tr key={org.subscriptionId} className="hover:bg-slate-50/60 transition">
                {/* 1. Organisation Name & Domain */}
                <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand-700 font-bold shrink-0">
                      {org.organisationName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-semibold block truncate max-w-[160px]" title={org.organisationName}>
                        {org.organisationName}
                      </span>
                      <span className="text-[11px] text-slate-400 block font-normal">
                        {org.organisationDomain || 'No domain'}
                      </span>
                    </div>
                  </div>
                </td>

                {/* 2. Organisation ID */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600">
                    <span className="truncate max-w-[100px]" title={orgId}>
                      {orgId ? `${orgId.slice(0, 8)}...` : 'Not provisioned'}
                    </span>
                    {orgId && (
                      <button
                        type="button"
                        onClick={() => handleCopy(orgId, `org-${org.subscriptionId}`)}
                        className="text-slate-400 hover:text-slate-600"
                        title="Copy Organisation ID"
                      >
                        {copiedId === `org-${org.subscriptionId}` ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                </td>

                {/* 3. Organisation Admin Name */}
                <td className="px-4 py-3 whitespace-nowrap text-slate-900 font-medium">
                  <span className="truncate max-w-[130px] block" title={org.adminName}>
                    {org.adminName || 'Unassigned'}
                  </span>
                </td>

                {/* 4. Organisation Admin Login Email / Username */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600">
                    <span className="truncate max-w-[150px]" title={org.adminEmail}>
                      {org.adminEmail}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(org.adminEmail, `email-${org.subscriptionId}`)}
                      className="text-slate-400 hover:text-slate-600"
                      title="Copy Login Email"
                    >
                      {copiedId === `email-${org.subscriptionId}` ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </td>

                {/* 5. Organisation Admin Account Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <AccountStatusBadge status={org.adminAccountStatus} />
                </td>

                {/* 6. Subscription Plan */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                    {org.planName || org.planCode}
                  </span>
                </td>

                {/* 7. Subscription Start Date */}
                <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-[11px]">
                  {org.startsAt ? new Date(org.startsAt).toLocaleDateString() : '—'}
                </td>

                {/* 8. Subscription End Date */}
                <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-[11px]">
                  {org.expiresAt ? new Date(org.expiresAt).toLocaleDateString() : '—'}
                </td>

                {/* 9. Payment Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <PaymentStatusBadge status={org.paymentStatus} />
                </td>

                {/* 10. Organisation Provisioning Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <ProvisioningStatusBadge status={org.provisioningStatus} />
                </td>

                {/* 11. Invitation Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <InvitationLifecycleBadge status={org.invitationStatus} />
                </td>

                {/* 12. Actions */}
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {isInvited && onResendActivation && (
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={RefreshCw}
                        onClick={() => onResendActivation(org)}
                        loading={isResending}
                        title="Resend Activation Email"
                      >
                        Resend
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="xs"
                      icon={Eye}
                      onClick={() => onViewOrganisation(org)}
                    >
                      View
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
