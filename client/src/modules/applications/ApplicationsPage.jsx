import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { applicationApi } from '../../api';
import DataTable from '../../components/common/DataTable';
import SearchFilterBar from '../../components/common/SearchFilterBar';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import ApplicationDetailModal from './ApplicationDetailModal';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function ApplicationsPage() {
  const { addToast } = useToast();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [page, setPage] = useState(1);
  const [selectedAppId, setSelectedAppId] = useState(null);

  const loadApplications = async (targetPage = page) => {
    setLoading(true);
    try {
      const res = await applicationApi.list({
        search: search || undefined,
        currentStage: stage || undefined,
        page: targetPage,
        limit: 12
      });
      setItems(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      addToast({ title: 'Failed to load applications', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications(page);
  }, [page, stage]);

  const columns = [
    {
      key: 'ref',
      label: 'Reference',
      render: (row) => <span className="font-mono text-xs font-semibold text-brand-700">{row.applicationReference}</span>
    },
    {
      key: 'candidate',
      label: 'Candidate',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900">{row.candidate?.fullName}</p>
          <p className="text-xs text-slate-500">
            {row.candidate?.email} · {row.candidate?.totalExperienceYears} yrs
          </p>
        </div>
      )
    },
    {
      key: 'job',
      label: 'Job Opening',
      render: (row) => (
        <div className="text-xs">
          <p className="font-medium text-slate-800">{row.job?.title}</p>
          <p className="text-slate-500">{row.job?.department}</p>
        </div>
      )
    },
    {
      key: 'screening',
      label: 'Screening',
      render: (row) => <Badge status={row.screeningStatus} />
    },
    {
      key: 'stage',
      label: 'Pipeline Stage',
      render: (row) => <Badge status={row.currentStage} />
    },
    {
      key: 'actions',
      label: 'Inspect',
      render: (row) => (
        <Button size="sm" variant="secondary" icon={Eye} onClick={() => setSelectedAppId(row.id)}>
          Review
        </Button>
      )
    }
  ];

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Candidate Applications</h1>
        <p className="mt-1 text-sm text-slate-600">
          Screen incoming applicants, review interview scorecards, and execute final selection decisions.
        </p>
      </div>

      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by candidate name, email, or reference..."
        filters={[
          {
            name: 'stage',
            label: 'Stage',
            value: stage,
            onChange: (v) => {
              setPage(1);
              setStage(v);
            },
            options: [
              { value: '', label: 'All Stages' },
              { value: 'APPLIED', label: 'Applied' },
              { value: 'SCREENING', label: 'Screening' },
              { value: 'TECHNICAL_INTERVIEW', label: 'Technical Interview' },
              { value: 'MANAGERIAL_INTERVIEW', label: 'Managerial Interview' },
              { value: 'FINAL_SELECTION', label: 'Final Selection' },
              { value: 'OFFER_PROCESSING', label: 'Offer Processing' },
              { value: 'OFFER_ACCEPTED', label: 'Offer Accepted' },
              { value: 'JOINING', label: 'Joining' },
              { value: 'HIRED', label: 'Hired' },
              { value: 'REJECTED', label: 'Rejected' }
            ]
          }
        ]}
        actions={
          <Button size="sm" variant="secondary" onClick={() => loadApplications(1)}>
            Search
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        meta={meta}
        onPageChange={setPage}
        emptyTitle="No applications yet"
        emptyDescription="Applications submitted on the public Careers page will appear here."
      />

      <ApplicationDetailModal
        applicationId={selectedAppId}
        onClose={() => setSelectedAppId(null)}
        onUpdated={() => loadApplications(page)}
      />
    </PageTransition>
  );
}

