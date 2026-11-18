import React, { useState } from 'react';
import { AlertTriangle, Ban, Building2, Calendar, CreditCard, Briefcase } from 'lucide-react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

export default function CancelSubscriptionModal({
  isOpen,
  onClose,
  details,
  onConfirm,
  loading = false
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const org = details?.organisation || {};
  const sub = details?.subscription || {};
  const jobsSummary = details?.jobsSummary || {};
  const activeJobCount = jobsSummary.publishedJobCount ?? 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length < 5) {
      setError('A mandatory cancellation reason of at least 5 characters is required.');
      return;
    }
    setError('');
    onConfirm(trimmed);
  };

  const handleModalClose = () => {
    setReason('');
    setError('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      title="Cancel Organisation Subscription"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Warning Banner */}
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-rose-950 text-sm">Destructive Action & Automatic Job Unpublishing</h4>
              <p className="mt-1 text-rose-700 leading-relaxed">
                Cancelling this subscription will immediately revoke active SaaS access and <strong>automatically unpublish all {activeJobCount} active jobs</strong> from the public Careers feed. Job records, applications, interviews, and candidate data will remain safely preserved.
              </p>
            </div>
          </div>
        </div>

        {/* Organisation & Subscription Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs">
          <div>
            <span className="text-slate-500 font-medium block flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" /> Organisation Name
            </span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block truncate">
              {org.name || 'Not specified'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 font-medium block flex items-center gap-1">
              <CreditCard className="h-3.5 w-3.5" /> Plan & Cycle
            </span>
            <span className="font-semibold text-slate-900 text-xs mt-0.5 block">
              {sub.planName || sub.planCode || 'Advanced'} ({sub.billingCycle || 'MONTHLY'})
            </span>
          </div>

          <div>
            <span className="text-slate-500 font-medium block flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Subscription Period
            </span>
            <span className="text-slate-700 text-xs mt-0.5 block font-mono">
              {sub.startsAt ? new Date(sub.startsAt).toLocaleDateString() : '—'} to{' '}
              {sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : 'Ongoing'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 font-medium block">Current Status</span>
            <div className="mt-1">
              <Badge variant={sub.status === 'ACTIVE' ? 'success' : sub.status === 'TRIAL' ? 'info' : 'warning'}>
                {sub.status || 'UNKNOWN'}
              </Badge>
            </div>
          </div>

          <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-amber-600" />
              <span className="font-semibold text-amber-900 text-xs">Active Published Jobs to Unpublish:</span>
            </div>
            <span className="font-extrabold text-amber-900 text-sm bg-amber-200/60 px-2.5 py-0.5 rounded-full">
              {activeJobCount}
            </span>
          </div>
        </div>

        {/* Reason Textarea */}
        <div>
          <label htmlFor="cancellation-reason" className="block text-xs font-semibold text-slate-700 mb-1">
            Cancellation Reason <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="cancellation-reason"
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError('');
            }}
            placeholder="Provide a mandatory reason for cancellation (e.g. Non-payment, customer request, policy violation)..."
            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            disabled={loading}
          />
          {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="secondary" size="sm" onClick={handleModalClose} disabled={loading}>
            Nevermind, Keep Active
          </Button>
          <Button variant="danger" size="sm" type="submit" icon={Ban} loading={loading}>
            Confirm Cancellation & Unpublish Jobs
          </Button>
        </div>
      </form>
    </Modal>
  );
}
