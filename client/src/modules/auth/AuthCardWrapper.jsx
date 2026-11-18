import React from 'react';
import Card from '../../components/common/Card';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function AuthCardWrapper({
  badgeText = 'Portal Access',
  badgeColor = 'brand',
  title,
  subtitle,
  icon: Icon,
  children,
  footer
}) {
  const badgeClasses = {
    brand: 'text-brand-600 bg-brand-50 border-brand-200',
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    purple: 'text-purple-600 bg-purple-50 border-purple-200',
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200'
  }[badgeColor] || 'text-brand-600 bg-brand-50 border-brand-200';

  return (
    <PageTransition className="w-full min-h-[calc(100vh-16rem)] flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border mb-3 uppercase tracking-wider ${badgeClasses}">
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span>{badgeText}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-600 leading-relaxed">{subtitle}</p>}
        </div>

        <Card className="shadow-lg border-slate-200/80">
          {children}
        </Card>

        {footer && (
          <div className="text-center text-xs text-slate-500">
            {footer}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
