import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, GitBranch, FileCheck2, Users, Bell, BarChart3, ArrowRight } from 'lucide-react';
import Button from '../../components/common/Button';
import {
  PageTransition,
  StaggerGrid,
  StaggerItem,
  FadeInSection
} from '../../components/common/MotionPrimitives';

const MODULES = [
  {
    icon: GitBranch,
    title: 'HRMS Requisition Sync + Manual Jobs',
    points: [
      'Pull approved HRMS requisitions preserving raw source metadata',
      'Configure recruitment-specific priorities & screening questions',
      'Author manual requisitions with Draft, Publish, Unpublish, and Close states'
    ]
  },
  {
    icon: Users,
    title: 'Organisation & Employee Access Governance',
    points: [
      'Add & invite employees backed by Employee and Auth services',
      'Assign roles during creation or update granular permissions anytime',
      'Instant backend deactivation & complete employee activity audit trails'
    ]
  },
  {
    icon: FileCheck2,
    title: '7-Stage Interview & Offer Pipeline',
    points: [
      'Recruiter screening with Shortlist, Hold, and Reject decisions',
      'Dedicated Technical & Senior Managerial evaluation rubrics (1–10 scale)',
      'Digital offer letters, candidate acceptance, and joining confirmation to HIRED'
    ]
  },
  {
    icon: Shield,
    title: 'Tenant Isolation & Confidential Security',
    points: [
      'Strict organisation_id isolation across every PostgreSQL query',
      'Signed HMAC URLs for resumes, proofs, offer letters, and joining letters',
      'Confidential interview remarks never exposed to Candidate Portal'
    ]
  },
  {
    icon: Bell,
    title: 'REST Event Notifications (Brokerless)',
    points: [
      '17 lifecycle notification triggers delivered reliably over REST',
      'Zero RabbitMQ, BullMQ, Kafka, or Redis queue dependencies',
      'Passwordless admin activation links — zero plaintext passwords emailed'
    ]
  },
  {
    icon: BarChart3,
    title: 'Pipeline Analytics & Audit Compliance',
    points: [
      'Real-time conversion funnel across all recruitment stages',
      'Source performance comparing HRMS vs Manual requisitions',
      'Immutable audit logs tracking before/after state and Request IDs'
    ]
  }
];

export default function FeaturesPage() {
  return (
    <PageTransition className="w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-10 xl:px-12">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Features</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Enterprise Recruitment Architecture Built for Scale
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600">
          Modular capabilities crafted for multi-tenant organisations, recruiters, technical panels, and candidates.
        </p>
      </div>

      <StaggerGrid className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <StaggerItem
              key={mod.title}
              className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-elevated"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{mod.title}</h3>
              <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-600">
                {mod.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </StaggerItem>
          );
        })}
      </StaggerGrid>

      <FadeInSection className="mt-14 flex flex-col items-start justify-between gap-6 rounded-2xl border border-brand-200 bg-brand-50/50 p-8 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Deploy NEXNUV Recruitment Across Your Organisation
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Activate multi-tenant hiring workflows with instant Platform Admin provisioning.
          </p>
        </div>
        <Link to="/subscribe" className="shrink-0">
          <Button size="lg">
            <span>Subscribe to Recruitment Premium</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </FadeInSection>
    </PageTransition>
  );
}
