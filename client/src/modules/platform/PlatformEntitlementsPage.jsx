import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  KeyRound,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ShieldAlert,
  Layers,
  Building2,
  Clock,
  ArrowRight,
  Sliders
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import EmptyState from '../../components/common/EmptyState';
import { PageTransition } from '../../components/common/MotionPrimitives';
import { platformApi } from '../../api';
import { useToast } from '../../context/ToastContext';

export default function PlatformEntitlementsPage() {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialOrgId = searchParams.get('orgId') || '2bd19235-b81a-4ea7-9cac-457e888b63b2';

  const [inputOrgId, setInputOrgId] = useState(initialOrgId);
  const [activeOrgId, setActiveOrgId] = useState(initialOrgId);
  const [loading, setLoading] = useState(false);
  const [entitlements, setEntitlements] = useState(null);

  const KNOWN_ORGS = [
    { id: '2bd19235-b81a-4ea7-9cac-457e888b63b2', name: 'Nexnuv Private Limited' },
    { id: '2e118174-598c-4fe3-a2be-b110d6285fc1', name: 'Test Nexnuv' },
    { id: '3909e28d-8449-4808-84ce-e610839a2c8d', name: 'Nexnuv Helpdesk Tenant' }
  ];

  const fetchEntitlements = useCallback(
    async (orgId) => {
      if (!orgId || !orgId.trim()) return;
      const cleanId = orgId.trim();
      setActiveOrgId(cleanId);
      setSearchParams({ orgId: cleanId });
      setLoading(true);

      try {
        const res = await platformApi.getOrgEntitlements(cleanId);
        setEntitlements(res.data || null);
      } catch (err) {
        addToast({ title: 'Resolution Failed', message: err.message, variant: 'error' });
      } finally {
        setLoading(false);
      }
    },
    [setSearchParams, addToast]
  );

  useEffect(() => {
    if (initialOrgId) {
      fetchEntitlements(initialOrgId);
    }
  }, [initialOrgId, fetchEntitlements]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchEntitlements(inputOrgId);
  };

  const getReasonBadge = (reason) => {
    switch (reason) {
      case 'organization_not_found':
        return <span className="rounded-md bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">Organization Not Found</span>;
      case 'organization_inactive':
        return <span className="rounded-md bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">Organization Inactive</span>;
      case 'no_subscription':
        return <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">No Active Subscription</span>;
      case 'subscription_expired':
        return <span className="rounded-md bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">Subscription Expired</span>;
      case 'trial_expired':
        return <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Trial Expired</span>;
      case 'plan_inactive':
        return <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Plan Inactive</span>;
      default:
        return <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">{reason || 'Unknown'}</span>;
    }
  };

  return (
    <PageTransition className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Usage & Resource Limits (Live Entitlements Engine)
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Real-time evaluation of subscription entitlements, authorized modules, and downstream microservice feature flags.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          onClick={() => fetchEntitlements(activeOrgId)}
          loading={loading}
        >
          Re-evaluate
        </Button>
      </div>

      {/* Backend Architecture & Limitation Transparency Banner */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 sm:p-5">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <Info className="h-5 w-5" />
          </div>
          <div className="space-y-1 text-xs text-blue-900 leading-relaxed">
            <p className="font-semibold text-sm">Entitlement Enforcement Model & Quota Transparency</p>
            <p>
              The NEXNUV Platform Service enforces <strong>feature-level entitlements</strong> across all shared microservices.
              When an organization requests HRMS or Recruitment endpoints, the downstream service calls{' '}
              <code className="font-mono font-semibold bg-white px-1.5 py-0.5 rounded border border-blue-200">
                GET /api/v1/platform/entitlements/organizations/:orgId
              </code>{' '}
              to check if the required module/submodule key is present in <code className="font-mono">features[]</code>.
            </p>
            <p className="text-blue-800/90 pt-1">
              <strong>Backend Limitation Note:</strong> Hard numerical quotas (such as maximum employee headcount limits or storage GB meters) are not defined in the current Platform database schema; only boolean feature gating is currently implemented.
            </p>
          </div>
        </div>
      </div>

      {/* Tenant Lookup Toolbar */}
      <Card noPadding>
        <div className="p-4 sm:p-5 space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Enter Organization UUID to audit live entitlements..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-600 focus:outline-none"
                value={inputOrgId}
                onChange={(e) => setInputOrgId(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" loading={loading}>
              Audit Entitlements
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="font-semibold text-slate-500">Quick Audit:</span>
            {KNOWN_ORGS.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => {
                  setInputOrgId(org.id);
                  fetchEntitlements(org.id);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  activeOrgId === org.id
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                <span>{org.name}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Entitlements Audit Report */}
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : !entitlements ? (
        <EmptyState
          title="No Entitlement Record"
          description="Enter a valid organization UUID above to run the entitlement resolution engine."
        />
      ) : (
        <div className="space-y-6">
          {/* Engine Resolution Summary Card */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                  Entitlement Resolution Result
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">
                  Tenant: <span className="font-mono text-base font-semibold text-slate-700">{entitlements.organizationId}</span>
                </h3>
              </div>

              <div className="flex items-center gap-3">
                {entitlements.active ? (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <div>
                      <span className="text-xs font-bold text-emerald-900 block">ENTITLED (ACTIVE)</span>
                      <span className="text-[11px] text-emerald-700">Access granted to authorized services</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-2">
                    <XCircle className="h-5 w-5 text-rose-600" />
                    <div>
                      <span className="text-xs font-bold text-rose-900 block">ACCESS DENIED</span>
                      <div className="mt-0.5">{getReasonBadge(entitlements.reason)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Subscription Metadata Context */}
            {entitlements.subscription && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Bound Plan:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {entitlements.subscription.plan?.name || 'Default Tier'}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 block">
                    Code: {entitlements.subscription.plan?.code}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Subscription Status:</span>
                  <div className="mt-1">
                    <Badge status={entitlements.subscription.status} />
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 block">Plan Status:</span>
                  <span className="font-semibold text-slate-900 capitalize">
                    {entitlements.subscription.plan?.status || 'Active'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Period Validity:</span>
                  <span className={`font-semibold ${entitlements.subscription.expired ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {entitlements.subscription.expired ? 'Period Expired' : 'Current & Valid'}
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Module & Feature Breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Authorized Modules Card */}
            <Card
              title="Authorized Software Modules"
              subtitle="Coarse-grained application suites currently accessible to this organization"
            >
              {entitlements.modules?.length > 0 ? (
                <div className="space-y-3">
                  {entitlements.modules.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-slate-900">{m.name}</span>
                        <span className="font-mono text-xs bg-brand-50 border border-brand-200 text-brand-700 rounded px-2 py-0.5">
                          {m.code}
                        </span>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        <span className="text-xs font-semibold text-slate-500 block">Authorized Submodules:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {m.submodules?.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center gap-1 rounded bg-white border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              {s.name} <code className="text-[10px] text-slate-400">({s.code})</code>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-500">
                  No modules are authorized for this tenant under their current plan.
                </div>
              )}
            </Card>

            {/* Resolved Feature Flags List */}
            <Card
              title="Resolved RBAC Feature Keys"
              subtitle="Flat list of uppercase keys matched by downstream services"
            >
              {entitlements.features?.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {entitlements.features.map((feat) => (
                      <div
                        key={feat}
                        className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/70 px-3 py-1.5 font-mono text-xs font-semibold text-brand-800 shadow-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">
                    <p className="font-semibold text-slate-800 mb-1">Downstream Verification Contract:</p>
                    <p>
                      Each microservice (such as Employee Service or Recruitment) invokes entitlement resolution and checks if the required capability key is in the array above. If present, the user's action proceeds; otherwise, a 403 Forbidden is returned.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-500">
                  No feature keys resolved for this tenant.
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </PageTransition>
  );
}

