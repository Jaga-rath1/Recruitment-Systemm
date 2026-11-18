import React, { useState } from 'react';
import { ShieldCheck, Workflow, Building2 } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { InputField, TextAreaField } from '../../components/common/FormField';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function ContactPage() {
  const { addToast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', organisation: '', message: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    addToast({
      title: 'Inquiry Recorded',
      message: `Thank you ${form.name}. Our enterprise onboarding team will contact ${form.email}.`,
      variant: 'success'
    });
    setForm({ name: '', email: '', organisation: '', message: '' });
  };

  return (
    <PageTransition className="w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-10 xl:px-12">
      <div className="grid w-full items-start gap-10 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              Enterprise Support
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Contact NEXNUV Recruitment
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Questions about HRMS integration, enterprise onboarding, or custom security requirements?
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-6">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Enterprise Tenant Onboarding</p>
                <p className="text-xs text-slate-600">
                  Guidance on wire/ACH billing verification and passwordless admin activation.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Workflow className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
              <div>
                <p className="text-sm font-semibold text-slate-900">HRMS Adapter Alignment</p>
                <p className="text-xs text-slate-600">
                  Review REST integration contracts for Job, Auth, Employee, and Notification services.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Security & Isolation Review</p>
                <p className="text-xs text-slate-600">
                  Dedicated PostgreSQL tenant isolation, HMAC file signing, and RBAC permission mapping.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <Card title="Send an Enterprise Inquiry" subtitle="Share your hiring scale and HRMS integration context.">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Full Name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Alex Morgan"
                />
                <InputField
                  label="Work Email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="alex@company.com"
                />
              </div>
              <InputField
                label="Organisation"
                required
                value={form.organisation}
                onChange={(e) => setForm({ ...form, organisation: e.target.value })}
                placeholder="Acme Corp"
              />
              <TextAreaField
                label="Message"
                required
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Tell us about your hiring volume and HRMS setup..."
              />
              <Button type="submit" className="w-full">
                Send Inquiry
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
