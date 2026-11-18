import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { portalApi } from '../../api';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import StageTracker from '../../components/common/StageTracker';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import { PageTransition } from '../../components/common/MotionPrimitives';
import CandidateClaimCard from './CandidateClaimCard';

export default function CandidatePortalPage() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await portalApi.getOverview();
      setOverview(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  const applications = overview?.applications || [];

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Applications & Stage Tracker</h1>
          <p className="mt-1 text-sm text-slate-600">
            Track your live progress across every recruitment milestone.
          </p>
        </div>
        <Link to="/careers">
          <Button variant="secondary">Browse Open Positions</Button>
        </Link>
      </div>

      {applications.length === 0 ? (
        <EmptyState
          title="No job applications found"
          description="Apply to an open role on the Public Careers page to track your progress here."
          action={
            <Link to="/careers">
              <Button>Explore Careers</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {applications.map((app) => (
            <Card
              key={app.id}
              title={app.job?.title}
              subtitle={`${app.organisationName} · Ref: ${app.applicationReference}`}
              actions={<Badge status={app.currentStage} />}
            >
              <StageTracker steps={app.progressTracker} currentStage={app.currentStage} />

              <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 text-xs sm:grid-cols-3">
                <div>
                  <p className="font-semibold text-slate-500">Department & Location</p>
                  <p className="mt-0.5 text-slate-900">{app.job?.department} · {app.job?.location}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500">Applied On</p>
                  <p className="mt-0.5 text-slate-900">{new Date(app.submittedAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-500">Offer & Joining</p>
                  <p className="mt-0.5 text-slate-900">
                    {app.joiningRecord
                      ? `Joining: ${app.joiningRecord.status}`
                      : app.offer
                      ? `Offer: ${app.offer.status}`
                      : 'In evaluation'}
                  </p>
                </div>
              </div>

              {(app.stageHistory || []).length > 0 && (
                <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Application History</p>
                  <div className="space-y-1.5 text-xs">
                    {app.stageHistory.map((h) => (
                      <div key={h.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-slate-800">{h.note || h.action}</span>
                        <span className="text-slate-400">{new Date(h.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <CandidateClaimCard onClaimed={loadData} />
    </PageTransition>
  );
}

