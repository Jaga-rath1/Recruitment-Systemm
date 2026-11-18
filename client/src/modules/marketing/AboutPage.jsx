import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Lock, Server, ArrowRight } from 'lucide-react';
import Button from '../../components/common/Button';
import { PageTransition, StaggerGrid, StaggerItem, FadeInSection } from '../../components/common/MotionPrimitives';

export default function AboutPage() {
  return (
    <PageTransition className="w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-10 xl:px-12">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
          About NEXNUV Recruitment
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Designed for Modern Distributed Enterprise Ecosystems
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600">
          NEXNUV Recruitment is built as an independent microservice inside the NEXNUV HRMS suite. Rather than duplicating identity, employee records, or notification delivery infrastructure, it connects through crisp adapter boundaries and maintains a dedicated, strictly isolated PostgreSQL recruitment database.
        </p>
      </div>

      <StaggerGrid className="mt-10 grid gap-6 md:grid-cols-3">
        {[
          {
            icon: Building2,
            title: 'Multi-Tenant First',
            text: 'Every query, file upload, and role assignment is scoped strictly by organisation_id.'
          },
          {
            icon: Lock,
            title: 'Security Verified',
            text: 'Passwordless invitations, signed storage tokens, and zero leaked interview remarks.'
          },
          {
            icon: Server,
            title: 'Stateless & Scalable',
            text: 'Horizontally scalable Node.js services with PostgreSQL pooling and zero broker locks.'
          }
        ].map((card) => {
          const Icon = card.icon;
          return (
            <StaggerItem
              key={card.title}
              className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 shadow-xs transition hover:border-brand-200 hover:bg-white"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{card.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{card.text}</p>
            </StaggerItem>
          );
        })}
      </StaggerGrid>

      <FadeInSection className="mt-12 flex flex-col items-start justify-between gap-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-card sm:flex-row sm:items-center">
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold text-slate-900">
            Clean Microservice Integration Boundaries
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Connect Platform Admin, Auth Service, Employee Service, and Notification Service through standardized REST contracts without duplicating master data.
          </p>
        </div>
        <Link to="/features" className="shrink-0">
          <Button variant="secondary">
            <span>Explore Architecture</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </FadeInSection>
    </PageTransition>
  );
}
