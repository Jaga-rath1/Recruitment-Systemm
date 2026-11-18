import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, MapPin, Briefcase, Clock } from 'lucide-react';
import { jobApi, applicationApi } from '../../api';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import FileUpload from '../../components/common/FileUpload';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import ErrorState from '../../components/common/ErrorState';
import { InputField, TextAreaField } from '../../components/common/FormField';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function JobDetailApplyPage() {
  const { identifier } = useParams();
  const { addToast } = useToast();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    mobileNumber: '',
    location: '',
    totalExperienceYears: '',
    currentCompany: '',
    currentSalary: '',
    expectedSalary: '',
    noticePeriodDays: '30',
    skills: '',
    coverLetter: ''
  });

  useEffect(() => {
    setLoading(true);
    jobApi
      .getPublicJob(identifier)
      .then((res) => setJob(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [identifier]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!resumeFile) {
      return addToast({
        title: 'Resume Required',
        message: 'Please attach your resume (PDF/DOC/DOCX).',
        variant: 'error'
      });
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) fd.append(k, v);
      });
      fd.append('resume', resumeFile);

      const res = await applicationApi.applyPublic(job.id, fd);
      setConfirmation(res.data);
      addToast({
        title: 'Application Submitted',
        message: `Reference ${res.data.applicationReference} recorded.`,
        variant: 'success'
      });
    } catch (err) {
      addToast({ title: 'Submission Failed', message: err.message, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full px-4 py-12 sm:px-6 lg:px-10 xl:px-12">
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="w-full px-4 py-12 sm:px-6 lg:px-10 xl:px-12">
        <ErrorState message={error || 'Job listing not found'} />
      </div>
    );
  }

  return (
    <PageTransition className="w-full px-4 py-10 sm:px-6 lg:px-10 xl:px-12">
      <Link
        to="/careers"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Public Careers
      </Link>

      <div className="mt-6 grid w-full items-start gap-8 lg:grid-cols-12">
        <div className="space-y-5 lg:sticky lg:top-24 lg:col-span-5">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              {job.organisationName}
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
              {job.title}
            </h1>
            <div className="mt-4 space-y-2 text-xs text-slate-600">
              <p className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 shrink-0 text-slate-400" /> {job.department}
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" /> {job.location}
              </p>
              <p className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-slate-400" /> {job.experienceLabel} ·{' '}
                {job.salaryDisplay}
              </p>
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Description
              </h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {job.description}
              </p>
            </div>
            {Array.isArray(job.skills) && job.skills.length > 0 && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Key Skills
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.skills.map((s) => (
                    <span
                      key={s}
                      className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-7">
          {confirmation ? (
            <Card>
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                <h2 className="mt-4 text-xl font-bold text-slate-900">Application Confirmed</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Your application for <strong>{confirmation.jobTitle}</strong> has been received.
                </p>
                <div className="mt-5 inline-block rounded-xl border border-brand-200 bg-brand-50 px-5 py-3">
                  <span className="block text-xs text-brand-700">Application Reference</span>
                  <span className="text-lg font-bold tracking-wide text-slate-900">
                    {confirmation.applicationReference}
                  </span>
                  {job?.organisationId && (
                    <span className="mt-1.5 block font-mono text-[11px] text-slate-600">
                      Organisation ID: {job.organisationId}
                    </span>
                  )}
                </div>
                <p className="mt-5 text-xs text-slate-500">
                  Register and verify your email in the Candidate Portal to explicitly claim and track this application.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Link to="/login">
                    <Button>Open Candidate Portal</Button>
                  </Link>
                  <Link to="/careers">
                    <Button variant="secondary">Browse More Jobs</Button>
                  </Link>
                </div>
              </div>
            </Card>
          ) : (
            <Card
              title="Apply for this Position"
              subtitle="All fields are validated and resumes are stored securely."
            >
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField
                    label="Full Name"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                  <InputField
                    label="Email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField
                    label="Mobile Number"
                    required
                    value={form.mobileNumber}
                    onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })}
                  />
                  <InputField
                    label="Location"
                    required
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <InputField
                    label="Total Experience (Years)"
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={form.totalExperienceYears}
                    onChange={(e) => setForm({ ...form, totalExperienceYears: e.target.value })}
                  />
                  <InputField
                    label="Current Company"
                    value={form.currentCompany}
                    onChange={(e) => setForm({ ...form, currentCompany: e.target.value })}
                  />
                  <InputField
                    label="Notice Period (Days)"
                    type="number"
                    min="0"
                    value={form.noticePeriodDays}
                    onChange={(e) => setForm({ ...form, noticePeriodDays: e.target.value })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField
                    label="Current Salary"
                    placeholder="e.g. ₹12,00,000 / 1200000 INR"
                    value={form.currentSalary}
                    onChange={(e) => setForm({ ...form, currentSalary: e.target.value })}
                  />
                  <InputField
                    label="Expected Salary"
                    placeholder="e.g. ₹14,50,000 / 1450000 INR"
                    value={form.expectedSalary}
                    onChange={(e) => setForm({ ...form, expectedSalary: e.target.value })}
                  />
                </div>

                <InputField
                  label="Skills (comma-separated)"
                  placeholder="React, Node.js, PostgreSQL"
                  value={form.skills}
                  onChange={(e) => setForm({ ...form, skills: e.target.value })}
                />

                <FileUpload
                  label="Resume (PDF, DOC, DOCX)"
                  accept=".pdf,.doc,.docx"
                  required
                  file={resumeFile}
                  onFileSelect={setResumeFile}
                />

                <TextAreaField
                  label="Cover Letter"
                  rows={3}
                  value={form.coverLetter}
                  onChange={(e) => setForm({ ...form, coverLetter: e.target.value })}
                />

                <Button type="submit" loading={submitting} className="w-full">
                  Submit Application
                </Button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
