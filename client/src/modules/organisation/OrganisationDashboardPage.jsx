import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, FileText, CalendarClock, Award, UserCheck, Clock, Sparkles, ArrowRight, AlertTriangle } from 'lucide-react';
import { organisationApi, subscriptionApi } from '../../api';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import ErrorState from '../../components/common/ErrorState';
import { useAuth } from '../../context/AuthContext';
import { PageTransition, StaggerGrid, StaggerItem } from '../../components/common/MotionPrimitives';

export default function OrganisationDashboardPage() {
  const { user, hasPermission } = useAuth();
  const [data, setData] = useState(null);
  const [subStatus, setSubStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const [dashRes, subRes] = await Promise.allSettled([
        organisationApi.getDashboard(),
        subscriptionApi.getCurrentStatus()
      ]);

      if (dashRes.status === 'fulfilled') {
        setData(dashRes.value.data);
      } else {
        throw dashRes.reason;
      }

      if (subRes.status === 'fulfilled') {
        setSubStatus(subRes.value.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasPermission('organisation:view')) {
      loadDashboard();
    } else {
      setLoading(false);
    }
  }, []);

  if (!hasPermission('organisation:view')) {
    return (
      <Card
        title={`Welcome, ${user?.name}`}
        subtitle={`Signed in as ${String(user?.activeRoleCode || '').replace(/_/g, ' ')}`}
      >
        <p className="text-sm text-slate-600">
          Use the navigation menu to open your assigned interviews and submit confidential evaluations.
        </p>
        <Link
          to="/app/interviews"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Go to My Assigned Interviews
        </Link>
      </Card>
    );
  }

  if (loading) return <LoadingSkeleton rows={6} />;
  if (error) return <ErrorState message={error} onRetry={loadDashboard} />;

  const metrics = data?.metrics || {};
  const profile = data?.profile || {};

  const kpis = [
    { label: 'Published Jobs', value: metrics.publishedJobs ?? 0, sub: `${metrics.totalJobs ?? 0} total`, icon: Briefcase },
    { label: 'Total Applications', value: metrics.totalApplications ?? 0, sub: 'All active stages', icon: FileText },
    { label: 'Upcoming Interviews', value: metrics.upcomingInterviews ?? 0, sub: 'Technical & Managerial', icon: CalendarClock },
    { label: 'Pending Offers', value: metrics.pendingOffers ?? 0, sub: 'Awaiting candidate decision', icon: Award },
    { label: 'Hired Candidates', value: metrics.hiredCount ?? 0, sub: 'Completed joining', icon: UserCheck }
  ];

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{profile.name || 'Organisation Dashboard'}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Real-time hiring pipeline overview and active tenant metrics.
          </p>
        </div>
        {profile.subscription && (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-card">
            <span className="text-xs font-medium text-slate-500">Subscription:</span>
            <Badge status={profile.subscription.status} />
          </div>
        )}
      </div>

      {/* Trial Status or Expired Alert Banner */}
      {subStatus?.isTrial && !subStatus?.isExpired && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 via-blue-50/70 to-indigo-50/60 p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-800">
                  15-Day Free Trial Active
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {subStatus.daysRemaining} {subStatus.daysRemaining === 1 ? 'day' : 'days'} remaining
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                Evaluating {subStatus.planName || 'Advanced'} tier. Trial expires on{' '}
                {subStatus.expiresAt
                  ? new Date(subStatus.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : '15 days from start'}
                .
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <Link to="/pricing">
              <Button size="sm" variant="primary" className="shadow-xs">
                <span>Upgrade to Paid Plan</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {subStatus?.isExpired && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white shadow-xs">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                15-Day Free Trial Expired
              </span>
              <p className="mt-0.5 text-xs text-amber-800">
                Your 15-day evaluation has concluded. Select Basic, Advanced, or Enterprise to restore full ATS access.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <Link to="/pricing">
              <Button size="sm" className="bg-amber-700 hover:bg-amber-800 text-white">
                <span>Select Subscription Plan</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      <StaggerGrid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <StaggerItem
              key={kpi.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-elevated"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{kpi.label}</span>
                <div className="rounded-xl bg-brand-50 p-2 text-brand-600">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{kpi.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{kpi.sub}</p>
            </StaggerItem>
          );
        })}
      </StaggerGrid>

      <Card title="Pipeline Stage Distribution" subtitle="Live breakdown across all open requisitions">
        {Array.isArray(metrics.stageBreakdown) && metrics.stageBreakdown.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {metrics.stageBreakdown.map((item) => (
              <div key={item.stage} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                <Badge status={item.stage} />
                <span className="text-lg font-bold text-slate-900">{item.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No applications in pipeline yet.</p>
        )}
      </Card>
    </PageTransition>
  );
}

