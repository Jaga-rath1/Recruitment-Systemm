import React from 'react';

export default function Card({ title, subtitle, actions, children, className = '', noPadding = false }) {
  return (
    <div className={`w-full rounded-2xl border border-slate-200/90 bg-white shadow-card transition-shadow hover:shadow-sm ${className}`}>
      {(title || subtitle || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {title && <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5 sm:p-6'}>{children}</div>
    </div>
  );
}
