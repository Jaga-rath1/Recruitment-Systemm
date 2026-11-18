import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Briefcase, Clock, Building2, ArrowRight } from 'lucide-react';
import { jobApi } from '../../api';
import SearchFilterBar from '../../components/common/SearchFilterBar';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Pagination from '../../components/common/Pagination';
import { PageTransition, StaggerGrid, StaggerItem } from '../../components/common/MotionPrimitives';

export default function CareersPage() {
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [page, setPage] = useState(1);

  const loadJobs = async (targetPage = page) => {
    setLoading(true);
    setError('');
    try {
      const res = await jobApi.listPublicCareers({
        search: search || undefined,
        employmentType: employmentType || undefined,
        page: targetPage,
        limit: 12
      });
      setJobs(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs(page);
  }, [page, employmentType]);

  return (
    <PageTransition className="w-full px-4 py-12 sm:px-6 lg:px-10 xl:px-12">
      <div className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-100 pb-8 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
            Public Careers Board
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Open Positions Across Hiring Organisations
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Browse verified openings and submit your application directly to hiring teams.
          </p>
        </div>
        {!loading && meta?.total !== undefined && (
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700">
            {meta.total} Open Role{meta.total === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search job titles, departments, or keywords..."
        filters={[
          {
            name: 'employmentType',
            label: 'Employment Type',
            value: employmentType,
            onChange: (v) => {
              setPage(1);
              setEmploymentType(v);
            },
            options: [
              { value: '', label: 'All Types' },
              { value: 'FULL_TIME', label: 'Full Time' },
              { value: 'PART_TIME', label: 'Part Time' },
              { value: 'CONTRACT', label: 'Contract' },
              { value: 'INTERNSHIP', label: 'Internship' }
            ]
          }
        ]}
        actions={
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setPage(1);
              loadJobs(1);
            }}
          >
            Search Jobs
          </Button>
        }
      />

      <div className="mt-6">
        {loading ? (
          <LoadingSkeleton rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={() => loadJobs(page)} />
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No published openings match your search"
            description="Check back soon or clear filters to explore all open roles."
          />
        ) : (
          <div className="space-y-6">
            <StaggerGrid className="grid gap-5 lg:grid-cols-2">
              {jobs.map((job) => (
                <StaggerItem key={job.id}>
                  <Link
                    to={`/careers/${job.slug || job.id}`}
                    className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevated"
                  >
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs font-medium text-brand-700">
                            <Building2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{job.organisationName}</span>
                          </div>
                          <h2 className="mt-1.5 text-lg font-semibold text-slate-900">{job.title}</h2>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <Badge status="PUBLISHED">{job.employmentType?.replace(/_/g, ' ')}</Badge>
                          <span className="text-xs font-semibold text-slate-700">{job.salaryDisplay}</span>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Briefcase className="h-3.5 w-3.5" />
                          {job.department}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.location}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {job.experienceLabel}
                        </span>
                      </div>

                      {Array.isArray(job.skills) && job.skills.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {job.skills.slice(0, 6).map((skill) => (
                            <span
                              key={skill}
                              className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 flex items-center gap-1 border-t border-slate-100 pt-4 text-xs font-semibold text-brand-600">
                      <span>View Details & Apply</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerGrid>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <Pagination meta={meta} onPageChange={setPage} />
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
