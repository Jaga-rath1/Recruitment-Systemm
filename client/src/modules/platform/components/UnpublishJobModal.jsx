import React, { useState } from 'react';
import { EyeOff, AlertCircle, Building2, Briefcase } from 'lucide-react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';

export default function UnpublishJobModal({
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
      setError('A mandatory unpublish reason of at least 5 characters is required.');
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
      title="Unpublish Job Listing"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-800 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            Unpublishing will immediately remove this listing from the public candidate Careers page. Candidate applications, resumes, and interview records will remain completely intact.
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-slate-900 font-semibold text-sm">
            <Briefcase className="h-4 w-4 text-slate-500" />
            <span className="truncate">{job.title}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            <span>{job.organisationName || 'Tenant Organisation'}</span>
          </div>
        </div>

        <div>
          <label htmlFor="unpublish-reason" className="block text-xs font-semibold text-slate-700 mb-1">
            Reason for Unpublishing <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="unpublish-reason"
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError('');
            }}
            placeholder="Reason for unpublishing (e.g. Position filled, hiring paused, content policy violation)..."
            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            disabled={loading}
          />
          {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="secondary" size="sm" onClick={handleModalClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="warning" size="sm" type="submit" icon={EyeOff} loading={loading}>
            Unpublish Job
          </Button>
        </div>
      </form>
    </Modal>
  );
}
