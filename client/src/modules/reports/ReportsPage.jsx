import React, { useEffect, useState } from 'react';
import { reportApi } from '../../api';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import ErrorState from '../../components/common/ErrorState';
import { PageTransition, StaggerGrid, StaggerItem } from '../../components/common/MotionPrimitives';

export default function ReportsPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    reportApi
      .getSummary()
      .then((res) => setReport(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error) return <ErrorState message={error} />;

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Recruitment Analytics & Reports</h1>
        <p className="mt-1 text-sm text-slate-600">
          Source comparison, stage funnel conversion, offer ratios, and recent hires.
        </p>
      </div>

      <StaggerGrid className="grid gap-6 md:grid-cols-2">
        <StaggerItem>
          <Card title="Jobs by Source" subtitle="HRMS Sync vs Manual Requisitions" className="h-full">
            <div className="space-y-2">
              {(report?.jobsBySource || []).map((row) => (
                <div key={row.sourceType} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
                  <Badge status={row.sourceType} />
                  <span className="font-bold text-slate-900">{row.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card title="Pipeline Stage Funnel" subtitle="Candidate count across active stages" className="h-full">
            <div className="space-y-2">
              {(report?.funnelStages || []).map((row) => (
                <div key={row.stage} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
                  <Badge status={row.stage} />
                  <span className="font-bold text-slate-900">{row.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card title="Offer Conversion" subtitle="Offer status distribution" className="h-full">
            <div className="space-y-2">
              {(report?.offers || []).map((row) => (
                <div key={row.status} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
                  <Badge status={row.status} />
                  <span className="font-bold text-slate-900">{row.count}</span>
                </div>
              ))}
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card title="Recent Hires" subtitle="Confirmed joiners" className="h-full">
            {(report?.recentHires || []).length === 0 ? (
              <p className="text-xs text-slate-500">No confirmed hires yet.</p>
            ) : (
              <div className="space-y-2">
                {report.recentHires.map((hire) => (
                  <div key={hire.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">{hire.application?.candidate?.fullName}</p>
                      <p className="text-slate-500">{hire.application?.job?.title}</p>
                    </div>
                    <Badge status="HIRED" />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </StaggerItem>
      </StaggerGrid>
    </PageTransition>
  );
}

