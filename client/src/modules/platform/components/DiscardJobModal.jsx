import React, { useState } from 'react';
import { Trash2, AlertTriangle, Building2, Briefcase, Users } from 'lucide-react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';

export default function DiscardJobModal({
  isOpen,
  onClose,
  job,
  onConfirm,
  loading = false
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!isOpen || !job) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length < 5) {
      setError('A mandatory discard reason of at least 5 characters is required.');
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
      title="Discard Job (Archive from Active View)"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs text-rose-800 flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-rose-950 text-xs">Soft-Discard & Data Preservation Policy</h4>
            <p className="mt-1 text-rose-700 leading-relaxed">
              Discarding hides this job from standard active management lists and unpublishes it if live. <strong>All {job.applicationCount || 0} candidate applications, uploaded resumes, and interview feedback are preserved permanently for compliance.</strong>
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-slate-900 font-semibold text-sm">
            <Briefcase className="h-4 w-4 text-slate-500" />
            <span className="truncate">{job.title}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span>{job.organisationName || 'Tenant Organisation'}</span>
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <Users className="h-3.5 w-3.5" />
              <span>{job.applicationCount || 0} Applications</span>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="discard-reason" className="block text-xs font-semibold text-slate-700 mb-1">
            Mandatory Discard Reason <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="discard-reason"
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError('');
            }}
            placeholder="Explain why this job is being discarded (e.g. Duplicate test listing, spam posting, erroneous sync)..."
            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            disabled={loading}
          />
          {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="secondary" size="sm" onClick={handleModalClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" type="submit" icon={Trash2} loading={loading}>
            Confirm Discard
          </Button>
        </div>
      </form>
    </Modal>
  );
}
