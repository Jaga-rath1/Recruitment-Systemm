import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  ShieldCheck,
  RefreshCw,
  Sparkles
} from 'lucide-react';

export function AccountStatusBadge({ status }) {
  switch (status) {
    case 'ACTIVATED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" /> Activated
        </span>
      );
    case 'INVITED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
          <Clock className="h-3 w-3" /> Invited
        </span>
      );
    case 'DISABLED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
          <XCircle className="h-3 w-3" /> Disabled
        </span>
      );
    case 'NOT_PROVISIONED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
          <AlertCircle className="h-3 w-3" /> Not Provisioned
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-600 border border-slate-200">
          {status || 'Pending'}
        </span>
      );
  }
}

export function ProvisioningStatusBadge({ status }) {
  switch (status) {
    case 'PROVISIONED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" /> Provisioned
        </span>
      );
    case 'PROVISIONING':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200">
          <RefreshCw className="h-3 w-3 animate-spin" /> Provisioning
        </span>
      );
    case 'FAILED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
          <AlertCircle className="h-3 w-3" /> Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
          {status || 'Pending'}
        </span>
      );
  }
}

export function InvitationLifecycleBadge({ status }) {
  switch (status) {
    case 'ACCOUNT_ACTIVATED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <ShieldCheck className="h-3 w-3" /> Activated
        </span>
      );
    case 'INVITATION_SENT':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
          <Clock className="h-3 w-3" /> Sent (48h)
        </span>
      );
    case 'INVITATION_RESENT':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
          <RefreshCw className="h-3 w-3" /> Resent
        </span>
      );
    case 'INVITATION_EXPIRED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
          <AlertCircle className="h-3 w-3" /> Expired
        </span>
      );
    case 'INVITATION_FAILED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
          <XCircle className="h-3 w-3" /> Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-600 border border-slate-200">
          {status || 'Pending'}
        </span>
      );
  }
}

export function PaymentStatusBadge({ status }) {
  switch (status) {
    case 'VERIFIED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" /> Verified
        </span>
      );
    case 'TRIAL':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">
          <Sparkles className="h-3 w-3" /> Free Trial
        </span>
      );
    case 'SUBMITTED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
          <Clock className="h-3 w-3" /> Proof Submitted
        </span>
      );
    case 'REJECTED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
          <XCircle className="h-3 w-3" /> Rejected
        </span>
      );
    case 'VOIDED':
    case 'ARCHIVED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
          {status}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500 border border-slate-200">
          {status || 'Pending'}
        </span>
      );
  }
}
