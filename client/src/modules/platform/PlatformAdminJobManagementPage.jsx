import React, { useState, useEffect, useCallback } from 'react';
import { Briefcase, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { jobApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';
import Button from '../../components/common/Button';
import JobManagementFilters from './components/JobManagementFilters';
import PlatformAdminJobTable from './components/PlatformAdminJobTable';
import PlatformAdminJobDetailsModal from './components/PlatformAdminJobDetailsModal';
import UnpublishJobModal from './components/UnpublishJobModal';
import DiscardJobModal from './components/DiscardJobModal';

export default function PlatformAdminJobManagementPage() {
  const { addToast } = useToast();

  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [subscriptionFilter, setSubscriptionFilter] = useState('ALL');
  const [discardFilter, setDiscardFilter] = useState('ACTIVE_ONLY');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals State
  const [selectedJob, setSelectedJob] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const [unpublishJobTarget, setUnpublishJobTarget] = useState(null);
  const [isUnpublishOpen, setIsUnpublishOpen] = useState(false);
  const [unpublishLoading, setUnpublishLoading] = useState(false);

  const [discardJobTarget, setDiscardJobTarget] = useState(null);
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);
  const [discardLoading, setDiscardLoading] = useState(false);

  const loadJobs = useCallback(
    async (page = currentPage, search = searchTerm, status = statusFilter, subStatus = subscriptionFilter, discFilter = discardFilter) => {
      setLoading(true);
      try {
        const params = { page, limit: 15 };
        if (search && search.trim()) params.search = search.trim();
        if (status && status !== 'ALL') params.status = status;
        if (subStatus && subStatus !== 'ALL') params.subscriptionStatus = subStatus;
        if (discFilter) params.discardFilter = discFilter;

        const res = await jobApi.listPlatformAdminJobs(params);
        setJobs(res.data || []);
        if (res.meta) setMeta(res.meta);
      } catch (err) {
        addToast({ title: 'Error Loading Jobs', message: err.message, variant: 'error' });
      } finally {
        setLoading(false);
      }
    },
    [currentPage, searchTerm, statusFilter, subscriptionFilter, discardFilter, addToast]
  );

  useEffect(() => {
    loadJobs(currentPage, searchTerm, statusFilter, subscriptionFilter, discardFilter);
  }, [loadJobs, currentPage, statusFilter, subscriptionFilter, discardFilter]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setSubscriptionFilter('ALL');
    setDiscardFilter('ACTIVE_ONLY');
    setCurrentPage(1);
    loadJobs(1, '', 'ALL', 'ALL', 'ACTIVE_ONLY');
  };

  const handleOpenView = async (job) => {
    setSelectedJob(job);
    setIsDetailsOpen(true);
    try {
      const res = await jobApi.getPlatformAdminJobDetails(job.id);
      setSelectedJob(res.data);
    } catch (_err) {
      // Use existing job row data if details fetch fails
    }
  };

  const handleOpenUnpublish = (job) => {
    setUnpublishJobTarget(job);
    setIsUnpublishOpen(true);
  };

  const handleConfirmUnpublish = async (reason) => {
    if (!unpublishJobTarget) return;
    setUnpublishLoading(true);
    try {
      const res = await jobApi.unpublishPlatformAdminJob(unpublishJobTarget.id, { reason });
      addToast({
        title: 'Job Unpublished',
        message: res.message || 'Job was successfully unpublished.',
        variant: 'success'
      });
      setIsUnpublishOpen(false);
      setUnpublishJobTarget(null);
      if (isDetailsOpen && selectedJob?.id === unpublishJobTarget.id) {
        setIsDetailsOpen(false);
      }
      loadJobs(currentPage);
    } catch (err) {
      addToast({ title: 'Unpublish Failed', message: err.message, variant: 'error' });
    } finally {
      setUnpublishLoading(false);
    }
  };

  const handleOpenDiscard = (job) => {
    setDiscardJobTarget(job);
    setIsDiscardOpen(true);
  };

  const handleConfirmDiscard = async (reason) => {
    if (!discardJobTarget) return;
    setDiscardLoading(true);
    try {
      const res = await jobApi.discardPlatformAdminJob(discardJobTarget.id, { reason });
      addToast({
        title: 'Job Discarded',
        message: res.message || 'Job was soft-discarded and hidden from active view.',
        variant: 'success'
      });
      setIsDiscardOpen(false);
      setDiscardJobTarget(null);
      if (isDetailsOpen && selectedJob?.id === discardJobTarget.id) {
        setIsDetailsOpen(false);
      }
      loadJobs(currentPage);
    } catch (err) {
      addToast({ title: 'Discard Failed', message: err.message, variant: 'error' });
    } finally {
      setDiscardLoading(false);
    }
  };

  return (
    <PageTransition className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Global Job Governance & Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Platform-wide oversight of published, draft, and discarded jobs across all tenant organisations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => loadJobs(currentPage)}
            loading={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <JobManagementFilters
        searchTerm={searchTerm}
        onSearchChange={(v) => {
          setSearchTerm(v);
          setCurrentPage(1);
        }}
        statusFilter={statusFilter}
        onStatusChange={(v) => {
          setStatusFilter(v);
          setCurrentPage(1);
        }}
        subscriptionFilter={subscriptionFilter}
        onSubscriptionChange={(v) => {
          setSubscriptionFilter(v);
          setCurrentPage(1);
        }}
        discardFilter={discardFilter}
        onDiscardFilterChange={(v) => {
          setDiscardFilter(v);
          setCurrentPage(1);
        }}
        onReset={handleResetFilters}
      />

      {/* Table */}
      <PlatformAdminJobTable
        jobs={jobs}
        isLoading={loading}
        onViewJob={handleOpenView}
        onUnpublishJob={handleOpenUnpublish}
        onDiscardJob={handleOpenDiscard}
      />

      {/* Pagination Controls */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200/80 pt-4 text-xs text-slate-500">
          <span>
            Showing Page <strong>{meta.page}</strong> of <strong>{meta.totalPages}</strong> ({meta.total} jobs)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={ChevronLeft}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={meta.page <= 1 || loading}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={ChevronRight}
              onClick={() => setCurrentPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={meta.page >= meta.totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Details Modal */}
      <PlatformAdminJobDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false);
          setSelectedJob(null);
        }}
        job={selectedJob}
        onUnpublish={(job) => {
          setIsDetailsOpen(false);
          handleOpenUnpublish(job);
        }}
        onDiscard={(job) => {
          setIsDetailsOpen(false);
          handleOpenDiscard(job);
        }}
      />

      {/* Unpublish Confirmation Modal */}
      <UnpublishJobModal
        isOpen={isUnpublishOpen}
        onClose={() => {
          setIsUnpublishOpen(false);
          setUnpublishJobTarget(null);
        }}
        job={unpublishJobTarget}
        onConfirm={handleConfirmUnpublish}
        loading={unpublishLoading}
      />

      {/* Discard Confirmation Modal */}
      <DiscardJobModal
        isOpen={isDiscardOpen}
        onClose={() => {
          setIsDiscardOpen(false);
          setDiscardJobTarget(null);
        }}
        job={discardJobTarget}
        onConfirm={handleConfirmDiscard}
        loading={discardLoading}
      />
    </PageTransition>
  );
}
