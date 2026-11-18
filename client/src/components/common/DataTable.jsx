import React from 'react';
import EmptyState from './EmptyState';
import LoadingSkeleton from './LoadingSkeleton';
import Pagination from './Pagination';

export default function DataTable({
  columns = [],
  rows,
  data,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'Try adjusting your search or filter criteria.',
  emptyMessage,
  emptyAction = null,
  meta = null,
  onPageChange = null,
  onRowClick = null
}) {
  const tableRows = rows !== undefined && rows !== null ? rows : (data || []);
  const resolvedEmptyTitle = emptyMessage ? 'No records' : emptyTitle;
  const resolvedEmptyDescription = emptyMessage || emptyDescription;

  if (loading) {
    return <LoadingSkeleton rows={5} />;
  }

  if (!tableRows || tableRows.length === 0) {
    return <EmptyState title={resolvedEmptyTitle} description={resolvedEmptyDescription} action={emptyAction} />;
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-card">
      <div className="w-full overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50/90">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`whitespace-nowrap px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-500 ${col.headerClassName || ''}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {tableRows.map((row, idx) => (
              <tr
                key={row.id || idx}
                onClick={() => onRowClick?.(row)}
                className={`${onRowClick ? 'cursor-pointer hover:bg-brand-50/50' : 'hover:bg-slate-50/80'} transition-colors duration-150`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-5 py-3.5 align-middle text-slate-700 ${col.cellClassName || ''}`}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meta && onPageChange && <Pagination meta={meta} onPageChange={onPageChange} />}
    </div>
  );
}
