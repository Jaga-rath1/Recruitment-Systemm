import React, { useState } from 'react';
import {
  User,
  Mail,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  KeyRound,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Calendar
} from 'lucide-react';
import Button from '../../../components/common/Button';
import { AccountStatusBadge, InvitationLifecycleBadge } from './OrganisationStatusBadges';

export default function OrganisationAdminAccountCard({
  adminAccount,
  organisationId,
  subscriptionId,
  onResendActivation,
  onRecoverAccount,
  onTriggerPasswordReset,
  actionLoading
}) {
  const [copied, setCopied] = useState(false);

  if (!adminAccount) {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-amber-600 mb-2" />
        <h4 className="text-sm font-semibold text-amber-900">Missing Organisation Admin Account</h4>
        <p className="text-xs text-amber-700 mt-1">
          No administrator credentials could be resolved for this organisation.
        </p>
        {onRecoverAccount && (
          <Button
            variant="primary"
            size="sm"
            className="mt-3"
            onClick={onRecoverAccount}
            loading={actionLoading}
          >
            Recover Admin Account
          </Button>
        )}
      </div>
    );
  }

  const handleCopyEmail = () => {
    if (adminAccount.email) {
      navigator.clipboard.writeText(adminAccount.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const portalUrl = adminAccount.loginPortalUrl || `${window.location.origin}/org-login`;
  const isActivated = adminAccount.accountStatus === 'ACTIVATED';
  const isInvited = adminAccount.accountStatus === 'INVITED';
  const isMissing = adminAccount.isMissingAssignment || adminAccount.accountStatus === 'NOT_PROVISIONED';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 border border-brand-200">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Organisation Admin Account</h4>
            <p className="text-xs text-slate-500">Primary tenant administrator credentials & access portal</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AccountStatusBadge status={adminAccount.accountStatus} />
          {adminAccount.invitationStatus && (
            <InvitationLifecycleBadge status={adminAccount.invitationStatus} />
          )}
        </div>
      </div>

      {/* Grid of Credentials & Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Admin Full Name */}
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <span className="text-slate-500 block text-[11px] font-medium">Administrator Full Name</span>
          <span className="font-semibold text-slate-900 text-sm mt-0.5 block truncate">
            {adminAccount.fullName || 'Not specified'}
          </span>
        </div>

        {/* Registered Login Email */}
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[11px] font-medium">Registered Login Email</span>
            <button
              type="button"
              onClick={handleCopyEmail}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700"
              title="Copy Email"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <span className="font-mono font-medium text-slate-900 text-xs mt-0.5 block truncate">
            {adminAccount.email}
          </span>
        </div>

        {/* Dedicated Login Portal */}
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[11px] font-medium">Dedicated Login Portal URL</span>
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline"
            >
              <span>Open Portal</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <span className="font-mono text-xs text-brand-700 font-medium block truncate mt-0.5">
            {portalUrl}
          </span>
        </div>

        {/* Invitation Dates */}
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <span className="text-slate-500 block text-[11px] font-medium flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Invitation Dispatched At
          </span>
          <span className="font-medium text-slate-800 text-xs mt-0.5 block">
            {adminAccount.invitationSentAt
              ? new Date(adminAccount.invitationSentAt).toLocaleString()
              : 'Not dispatched'}
          </span>
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <span className="text-slate-500 block text-[11px] font-medium flex items-center gap-1">
            <Clock className="h-3 w-3" /> Invitation Expires At (48h)
          </span>
          <span className="font-medium text-slate-800 text-xs mt-0.5 block">
            {adminAccount.invitationExpiresAt
              ? new Date(adminAccount.invitationExpiresAt).toLocaleString()
              : isActivated
              ? 'Completed / Activated'
              : 'Pending dispatch'}
          </span>
        </div>

        {/* Last Login */}
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:col-span-2">
          <div className="flex items-center justify-between text-slate-500 text-[11px]">
            <span>Last Admin Login Session</span>
            <span>{adminAccount.lastLoginAt ? new Date(adminAccount.lastLoginAt).toLocaleString() : 'No recorded login session'}</span>
          </div>
        </div>
      </div>

      {/* Missing Assignment Alert */}
      {isMissing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-semibold text-amber-900">Missing or Incomplete Admin Role Link</p>
            <p className="text-amber-700 mt-0.5">
              The organisation tenant exists, but the Organisation Admin account record has not been linked. Click recover to automatically repair the assignment.
            </p>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-100">
        {isMissing && onRecoverAccount && (
          <Button
            variant="primary"
            size="sm"
            icon={RefreshCw}
            onClick={onRecoverAccount}
            loading={actionLoading}
          >
            Recover Admin Account
          </Button>
        )}

        {isInvited && onResendActivation && (
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={onResendActivation}
            loading={actionLoading}
          >
            Resend Activation Email
          </Button>
        )}

        {isActivated && onTriggerPasswordReset && (
          <Button
            variant="secondary"
            size="sm"
            icon={KeyRound}
            onClick={onTriggerPasswordReset}
            loading={actionLoading}
          >
            Send Password Reset Email
          </Button>
        )}
      </div>
    </div>
  );
}
