import React from 'react';
import {
  Briefcase,
  Building2,
  Calendar,
  CreditCard,
  MapPin,
  Clock,
  DollarSign,
  Users,
  EyeOff,
  Trash2,
  ShieldAlert,
  Info
} from 'lucide-react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

export default function PlatformAdminJobDetailsModal({
  isOpen,
  onClose,
  job,
  onUnpublish,
  onDiscard
}) {
  if (!isOpen || !job) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={job.title || 'Job Details'}
      size="xl"
    >
      <div className="space-y-5 text-xs text-slate-700">
        {/* Header Banner */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 font-bold">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{job.title}</h3>
              <p className="text-slate-500 font-mono text-[11px]">ID: {job.id}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={job.status === 'PUBLISHED' ? 'success' : job.status === 'CLOSED' ? 'danger' : 'warning'}>
              {job.status}
            </Badge>
            {job.isDiscarded && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                Discarded
              </span>
            )}
            <Badge variant={job.subscriptionStatus === 'ACTIVE' ? 'success' : job.subscriptionStatus === 'CANCELLED' ? 'danger' : 'neutral'}>
              Sub: {job.subscriptionStatus || 'N/A'}
            </Badge>
          </div>
        </div>

        {/* Organisation & Subscription Summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <Building2 className="h-4 w-4 text-brand-600" /> Tenant Organisation & Subscription Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <span className="text-slate-500 text-[11px] block">Organisation</span>
              <span className="font-semibold text-slate-900 text-xs block truncate">{job.organisationName || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block">Subscription Plan</span>
              <span className="font-semibold text-slate-900 text-xs block">{job.planCode || 'Advanced Tier'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block">Candidate Applications</span>
              <span className="font-semibold text-slate-900 text-xs block flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-slate-400" /> {job.applicationCount || 0} candidates
              </span>
            </div>
          </div>
        </div>

        {/* Job Parameters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
            <span className="text-slate-500 text-[11px] block">Department</span>
            <span className="font-medium text-slate-900 block truncate">{job.department || '—'}</span>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
            <span className="text-slate-500 text-[11px] block">Location</span>
            <span className="font-medium text-slate-900 block truncate flex items-center gap-1">
              <MapPin className="h-3 w-3 text-slate-400" /> {job.location || '—'}
            </span>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
            <span className="text-slate-500 text-[11px] block">Employment Type</span>
            <span className="font-medium text-slate-900 block">{job.employmentType || 'FULL_TIME'}</span>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
            <span className="text-slate-500 text-[11px] block">Salary Compensation</span>
            <span className="font-medium text-slate-900 block truncate">{job.salaryDisplay || 'Competitive'}</span>
          </div>
        </div>

        {/* Skills */}
        {job.skills && job.skills.length > 0 && (
          <div>
            <span className="font-semibold text-slate-700 block mb-1.5">Required Skills:</span>
            <div className="flex flex-wrap gap-1.5">
              {job.skills.map((skill, i) => (
                <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <span className="font-semibold text-slate-700 block mb-1">Job Description:</span>
          <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-slate-800 leading-relaxed whitespace-pre-wrap">
            {job.description || 'No description provided.'}
          </div>
        </div>

        {/* Governance & Lifecycle Notices */}
        {(job.unpublishReason || job.discardReason) && (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
            {job.unpublishReason && (
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-900">Unpublish Record:</span>
                  <p className="text-amber-800 text-[11px]">{job.unpublishReason}</p>
                </div>
              </div>
            )}
            {job.discardReason && (
              <div className="flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-rose-900">Discard Reason:</span>
                  <p className="text-rose-800 text-[11px]">{job.discardReason}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            {job.status === 'PUBLISHED' && (
              <Button variant="warning" size="sm" icon={EyeOff} onClick={() => onUnpublish(job)}>
                Unpublish Job
              </Button>
            )}
            {!job.isDiscarded && (
              <Button variant="danger" size="sm" icon={Trash2} onClick={() => onDiscard(job)}>
                Discard Job
              </Button>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
