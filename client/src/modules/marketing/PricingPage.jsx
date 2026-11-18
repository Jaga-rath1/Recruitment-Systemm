import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Zap,
  Building,
  Clock,
  HelpCircle,
  CheckCircle2,
  X
} from 'lucide-react';
import Button from '../../components/common/Button';
import { PageTransition, FadeInSection } from '../../components/common/MotionPrimitives';
import { subscriptionApi } from '../../api';

export default function PricingPage() {
  const [cycle, setCycle] = useState('ANNUAL');
  const [serverPlans, setServerPlans] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function fetchPlans() {
      try {
        const res = await subscriptionApi.getPlans();
        if (isMounted && res.data?.plans) {
          setServerPlans(res.data);
        }
      } catch (_err) {
        // Fallback to static plan metadata
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchPlans();
    return () => {
      isMounted = false;
    };
  }, []);

  const plans = [
    {
      code: 'RECRUITMENT_BASIC',
      name: 'Basic',
      tagline: 'Essential recruitment features for small businesses',
      monthlyPrice: 999,
      annualPrice: 9999,
      annualMonthlyEquiv: 833,
      isPopular: false,
      trialDays: 15,
      badge: 'STARTER',
      icon: Zap,
      features: [
        'Unlimited manual job postings',
        'Branded public Careers portal',
        'Standard ATS pipeline stages',
        'Candidate Self-Service portal',
        'Basic interview scheduling',
        'Applicant email notifications',
        'Standard CSV candidate export'
      ],
      notIncluded: [
        'Bidirectional HRMS Requisition Sync',
        'Technical & Managerial Scorecards',
        'Digital Offer Letter generation & signing',
        'Dedicated PostgreSQL tenant isolation'
      ]
    },
    {
      code: 'RECRUITMENT_ADVANCED',
      name: 'Advanced',
      tagline: 'Complete recruitment workflow for growing organisations',
      monthlyPrice: 1999,
      annualPrice: 19999,
      annualMonthlyEquiv: 1667,
      isPopular: true,
      trialDays: 15,
      badge: 'MOST POPULAR',
      icon: Sparkles,
      features: [
        'Everything in Basic',
        'Bidirectional HRMS Requisition Sync',
        'Technical & Senior Scorecard reviews',
        'Digital Offer Letter generation & signing',
        'Candidate document security & anti-malware',
        'Multi-Role RBAC (Recruiters, Interviewers, Org Admin)',
        'Joining & Pre-Onboarding workflow',
        'Automated interview reminder notifications'
      ],
      notIncluded: [
        'Dedicated PostgreSQL tenant isolation',
        'Custom Treasury Wire/ACH verification SLA'
      ]
    },
    {
      code: 'RECRUITMENT_ENTERPRISE',
      name: 'Enterprise',
      tagline: 'Advanced recruitment capabilities for large organisations',
      monthlyPrice: 4999,
      annualPrice: 49999,
      annualMonthlyEquiv: 4167,
      isPopular: false,
      trialDays: 15,
      badge: 'ENTERPRISE',
      icon: Building,
      features: [
        'Everything in Advanced',
        'Dedicated PostgreSQL Row-Level Tenant Isolation',
        'Immutable Audit Logging Ledger',
        'Cloudinary Horizontal Storage Integration',
        'Custom Treasury Wire/ACH Verification SLA',
        'Priority 24/7 dedicated support engineering',
        'Custom career site custom CSS/subdomain',
        'Comprehensive compliance export packages'
      ],
      notIncluded: []
    }
  ];

  const comparisonCategories = [
    {
      title: 'Job & Requisition Management',
      rows: [
        { name: 'Public Careers Portal', trial: true, basic: true, advanced: true, enterprise: true },
        { name: 'Manual Job Posting & Publishing', trial: true, basic: true, advanced: true, enterprise: true },
        { name: 'Bidirectional HRMS Requisition Sync', trial: true, basic: false, advanced: true, enterprise: true },
        { name: 'Custom Application Screening Questions', trial: true, basic: 'Basic', advanced: 'Advanced', enterprise: 'Unlimited' }
      ]
    },
    {
      title: 'Applicant Tracking & Interviews',
      rows: [
        { name: 'Resume Upload & Verification', trial: true, basic: true, advanced: true, enterprise: true },
        { name: 'Candidate Self-Service Status Portal', trial: true, basic: true, advanced: true, enterprise: true },
        { name: 'Technical & Senior Interview Scorecards', trial: true, basic: false, advanced: true, enterprise: true },
        { name: 'Multi-Stage Stage Pipeline Progression', trial: true, basic: true, advanced: true, enterprise: true }
      ]
    },
    {
      title: 'Offer Management & Onboarding',
      rows: [
        { name: 'Digital Offer Letter Generation', trial: true, basic: false, advanced: true, enterprise: true },
        { name: 'Candidate Secure Offer Acceptance Token', trial: true, basic: false, advanced: true, enterprise: true },
        { name: 'Joining & Pre-Onboarding Confirmation', trial: true, basic: false, advanced: true, enterprise: true },
        { name: 'HRMS Employee Conversion Handoff', trial: true, basic: false, advanced: true, enterprise: true }
      ]
    },
    {
      title: 'Security, Architecture & Governance',
      rows: [
        { name: 'Tenant Isolation Guarantee', trial: 'Shared Isolated', basic: 'Shared Isolated', advanced: 'Shared Isolated', enterprise: 'Dedicated Row-Level' },
        { name: 'Anti-Malware Resume Security Check', trial: true, basic: true, advanced: true, enterprise: true },
        { name: 'Immutable Audit Trail', trial: false, basic: false, advanced: 'Standard', enterprise: 'Immutable Ledger' },
        { name: 'Platform Admin Payment Remittance SLA', trial: 'N/A', basic: 'Standard', advanced: 'Priority', enterprise: 'Dedicated SLA' }
      ]
    }
  ];

  return (
    <PageTransition className="w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-10 xl:px-12">
      {/* Hero Section */}
      <div className="mx-auto max-w-4xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
          <Sparkles className="h-3.5 w-3.5" />
          Transparent SaaS Pricing
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Plans built to scale your hiring team
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
          Choose from three independently configurable plans or start a 15-day risk-free trial today. No hidden seat fees, no lock-in.
        </p>

        {/* 15-Day Free Trial Highlight Banner */}
        <div className="mt-8 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 via-blue-50 to-indigo-50 p-6 text-left shadow-xs sm:flex sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-950">
                  Start 15-Day Free Trial
                </h3>
                <span className="rounded-md bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-800">
                  Zero Commitment
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                Get immediate access to full Advanced tier capabilities for 15 days. No wire transfer or payment required during evaluation.
              </p>
            </div>
          </div>
          <div className="mt-4 shrink-0 sm:mt-0 sm:pl-6">
            <Link to="/subscribe?plan=TRIAL">
              <Button size="md" className="w-full sm:w-auto shadow-sm">
                <span>Start 15-Day Free Trial</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Monthly / Annual Toggle */}
        <div className="mt-10 inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100/90 p-1.5 shadow-inner">
          <button
            type="button"
            onClick={() => setCycle('MONTHLY')}
            className={`rounded-xl px-5 py-2 text-xs font-semibold transition-all duration-150 ${
              cycle === 'MONTHLY'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            onClick={() => setCycle('ANNUAL')}
            className={`flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold transition-all duration-150 ${
              cycle === 'ANNUAL'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Annual Billing</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              Save 17%
            </span>
          </button>
        </div>
      </div>

      {/* 3 Tier Cards */}
      <FadeInSection className="mt-12 grid gap-8 lg:grid-cols-3">
        {plans.map((p) => {
          const Icon = p.icon;
          const displayPrice = cycle === 'ANNUAL' ? p.annualMonthlyEquiv : p.monthlyPrice;
          const billedText = cycle === 'ANNUAL' ? `Billed ₹${p.annualPrice.toLocaleString('en-IN')} annually` : 'Billed monthly';

          return (
            <div
              key={p.code}
              className={`relative flex flex-col justify-between rounded-3xl border bg-white p-7 transition-all duration-200 hover:shadow-elevated ${
                p.isPopular
                  ? 'border-2 border-brand-500 shadow-card lg:-translate-y-2'
                  : 'border-slate-200 shadow-xs'
              }`}
            >
              {p.isPopular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
                  {p.badge}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{p.name}</h2>
                      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        {p.trialDays}-day trial eligible
                      </span>
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  {p.tagline}
                </p>

                <div className="mt-6 border-b border-slate-100 pb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold tracking-tight text-slate-950">
                      ₹{displayPrice.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs font-medium text-slate-500">/ month</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{billedText}</p>
                </div>

                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-900">
                    What's included:
                  </p>
                  <ul className="mt-3 space-y-2.5 text-xs text-slate-700">
                    {p.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{feat}</span>
                      </li>
                    ))}
                    {p.notIncluded.map((nInc) => (
                      <li key={nInc} className="flex items-start gap-2.5 text-slate-400">
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                        <span>{nInc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100">
                <Link
                  to={`/subscribe?plan=${p.code.replace('RECRUITMENT_', '')}&cycle=${cycle}`}
                  className="block"
                >
                  <Button
                    size="lg"
                    variant={p.isPopular ? 'primary' : 'outline'}
                    className="w-full"
                  >
                    <span>Choose {p.name}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <div className="mt-2 text-center">
                  <Link
                    to="/subscribe?plan=TRIAL"
                    className="text-[11px] font-medium text-slate-500 hover:text-brand-600 transition"
                  >
                    Or evaluate with 15-day free trial &rarr;
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </FadeInSection>

      {/* Feature Comparison Matrix */}
      <div className="mt-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Detailed Plan Comparison
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Compare capabilities across our 15-Day Free Trial, Basic, Advanced, and Enterprise tiers.
          </p>
        </div>

        <div className="mt-10 overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-card">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="py-4 pl-6 pr-4 font-semibold text-slate-900">Feature</th>
                <th className="px-4 py-4 font-semibold text-brand-700">15-Day Trial</th>
                <th className="px-4 py-4 font-semibold text-slate-900">Basic</th>
                <th className="px-4 py-4 font-semibold text-slate-900">Advanced</th>
                <th className="py-4 pl-4 pr-6 font-semibold text-slate-900">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comparisonCategories.map((category) => (
                <React.Fragment key={category.title}>
                  <tr className="bg-slate-100/60">
                    <td colSpan={5} className="py-2.5 pl-6 pr-4 text-xs font-bold uppercase tracking-wider text-slate-600">
                      {category.title}
                    </td>
                  </tr>
                  {category.rows.map((row) => (
                    <tr key={row.name} className="hover:bg-slate-50/50">
                      <td className="py-3.5 pl-6 pr-4 text-xs font-medium text-slate-800">
                        {row.name}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {typeof row.trial === 'boolean' ? (
                          row.trial ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-slate-300" />
                        ) : (
                          <span className="font-semibold text-brand-700">{row.trial}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {typeof row.basic === 'boolean' ? (
                          row.basic ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-slate-300" />
                        ) : (
                          <span className="font-medium text-slate-800">{row.basic}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {typeof row.advanced === 'boolean' ? (
                          row.advanced ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-slate-300" />
                        ) : (
                          <span className="font-semibold text-brand-700">{row.advanced}</span>
                        )}
                      </td>
                      <td className="py-3.5 pl-4 pr-6 text-xs text-slate-600">
                        {typeof row.enterprise === 'boolean' ? (
                          row.enterprise ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-slate-300" />
                        ) : (
                          <span className="font-bold text-slate-900">{row.enterprise}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enterprise Security & Provisioning Note */}
      <div className="mt-16 rounded-3xl border border-slate-200 bg-slate-50/80 p-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Enterprise Remittance & Tenant Isolation
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-slate-600">
                All paid plans are verified through Platform Admin corporate wire or ACH reconciliation. Upon payment approval, your organisation tenant is provisioned with zero data shared across organisations.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <Link to="/subscribe?plan=TRIAL">
              <Button variant="secondary" size="md">
                Try 15 Days Free
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
