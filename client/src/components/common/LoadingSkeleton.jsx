import React from 'react';

export default function LoadingSkeleton({ rows = 4 }) {
  return (
    <div className="w-full space-y-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 animate-pulse">
          <div className="h-4 w-1/4 rounded bg-slate-200/80" />
          <div className="h-4 w-1/3 rounded bg-slate-100" />
          <div className="h-4 w-1/5 rounded bg-slate-200/80" />
          <div className="ml-auto h-6 w-20 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
