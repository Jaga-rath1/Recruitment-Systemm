import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Workflow,
  Users,
  Briefcase,
  Layers,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import Button from '../../components/common/Button';
import {
  ENTER_EASE,
  PageTransition,
  FadeInSection,
  StaggerGrid,
  StaggerItem
} from '../../components/common/MotionPrimitives';

const FEATURES = [
  {
    icon: Briefcase,
    title: 'Dual-Source Job Engine',
    description:
      'Consume approved requisitions directly from your HRMS Job API while preserving source payloads, or author custom manual jobs with full publish controls.'
  },
  {
    icon: Workflow,
    title: '7-Stage Structured Hiring Pipeline',
    description:
      'Enforce deterministic transitions from Application and Screening through Technical Interview, Managerial Evaluation, Final Selection, Offer, and Joining.'
  },
  {
    icon: ShieldCheck,
    title: 'Granular Multi-Tenant RBAC',
    description:
      'Enforce Organisation Admin, Recruiter, Technical Interviewer, Senior Interviewer, and Candidate permissions strictly at every backend endpoint.'
  },
  {
    icon: Layers,
    title: 'Confidential Candidate Portal',
    description:
      'Give candidates real-time visual stage tracking, interview schedules, and digital offer acceptance while shielding internal interviewer remarks.'
  }
];

const WORKFLOW_STEPS = [
  '1. Subscribe & Verify Payment',
  '2. Sync HRMS or Publish Manual Jobs',
  '3. Screen Candidates & Schedule Tech Round',
  '4. Collect Technical & Senior Feedback',
  '5. Issue Offer Letters & Digital Acceptance',
  '6. Initiate Joining & Confirm Hire'
];

