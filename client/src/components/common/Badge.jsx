import React from 'react';

const TONE_MAP = {
  PENDING_PAYMENT: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING_VERIFICATION: 'bg-brand-50 text-brand-700 border-brand-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PUBLISHED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SHORTLISTED: 'bg-brand-50 text-brand-700 border-brand-200',
  SELECTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OFFER_ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  JOINED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  HIRED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  VERIFIED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  UNPUBLISHED: 'bg-slate-100 text-slate-600 border-slate-200',
  PENDING: 'bg-slate-100 text-slate-700 border-slate-200',
  APPLIED: 'bg-brand-50 text-brand-700 border-brand-200',
  SCREENING: 'bg-brand-50 text-brand-700 border-brand-200',
  TECHNICAL_INTERVIEW: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  MANAGERIAL_INTERVIEW: 'bg-violet-50 text-violet-700 border-violet-200',
  FINAL_SELECTION: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  OFFER_PROCESSING: 'bg-brand-50 text-brand-700 border-brand-200',
  JOINING: 'bg-teal-50 text-teal-700 border-teal-200',
  SCHEDULED: 'bg-brand-50 text-brand-700 border-brand-200',
  RESCHEDULED: 'bg-amber-50 text-amber-700 border-amber-200',
  SENT: 'bg-brand-50 text-brand-700 border-brand-200',
  INITIATED: 'bg-brand-50 text-brand-700 border-brand-200',
  LETTER_SENT: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  ON_HOLD: 'bg-amber-50 text-amber-700 border-amber-200',
  SUSPENDED: 'bg-rose-50 text-rose-700 border-rose-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  CLOSED: 'bg-slate-200 text-slate-700 border-slate-300',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
  EXPIRED: 'bg-slate-100 text-slate-500 border-slate-200',
  HRMS: 'bg-brand-50 text-brand-700 border-brand-200',
  MANUAL: 'bg-slate-100 text-slate-700 border-slate-200'
};

export default function Badge({ status, children, className = '' }) {
  const key = String(status || '').toUpperCase();
  const tone = TONE_MAP[key] || 'bg-slate-100 text-slate-700 border-slate-200';
  const label = children || String(status || '').replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight ${tone} ${className}`}>
      {label}
    </span>
  );
}

