import React, { useEffect, useState } from 'react';
import { portalApi } from '../../api';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import { InputField } from '../../components/common/FormField';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';
import CandidateSecurityCard from './CandidateSecurityCard';
import CandidateClaimCard from './CandidateClaimCard';

export default function CandidateProfilePage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountSecurity, setAccountSecurity] = useState(null);
  const [form, setForm] = useState({
    fullName: '',
    mobileNumber: '',
    location: '',
    totalExperienceYears: '',
    currentCompany: '',
    expectedSalary: '',
    headline: ''
  });

  useEffect(() => {
    portalApi
      .getOverview()
      .then((res) => {
        setAccountSecurity(res.data?.accountSecurity || null);
        const p = res.data?.profile || {};
        setForm({
          fullName: p.fullName || '',
          mobileNumber: p.mobileNumber || '',
          location: p.location || '',
          totalExperienceYears: String(p.totalExperienceYears ?? ''),
          currentCompany: p.currentCompany || '',
          expectedSalary: p.expectedSalary || '',
          headline: p.headline || ''
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await portalApi.updateProfile({
        ...form,
        totalExperienceYears: form.totalExperienceYears ? Number(form.totalExperienceYears) : undefined
      });
      addToast({ title: 'Profile Updated', message: 'Your candidate profile is saved.', variant: 'success' });
    } catch (err) {
      addToast({ title: 'Update Failed', message: err.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSkeleton rows={4} />;

  return (
    <PageTransition className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Candidate Profile</h1>
        <p className="mt-1 text-sm text-slate-600">Keep your contact and professional details current.</p>
      </div>

      <Card title="Personal & Career Information" subtitle="Used across your active applications inside the Candidate Portal.">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField label="Full Name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            <InputField label="Headline" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Senior Security Engineer" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField label="Mobile Number" value={form.mobileNumber} onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })} />
            <InputField label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <InputField label="Experience (Years)" type="number" step="0.5" value={form.totalExperienceYears} onChange={(e) => setForm({ ...form, totalExperienceYears: e.target.value })} />
            <InputField label="Current Company" value={form.currentCompany} onChange={(e) => setForm({ ...form, currentCompany: e.target.value })} />
            <InputField label="Expected Salary" value={form.expectedSalary} onChange={(e) => setForm({ ...form, expectedSalary: e.target.value })} />
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" loading={saving}>Save Profile</Button>
          </div>
        </form>
      </Card>
      <CandidateSecurityCard accountSecurity={accountSecurity} />
      <CandidateClaimCard
        onClaimed={async () => {
          const res = await portalApi.getOverview();
          setAccountSecurity(res.data?.accountSecurity || null);
        }}
      />
    </PageTransition>
  );
}

