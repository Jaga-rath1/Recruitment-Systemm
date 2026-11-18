import React from 'react';
import {
  Briefcase,
  Building2,
  Calendar,
  Users,
  Eye,
  EyeOff,
  Trash2,
  AlertCircle
} from 'lucide-react';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

export default function PlatformAdminJobTable({
  jobs = [],
  isLoading = false,
  onViewJob,
  onUnpublishJob,
  onDiscardJob
}) {
  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="space-y-4 animate-pulse">
          <div className="h-4 w-1/4 rounded bg-slate-200" />
          <div className="h-10 w-full rounded bg-slate-100" />
          <div className="h-10 w-full rounded bg-slate-100" />
          <div className="h-10 w-full rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-xs">
        <AlertCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
        <h3 className="text-sm font-semibold text-slate-800">No jobs match your criteria</h3>
        <p className="mt-1 text-xs text-slate-500">
          Try adjusting your search terms, status filters, or discard history toggle.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-600">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Job Title & ID</th>
              <th className="px-4 py-3">Organisation</th>
              <th className="px-4 py-3">Sub Status</th>
              <th className="px-4 py-3">Job Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Published</th>
              <th className="px-4 py-3 text-center">Applications</th>
              <th className="px-4 py-3">Governance</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                {/* Title & ID */}
                <td className="px-4 py-3 font-medium text-slate-900">
                  <div className="font-semibold text-xs text-slate-900 truncate max-w-[200px]" title={job.title}>
                    {job.title}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 truncate max-w-[120px]">
                    {job.id}
                  </div>
                </td>

                {/* Organisation */}
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800 truncate max-w-[160px]" title={job.organisationName}>
                    {job.organisationName || 'Tenant'}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[100px]">
                    {job.department || 'General'}
                  </div>
                </td>

                {/* Subscription Status */}
                <td className="px-4 py-3">
                  <Badge variant={job.subscriptionStatus === 'ACTIVE' ? 'success' : job.subscriptionStatus === 'CANCELLED' ? 'danger' : 'neutral'}>
                    {job.subscriptionStatus || 'NONE'}
                  </Badge>
                </td>

                {/* Job Status */}
                <td className="px-4 py-3">
                  <Badge variant={job.status === 'PUBLISHED' ? 'success' : job.status === 'CLOSED' ? 'danger' : 'warning'}>
                    {job.status}
                  </Badge>
                </td>

                {/* Created Date */}
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : '—'}
                </td>

                {/* Published Date */}
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {job.publishedAt ? new Date(job.publishedAt).toLocaleDateString() : '—'}
                </td>

                {/* Application Count */}
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    <Users className="h-3 w-3" />
                    {job.applicationCount || 0}
                  </span>
                </td>

                {/* Discard Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {job.isDiscarded ? (
                    <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 border border-rose-200">
                      Discarded
                    </span>
                  ) : (
                    <span className="text-slate-400 text-[11px]">Active</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Eye}
                      onClick={() => onViewJob(job)}
                      title="View Complete Job Details"
                    >
                      View
                    </Button>

                    {job.status === 'PUBLISHED' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={EyeOff}
                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        onClick={() => onUnpublishJob(job)}
                        title="Unpublish Job"
                      >
                        Unpublish
                      </Button>
                    )}

                    {!job.isDiscarded && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        onClick={() => onDiscardJob(job)}
                        title="Discard Job"
                      >
                        Discard
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
