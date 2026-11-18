import React from 'react';
import { Mail, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

export default function InvitationStatusBadge({ status, deliveryStatus, error }) {
  const normalized = String(status || 'EMPLOYEE_CREATED').toUpperCase();

  const configs = {
    EMPLOYEE_CREATED: {
      label: 'Employee Created',
      classes: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: Clock
    },
    ACCOUNT_PROVISIONING_PENDING: {
      label: 'Provisioning Pending',
      classes: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: Clock
    },
    INVITATION_PENDING: {
      label: 'Invitation Pending',
      classes: 'bg-sky-50 text-sky-700 border-sky-200',
      icon: Clock
    },
    INVITATION_SENT: {
      label: 'Invitation Sent',
      classes: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      icon: Mail
    },
    INVITATION_FAILED: {
      label: 'Invitation Failed',
      classes: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: AlertCircle
    },
    INVITATION_ACCEPTED: {
      label: 'Invitation Accepted',
      classes: 'bg-purple-50 text-purple-700 border-purple-200',
      icon: CheckCircle2
    },
    ACCOUNT_ACTIVATED: {
      label: 'Account Activated',
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle2
    }
  };

  const config = configs[normalized] || {
    label: normalized.replace(/_/g, ' '),
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: Clock
  };

  const Icon = config.icon;

  return (
    <span
      title={error || (deliveryStatus ? `Delivery: ${deliveryStatus}` : config.label)}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${config.classes}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span>{config.label}</span>
    </span>
  );
}
