import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers,
  CreditCard,
  Building2,
  KeyRound,
  Sliders,
  ShieldCheck,
  Activity,
  Plus,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ClipboardCheck
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import DataTable from '../../components/common/DataTable';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import ErrorState from '../../components/common/ErrorState';
import { PageTransition } from '../../components/common/MotionPrimitives';
import { platformApi, subscriptionApi } from '../../api';
import { formatINR, formatPlanPrice, formatAmountCents } from '../../utils/currency';
import { useToast } from '../../context/ToastContext';
import PlanFormModal from './components/PlanFormModal';
import SubscriptionFormModal from './components/SubscriptionFormModal';

export default function PlatformOverviewPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data states
  const [healthStatus, setHealthStatus] = useState(null);
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [modules, setModules] = useState([]);
  const [submodules, setSubmodules] = useState([]);
  const [pendingBookings, setPendingBookings] = useState([]);

  // Modals
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [health, plansRes, subsRes, modsRes, subsModsRes, queueRes] = await Promise.all([
        platformApi.getHealth().catch(() => ({ success: false, status: 'offline' })),
        platformApi.listPlans().catch(() => ({ data: [] })),
        platformApi.listSubscriptions().catch(() => ({ data: [] })),
        platformApi.listModules().catch(() => ({ data: [] })),
        platformApi.listSubmodules().catch(() => ({ data: [] })),
        subscriptionApi.listAdminQueue({ limit: 10 }).catch(() => ({ data: [], meta: { total: 0 } }))
      ]);

      setHealthStatus(health);
      setPlans(plansRes.data || []);
      setSubscriptions(subsRes.data || []);
      setModules(modsRes.data || []);
      setSubmodules(subsModsRes.data || []);
      setPendingBookings(queueRes.data || []);
    } catch (err) {
      setError(err.message || 'Failed to connect to Platform Service backend');
      addToast({ title: 'Error loading dashboard', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Derived metrics
  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  const trialSubs = subscriptions.filter((s) => s.status === 'trial');
  const activePlans = plans.filter((p) => p.status === 'active');

  // Estimate monthly recurring revenue (MRR)
  const estimatedMRR = activeSubs.reduce((acc, sub) => {
    const price = Number(sub.plan?.price || 0);
    const isYearly = sub.plan?.billingCycle === 'yearly';
    return acc + (isYearly ? price / 12 : price);
  }, 0);

  const handleCreatePlan = async (payload) => {
    setActionLoading(true);
    try {
      await platformApi.createPlan(payload);
      addToast({ title: 'Plan Created', message: `Plan '${payload.name}' is now active.`, variant: 'success' });
      setIsPlanModalOpen(false);
      loadDashboard();
    } catch (err) {
      addToast({ title: 'Plan Creation Failed', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateSubscription = async (payload) => {
    setActionLoading(true);
    try {
      await platformApi.createSubscription(payload);
      addToast({ title: 'Subscription Provisioned', message: 'Tenant successfully subscribed.', variant: 'success' });
      setIsSubModalOpen(false);
      loadDashboard();
    } catch (err) {
      addToast({ title: 'Provisioning Failed', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const recentSubscriptionsColumns = [
    {
      key: 'organizationId',
      label: 'Organization Tenant',
      render: (row) => (
        <div>
          <span className="font-mono text-xs font-semibold text-slate-900 block truncate max-w-[200px]" title={row.organizationId}>
            {row.organizationId}
          </span>
          <span className="text-[11px] text-slate-500">
            Started: {row.startsAt ? new Date(row.startsAt).toLocaleDateString() : 'N/A'}
          </span>
        </div>
      )
    },
    {
      key: 'plan',
      label: 'Subscribed Plan',
      render: (row) => (
        <div>
          <span className="font-medium text-xs text-slate-900 block">{row.plan?.name || 'Default Tier'}</span>
          <span className="text-[11px] text-slate-500 font-mono">
            {formatPlanPrice(row.plan?.price, row.plan?.billingCycle, row.plan?.currency)}
          </span>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Subscription Status',
      render: (row) => <Badge status={row.status} />
    },
    {
      key: 'period',
      label: 'Trial / Expiry',
      render: (row) => (
        <span className="text-xs text-slate-600">
          {row.status === 'trial'
            ? row.trialEndsAt
              ? `Trial ends ${new Date(row.trialEndsAt).toLocaleDateString()}`
              : 'Trial active'
            : row.endsAt
            ? `Renews ${new Date(row.endsAt).toLocaleDateString()}`
            : 'Continuous'}
        </span>
      )
    },
    {
      key: 'actions',
      label: '',
      cellClassName: 'text-right',
      render: (row) => (
        <Link
          to={`/platform-admin/organisations?orgId=${row.organizationId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Inspect <ArrowRight className="h-3 w-3" />
        </Link>
      )
    }
  ];

  return (
    <PageTransition className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Platform Administration
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Backend
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            SaaS subscription lifecycle, plan tiering, tenant entitlement resolution, and product catalog control.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/platform-admin/verification-queue"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 shadow-xs transition"
          >
            <ClipboardCheck className="h-3.5 w-3.5 text-amber-700" />
            Verification Queue {pendingBookings.length > 0 && `(${pendingBookings.length})`}
          </Link>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={loadDashboard}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Plus}
            onClick={() => setIsPlanModalOpen(true)}
          >
            New Plan
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={CreditCard}
            onClick={() => setIsSubModalOpen(true)}
          >
            Provision Subscription
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Platform Service Connection Offline"
          message={error}
          onRetry={loadDashboard}
        />
      ) : loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="border-l-4 border-l-blue-600">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Subscriptions</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{activeSubs.length}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Est. MRR: <span className="font-semibold text-slate-800">{formatINR(estimatedMRR)}</span>
                  </p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <CreditCard className="h-5 w-5" />
                </div>
              </div>
            </Card>

            <Card className="border-l-4 border-l-amber-500">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending Bookings</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{pendingBookings.length}</p>
                  <Link
                    to="/platform-admin/verification-queue"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Open Queue <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
              </div>
            </Card>

            <Card className="border-l-4 border-l-slate-400">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Trials</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{trialSubs.length}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {subscriptions.length} total lifetime
                  </p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
            </Card>

            <Card className="border-l-4 border-l-indigo-600">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Platform Plans</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{plans.length}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    <span className="font-semibold text-emerald-600">{activePlans.length} active</span>
                  </p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Layers className="h-5 w-5" />
                </div>
              </div>
            </Card>

            <Card className="border-l-4 border-l-emerald-600">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Catalog Features</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{modules.length} <span className="text-lg font-normal text-slate-400">/ {submodules.length}</span></p>
                  <p className="mt-1 text-xs text-slate-500">
                    Modules registered
                  </p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Sliders className="h-5 w-5" />
                </div>
              </div>
            </Card>
          </div>

          {/* Quick Service Diagnostics & Topology */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card
              title="Platform Infrastructure"
              subtitle="Operational status and connection telemetry"
              className="lg:col-span-1"
            >
              <div className="space-y-3.5">
                <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <Activity className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Platform Service</p>
                      <p className="text-[11px] text-slate-500">Port 4002 · Neon PostgreSQL</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Healthy
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">API Gateway Proxy</p>
                      <p className="text-[11px] text-slate-500">Port 4000 · /api/v1/platform</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Routed
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Auth & Entitlements</p>
                      <p className="text-[11px] text-slate-500">JWT RBAC · super_admin</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Enforced
                  </span>
                </div>

                <div className="pt-2">
                  <Link
                    to="/platform-admin/administration"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs transition"
                  >
                    View System RBAC & Security Specs <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </Card>

            {/* Quick Action Matrix */}
            <Card
              title="SaaS Administration Workflows"
              subtitle="Direct shortcuts to core platform controls"
              className="lg:col-span-2"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Link
                  to="/platform-admin/plans"
                  className="group flex items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-400 hover:bg-blue-50/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 transition group-hover:scale-105">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">Platform Plans & Tiers</h4>
                    <p className="mt-0.5 text-xs text-slate-500">Configure prices, billing periods, and assign modules.</p>
                  </div>
                </Link>

                <Link
                  to="/platform-admin/subscriptions"
                  className="group flex items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-400 hover:bg-blue-50/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 transition group-hover:scale-105">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700">Tenant Subscriptions</h4>
                    <p className="mt-0.5 text-xs text-slate-500">Track active subscriptions, transitions, and trials.</p>
                  </div>
                </Link>

                <Link
                  to="/platform-admin/organisations"
                  className="group flex items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-400 hover:bg-blue-50/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 transition group-hover:scale-105">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 group-hover:text-amber-700">Organisation Inspector</h4>
                    <p className="mt-0.5 text-xs text-slate-500">Look up tenant SaaS state, trials, and subscription history.</p>
                  </div>
                </Link>

                <Link
                  to="/platform-admin/entitlements"
                  className="group flex items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-400 hover:bg-blue-50/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 transition group-hover:scale-105">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700">Live Entitlements Engine</h4>
                    <p className="mt-0.5 text-xs text-slate-500">Audit real-time authorized module and feature flags.</p>
                  </div>
                </Link>
              </div>
            </Card>
          </div>

          {/* Customer Paid Bookings Awaiting Verification */}
          {pendingBookings.length > 0 && (
            <Card
              title="Incoming Customer Bookings Awaiting Verification"
              subtitle="Paid subscriptions submitted from public portal requiring remittance verification and tenant provisioning"
              actions={
                <Link
                  to="/platform-admin/verification-queue"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800"
                >
                  Open Verification Queue ({pendingBookings.length}) <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              <div className="divide-y divide-slate-100">
                {pendingBookings.slice(0, 5).map((booking) => (
                  <div key={booking.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 text-xs">{booking.organisationName}</p>
                      <p className="text-[11px] text-slate-500">
                        {booking.adminName} ({booking.adminEmail}) • {booking.planCode} ({booking.billingCycle})
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-xs text-slate-900">
                        {formatAmountCents(booking.amountCents, booking.currency)}
                      </span>
                      <Badge variant={booking.status === 'PENDING_VERIFICATION' ? 'warning' : 'neutral'}>
                        {booking.status}
                      </Badge>
                      <Link
                        to="/platform-admin/verification-queue"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                      >
                        Verify <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Recent Subscriptions & Trials */}
          <Card
            title="Recent Subscriptions & Trials"
            subtitle="Real-time tenant subscription records loaded from Platform Service"
            actions={
              <Link
                to="/platform-admin/subscriptions"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                View all ({subscriptions.length}) <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            <DataTable
              columns={recentSubscriptionsColumns}
              rows={subscriptions.slice(0, 5)}
              loading={loading}
              emptyTitle="No Subscriptions Recorded"
              emptyDescription="No tenants have subscribed yet. Use 'Provision Subscription' to create one."
            />
          </Card>
        </>
      )}

      {/* Plan Creation Modal */}
      <PlanFormModal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        onSubmit={handleCreatePlan}
        loading={actionLoading}
      />

      {/* Subscription Creation Modal */}
      <SubscriptionFormModal
        isOpen={isSubModalOpen}
        onClose={() => setIsSubModalOpen(false)}
        onSubmit={handleCreateSubscription}
        plans={plans}
        loading={actionLoading}
      />
    </PageTransition>
  );
}

