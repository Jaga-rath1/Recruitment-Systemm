import React from 'react';
import {
  ShieldCheck,
  User,
  KeyRound,
  Server,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Cpu,
  Layers,
  ArrowRight
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { PageTransition } from '../../components/common/MotionPrimitives';
import { useAuth } from '../../context/AuthContext';

export default function PlatformAdministrationPage() {
  const { user, organisation, logout } = useAuth();

  return (
    <PageTransition className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Platform Administration & RBAC Security
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Super Administrator identity verification, token scope inspection, and microservice integration topology.
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={logout}>
          Sign Out of Session
        </Button>
      </div>

      {/* Admin Profile & Session Inspection */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card
          title="Super Admin Identity"
          subtitle="Authenticated user claims from Auth Service"
          className="lg:col-span-1"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white font-bold text-lg shadow-sm">
                {user?.name?.[0] || user?.email?.[0] || 'A'}
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-sm text-slate-900 truncate">
                  {user?.name || user?.email || 'Platform Administrator'}
                </h4>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Active Role:</span>
                <span className="rounded-md bg-brand-50 border border-brand-200 px-2 py-0.5 font-semibold text-brand-700">
                  {user?.activeRoleCode || 'PLATFORM_ADMIN'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">User ID:</span>
                <span className="font-mono text-slate-900 truncate max-w-[170px]" title={user?.userId || user?.id}>
                  {user?.userId || user?.id || 'super-admin-root'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Scope:</span>
                <span className="font-semibold text-slate-900">Platform-Wide (Cross-Tenant)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">RBAC Authorization:</span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Full Access
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Security & Access Guard Architecture */}
        <Card
          title="Microservice Security Architecture"
          subtitle="How Platform Service authorizes requests"
          className="lg:col-span-2"
        >
          <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-bold text-sm text-slate-900 mb-2 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-600" />
                Three-Tier RBAC Guard Model
              </h4>
              <ol className="list-decimal pl-4 space-y-1.5 text-slate-700">
                <li>
                  <strong>Client Authentication:</strong> User signs in via Auth Service and receives a signed JWT with role claim <code className="font-mono text-slate-900 font-semibold">super_admin</code>.
                </li>
                <li>
                  <strong>API Gateway Boundary:</strong> The API Gateway (Port 4000) validates the token, verifies active session, injects verified headers (<code className="font-mono">x-user-role=super_admin</code>, <code className="font-mono">x-internal-token</code>), and strips untrusted client headers.
                </li>
                <li>
                  <strong>Platform Service Authorizer:</strong> The backend middleware <code className="font-mono">requirePlatformAdmin</code> verifies that <code className="font-mono">x-user-role === 'super_admin'</code> and that the internal token matches. Requests from non-admin roles receive <code className="font-mono">403 Forbidden</code>.
                </li>
              </ol>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <span className="font-semibold text-slate-900 block mb-1">Protected Routes</span>
                <p className="text-slate-500">
                  All <code className="font-mono">/api/v1/platform/*</code> endpoints (plans, modules, subscriptions, trials, entitlements) require Platform Admin access.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <span className="font-semibold text-slate-900 block mb-1">Self-Service Route</span>
                <p className="text-slate-500">
                  <code className="font-mono">/api/v1/platform/entitlements/me</code> permits any authenticated organization user to read their own organization's live feature flags.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Microservice Port Matrix */}
      <Card
        title="Microservice Topology & Verified Local Ports"
        subtitle="Shared microservice cluster configuration and responsibilities"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <span className="font-bold text-xs text-slate-900 block">Platform Service</span>
            <span className="font-mono text-xs text-brand-600 font-semibold block mt-0.5">Port 4002</span>
            <p className="text-[11px] text-slate-500 mt-1">
              Plans, modules catalog, subscriptions, and entitlement resolution engine.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <span className="font-bold text-xs text-slate-900 block">API Gateway</span>
            <span className="font-mono text-xs text-brand-600 font-semibold block mt-0.5">Port 4000</span>
            <p className="text-[11px] text-slate-500 mt-1">
              Reverse proxy, JWT token verification, RBAC normalization, session checks.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <span className="font-bold text-xs text-slate-900 block">Auth Service</span>
            <span className="font-mono text-xs text-brand-600 font-semibold block mt-0.5">Port 4001</span>
            <p className="text-[11px] text-slate-500 mt-1">
              User identity, super_admin provisioning, password hashing, and session issuance.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <span className="font-bold text-xs text-slate-900 block">Recruitment Service</span>
            <span className="font-mono text-xs text-brand-600 font-semibold block mt-0.5">Port 4007</span>
            <p className="text-[11px] text-slate-500 mt-1">
              Talent acquisition, candidate portal, job applications, interview schedules.
            </p>
          </div>
        </div>
      </Card>
    </PageTransition>
  );
}