const FAQS = [
  {
    q: 'How does NEXNUV Recruitment integrate with our existing HRMS?',
    a: 'NEXNUV Recruitment consumes your HRMS Job API, Employee Service, Auth Service, Notification Service, and Platform Admin via dedicated REST integration adapters without duplicating master data.'
  },
  {
    q: 'Are interviewer evaluations visible to candidates?',
    a: 'No. Technical and Managerial interview scorecards, strengths, weaknesses, and internal recruiter remarks are strictly isolated from all Candidate Portal endpoints.'
  },
  {
    q: 'How does the 15-Day Free Trial and subscription onboarding work?',
    a: 'New organisations can activate a 15-day free trial instantly with zero credit card or wire commitment required. During or after evaluation, you can seamlessly transition to Basic (₹999/month), Advanced (₹1,999/month), or Enterprise (₹4,999/month) with full data preservation.'
  },
  {
    q: 'Does the platform rely on external message brokers?',
    a: 'No. All workflows, transactional stage updates, and REST notification dispatches run cleanly with PostgreSQL ACID guarantees and zero message broker overhead.'
  }
];

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <PageTransition className="w-full bg-white">
      {/* Hero */}
      <section className="w-full border-b border-slate-100 bg-gradient-to-b from-brand-50/70 via-white to-white">
        <div className="w-full px-4 py-14 sm:px-6 sm:py-20 lg:px-10 xl:px-12">
          <div className="grid w-full items-center gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                <Sparkles className="h-3.5 w-3.5" />
                Enterprise Multi-Tenant Talent Acquisition SaaS
              </span>
              <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:leading-[1.12]">
                Structured Enterprise Hiring from Requisition to Day-One Joining
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
                NEXNUV Recruitment unifies HRMS requisition sync, public careers publishing, role-isolated technical and managerial interviews, offer processing, and onboarding in one minimalist workspace.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <Link to="/subscribe?plan=TRIAL">
                  <Button size="lg" className="px-6">
                    <span>Start 15-Day Free Trial</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button variant="secondary" size="lg" className="px-6">
                    View Pricing Plans
                  </Button>
                </Link>
              </div>
              <p className="mt-5 text-xs text-slate-500">
                15-day risk-free trial · Basic, Advanced & Enterprise plans · Dedicated PostgreSQL tenant isolation
              </p>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-elevated sm:p-6">
                <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                      Architecture Snapshot
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      Enterprise Platform Readiness
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    Multi-Tenant
                  </span>
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {[
                    { label: 'Active Pipeline Stages', value: '8 Tracked Stages', sub: 'Applied → Hired' },
                    { label: 'Job Sources', value: 'HRMS + Manual', sub: 'Full source auditability' },
                    { label: 'RBAC Enforcement', value: '5 Canonical Roles', sub: '29 granular permissions' },
                    { label: 'Storage Security', value: 'Signed Tokens', sub: 'SHA-256 verified files' }
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 transition hover:border-brand-200 hover:bg-white"
                    >
                      <p className="text-xs font-medium text-slate-500">{stat.label}</p>
                      <p className="mt-1 text-lg font-bold text-slate-900">{stat.value}</p>
                      <p className="mt-0.5 text-xs text-brand-700">{stat.sub}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Sections */}
      <FadeInSection as="section" className="w-full px-4 py-16 sm:px-6 lg:px-10 xl:px-12">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              Platform Capabilities
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Built for High-Compliance Recruiting Teams
            </h2>
            <p className="mt-2.5 text-sm text-slate-600">
              Every workflow is backed by database transactions, idempotent API contracts, and clean role separation.
            </p>
          </div>
          <Link to="/features" className="shrink-0 text-xs font-semibold text-brand-600 hover:underline">
            View Full Feature Matrix →
          </Link>
        </div>

        <StaggerGrid className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <StaggerItem
                key={f.title}
                className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-elevated"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.description}</p>
              </StaggerItem>
            );
          })}
        </StaggerGrid>
      </FadeInSection>

      {/* Workflow Explanation */}
      <FadeInSection as="section" className="w-full border-y border-slate-100 bg-slate-50/80 py-16">
        <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-12">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
                End-to-End Execution
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                How NEXNUV Recruitment Works
              </h2>
            </div>
            <p className="max-w-lg text-sm text-slate-600">
              Deterministic transition rules connect tenant onboarding through day-one joining without external message queues.
            </p>
          </div>

          <StaggerGrid className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WORKFLOW_STEPS.map((step) => (
              <StaggerItem
                key={step}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-card transition hover:border-brand-200"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <p className="text-sm font-semibold text-slate-900">{step}</p>
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </FadeInSection>

      {/* Testimonials Placeholder (Clearly Marked) */}
      <FadeInSection as="section" className="w-full px-4 py-16 sm:px-6 lg:px-10 xl:px-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              Customer Stories
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Trusted by Modern Talent Teams
            </h2>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
            Placeholder Preview Testimonials
          </span>
        </div>

        <StaggerGrid className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              quote:
                '[Placeholder Testimonial] Consolidating HRMS job requisitions and structured technical scorecards reduced our time-to-offer by 40%.',
              author: 'Sample VP of People',
              company: 'Example Enterprise Org A'
            },
            {
              quote:
                '[Placeholder Testimonial] Interviewers only see their assigned candidates and submit consistent 1–10 rubrics without clutter.',
              author: 'Sample Engineering Director',
              company: 'Example Cloud Corp B'
            },
            {
              quote:
                '[Placeholder Testimonial] Candidates love the transparent 8-stage portal tracker and instant digital offer acceptance.',
              author: 'Sample Head of Talent',
              company: 'Example FinTech C'
            }
          ].map((item) => (
            <StaggerItem
              key={item.author}
              className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-6 shadow-xs"
            >
              <p className="text-sm leading-relaxed text-slate-700">{item.quote}</p>
              <div className="mt-6 flex items-center gap-3 border-t border-slate-200/70 pt-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900">{item.author}</p>
                  <p className="text-xs text-slate-500">{item.company}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerGrid>
      </FadeInSection>

      {/* FAQ */}
      <FadeInSection as="section" className="w-full border-t border-slate-100 bg-slate-50/70 py-16">
        <div className="grid w-full gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-10 xl:px-12">
          <div className="lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              Platform FAQ
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              Frequently Asked Questions
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Answers on HRMS synchronization, interviewer data isolation, tenant onboarding, and zero-broker workflows.
            </p>
            <Link
              to="/contact"
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
            >
              <span>Still have architectural questions? Contact us</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-3 lg:col-span-8">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={faq.q}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition hover:border-slate-300"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-slate-900 transition hover:bg-slate-50/70"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-brand-600' : ''
                      }`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: ENTER_EASE }}
                        className="overflow-hidden border-t border-slate-100"
                      >
                        <div className="px-5 py-4 text-sm leading-relaxed text-slate-600">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </FadeInSection>

      {/* Bottom CTA */}
      <FadeInSection as="section" className="w-full px-4 py-14 sm:px-6 lg:px-10 xl:px-12">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50/80 via-brand-50/50 to-white p-8 sm:flex-row sm:items-center sm:p-10">
          <div className="max-w-2xl">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900">
              Ready to modernize your recruitment pipeline?
            </h3>
            <p className="mt-1.5 text-sm text-slate-600">
              Start your 15-day free trial with instant setup, or choose from our Basic, Advanced, and Enterprise plans.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/pricing">
              <Button variant="secondary" size="lg">Compare Plans</Button>
            </Link>
            <Link to="/subscribe?plan=TRIAL" className="shrink-0">
              <Button size="lg">Start 15-Day Free Trial</Button>
            </Link>
          </div>
        </div>
      </FadeInSection>
    </PageTransition>
  );
}
