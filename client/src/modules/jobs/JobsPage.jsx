import React, { useEffect, useState } from 'react';
import { RefreshCw, Plus, Globe, EyeOff, Lock, Edit3 } from 'lucide-react';
import { jobApi } from '../../api';
import DataTable from '../../components/common/DataTable';
import SearchFilterBar from '../../components/common/SearchFilterBar';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import JobFormModal from './JobFormModal';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function JobsPage() {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);

  const loadJobs = async (targetPage = page) => {
    setLoading(true);
    try {
      const res = await jobApi.listOrgJobs({
        search: search || undefined,
        sourceType: sourceType || undefined,
        status: status || undefined,
        page: targetPage,
        limit: 12
      });
      setJobs(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      addToast({ title: 'Failed to load jobs', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs(page);
  }, [page, sourceType, status]);

  const handleHrmsSync = async () => {
    setSyncing(true);
    try {
      const res = await jobApi.syncHrms();
      addToast({ title: 'HRMS Sync Complete', message: res.message, variant: 'success' });
      loadJobs(1);
    } catch (err) {
      addToast({ title: 'HRMS Sync Failed', message: err.message, variant: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const handleLifecycleAction = async (jobId, action) => {
    try {
      if (action === 'publish') await jobApi.publish(jobId);
      if (action === 'unpublish') await jobApi.unpublish(jobId);
      if (action === 'close') await jobApi.close(jobId);
      addToast({ title: 'Job Updated', message: `Job status updated (${action}).`, variant: 'success' });
      loadJobs(page);
    } catch (err) {
      addToast({ title: 'Action Failed', message: err.message, variant: 'error' });
    }
  };

  const columns = [
    {
      key: 'title',
      label: 'Job Title & Source',
      render: (row) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900">{row.title}</p>
            <Badge status={row.sourceType}>{row.sourceType}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {row.department} · {row.location} {row.hrmsJobId ? `· HRMS ID: ${row.hrmsJobId}` : ''}
          </p>
        </div>
      )
    },
    {
      key: 'headcount',
      label: 'Headcount',
      render: (row) => <span className="text-xs font-medium text-slate-700">{row.headcount} openings</span>
    },
    {
      key: 'applications',
      label: 'Applicants',
      render: (row) => <span className="text-xs font-semibold text-brand-700">{row._count?.applications || 0}</span>
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <Badge status={row.status} />
    },
    {
      key: 'actions',
      label: 'Operations',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {hasPermission('job:edit') && (
            <Button
              size="sm"
              variant="secondary"
              icon={Edit3}
              onClick={() => {
                setEditingJob(row);
                setModalOpen(true);
              }}
            >
              {row.sourceType === 'HRMS' ? 'Configure' : 'Edit'}
            </Button>
          )}
          {hasPermission('job:publish') && row.status !== 'PUBLISHED' && (
            <Button size="sm" variant="soft" icon={Globe} onClick={() => handleLifecycleAction(row.id, 'publish')}>
              Publish
            </Button>
          )}
          {hasPermission('job:publish') && row.status === 'PUBLISHED' && (
            <Button size="sm" variant="secondary" icon={EyeOff} onClick={() => handleLifecycleAction(row.id, 'unpublish')}>
              Unpublish
            </Button>
          )}
          {hasPermission('job:publish') && row.status !== 'CLOSED' && (
            <Button size="sm" variant="ghost" icon={Lock} onClick={() => handleLifecycleAction(row.id, 'close')}>
              Close
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Job Requisitions</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage synced HRMS jobs (preserving source integrity) and manual job postings published to Careers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission('job:hrms:sync') && (
            <Button variant="secondary" icon={RefreshCw} loading={syncing} onClick={handleHrmsSync}>
              Sync HRMS Jobs
            </Button>
          )}
          {hasPermission('job:create') && (
            <Button
              icon={Plus}
              onClick={() => {
                setEditingJob(null);
                setModalOpen(true);
              }}
            >
              Create Manual Job
            </Button>
          )}
        </div>
      </div>

      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search jobs by title, department, or location..."
        filters={[
          {
            name: 'sourceType',
            label: 'Source',
            value: sourceType,
            onChange: (v) => {
              setPage(1);
              setSourceType(v);
            },
            options: [
              { value: '', label: 'All Sources' },
              { value: 'HRMS', label: 'HRMS Jobs' },
              { value: 'MANUAL', label: 'Manual Jobs' }
            ]
          },
          {
            name: 'status',
            label: 'Status',
            value: status,
            onChange: (v) => {
              setPage(1);
              setStatus(v);
            },
            options: [
              { value: '', label: 'All Statuses' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'PUBLISHED', label: 'Published' },
              { value: 'UNPUBLISHED', label: 'Unpublished' },
              { value: 'CLOSED', label: 'Closed' }
            ]
          }
        ]}
        actions={
          <Button size="sm" variant="secondary" onClick={() => loadJobs(1)}>
            Search
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={jobs}
        loading={loading}
        meta={meta}
        onPageChange={setPage}
        emptyTitle="No job requisitions yet"
        emptyDescription="Sync approved requisitions from HRMS or create a manual job listing."
      />

      <JobFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        job={editingJob}
        onSaved={() => {
          setModalOpen(false);
          loadJobs(page);
        }}
      />
    </PageTransition>
  );
}

