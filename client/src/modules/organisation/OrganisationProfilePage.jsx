import React, { useEffect, useState } from 'react';
import { organisationApi } from '../../api';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import ErrorState from '../../components/common/ErrorState';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function OrganisationProfilePage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    organisationApi
      .getProfile()
      .then((res) => setProfile(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton rows={4} />;
  if (error) return <ErrorState message={error} />;

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Organisation Profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Synchronized from NEXNUV Employee Service & Subscription Ledger.
        </p>
      </div>

      <Card title={profile.name} subtitle={`Tenant ID: ${profile.organisationId}`}>
        <div className="grid gap-6 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs text-slate-500">Domain</p>
            <p className="mt-1 font-semibold text-slate-900">{profile.domain}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs text-slate-500">Industry</p>
            <p className="mt-1 font-semibold text-slate-900">{profile.industry}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs text-slate-500">Company Size</p>
            <p className="mt-1 font-semibold text-slate-900">{profile.companySize}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs text-slate-500">Subscription Plan</p>
            <p className="mt-1 font-semibold text-slate-900">{profile.subscription?.planCode || 'RECRUITMENT_PREMIUM'}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs text-slate-500">Billing Cycle</p>
            <p className="mt-1 font-semibold text-slate-900">{profile.subscription?.billingCycle || 'ANNUAL'}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs text-slate-500">Plan Start Date</p>
            <p className="mt-1 font-semibold text-slate-900">
              {profile.subscription?.startsAt
                ? new Date(profile.subscription.startsAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                : 'Active upon approval'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs text-slate-500">Plan End Date</p>
            <p className="mt-1 font-semibold text-slate-900">
              {profile.subscription?.expiresAt
                ? new Date(profile.subscription.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                : '1 Year from start'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs text-slate-500">Subscription Status</p>
            <div className="mt-1">
              <Badge status={profile.subscription?.status || profile.status} />
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <p className="text-xs text-slate-500">Payment Status</p>
            <p className="mt-1 font-semibold text-emerald-700">Verified &amp; Active</p>
          </div>
        </div>
      </Card>
    </PageTransition>
  );
}

