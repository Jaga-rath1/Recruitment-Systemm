import React, { useEffect, useState } from 'react';
import { candidateApi } from '../../api';
import DataTable from '../../components/common/DataTable';
import SearchFilterBar from '../../components/common/SearchFilterBar';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function CandidatesPage() {
  const { addToast } = useToast();
  const [candidates, setCandidates] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const loadCandidates = async (targetPage = page) => {
    setLoading(true);
    try {
      const res = await candidateApi.list({ search: search || undefined, page: targetPage, limit: 15 });
      setCandidates(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      addToast({ title: 'Failed to load candidates', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates(page);
  }, [page]);

  const columns = [
    {
      key: 'name',
      label: 'Candidate',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900">{row.fullName}</p>
          <p className="text-xs text-slate-500">{row.email} · {row.mobileNumber}</p>
        </div>
      )
    },
    {
      key: 'exp',
      label: 'Experience',
      render: (row) => <span className="text-xs font-medium">{row.totalExperienceYears} yrs · {row.currentCompany || '—'}</span>
    },
    {
      key: 'location',
      label: 'Location'
    },
    {
      key: 'latestStage',
      label: 'Latest Application',
      render: (row) => {
        const latest = row.applications?.[0];
        return latest ? <Badge status={latest.currentStage} /> : <span className="text-xs text-slate-400">—</span>;
      }
    },
    {
      key: 'actions',
      label: 'Profile',
      render: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setSelected(row)}>
          View Profile
        </Button>
      )
    }
  ];

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Candidate Directory</h1>
        <p className="mt-1 text-sm text-slate-600">
          Tenant-isolated candidate talent pool across all active and past applications.
        </p>
      </div>

      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search candidates by name, email, location, or company..."
        actions={
          <Button size="sm" variant="secondary" onClick={() => loadCandidates(1)}>
            Search
          </Button>
        }
      />

      <DataTable columns={columns} rows={candidates} loading={loading} meta={meta} onPageChange={setPage} />

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.fullName}
        subtitle={`${selected?.email} · ${selected?.location}`}
      >
        {selected && (
          <div className="space-y-4 text-xs">
            <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <p><strong>Mobile:</strong> {selected.mobileNumber}</p>
              <p><strong>Experience:</strong> {selected.totalExperienceYears} years</p>
              <p><strong>Current Salary:</strong> {selected.currentSalary || '—'}</p>
              <p><strong>Expected Salary:</strong> {selected.expectedSalary || '—'}</p>
              <p><strong>Notice Period:</strong> {selected.noticePeriodDays} days</p>
              <p><strong>Skills:</strong> {(selected.skills || []).join(', ') || '—'}</p>
            </div>
            <div>
              <h4 className="mb-2 font-semibold uppercase text-slate-500">Applications ({selected.applications?.length || 0})</h4>
              <div className="space-y-2">
                {(selected.applications || []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <div>
                      <p className="font-semibold text-slate-900">{a.job?.title}</p>
                      <p className="font-mono text-[11px] text-slate-500">{a.applicationReference}</p>
                    </div>
                    <Badge status={a.currentStage} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </PageTransition>
  );
}

