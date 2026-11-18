import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from './Button';

export default function Pagination({ meta, onPageChange }) {
  if (!meta || (meta.totalPages <= 1 && !meta.hasMore)) return null;
  const page = meta.page || 1;
  const totalPages = meta.totalPages || 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3.5 text-xs text-slate-600">
      <span>
        Page <strong className="text-slate-900">{page}</strong> of{' '}
        <strong className="text-slate-900">{totalPages}</strong>
        {meta.total !== undefined ? ` (${meta.total} total)` : ''}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronLeft}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= totalPages && !meta.hasMore}
          onClick={() => onPageChange(page + 1)}
        >
          <span>Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
