import React from 'react';
import { Search, RefreshCw, Filter } from 'lucide-react';
import Button from '../../common/Button';

export default function QueueFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  archiveFilter = 'ACTIVE',
  onArchiveChange,
  onRefresh,
  loading
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search organisation name, email, booking ref (#ID)..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Status Dropdown */}
        <div className="relative min-w-[170px]">
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="ALL">All Lifecycle States</option>
            <option value="PENDING_VERIFICATION">Pending Verification</option>
            <option value="PENDING_PAYMENT">Awaiting Payment</option>
            <option value="ACTIVE">Active / Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <Filter className="pointer-events-none absolute right-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
        </div>

        {/* History Archive View Dropdown */}
        {onArchiveChange && (
          <div className="relative min-w-[170px]">
            <select
              value={archiveFilter}
              onChange={(e) => onArchiveChange(e.target.value)}
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="ACTIVE">Active Bookings (Normal)</option>
              <option value="ARCHIVED">Archived Bookings</option>
              <option value="ALL">All Bookings (Incl. Archived)</option>
            </select>
            <Filter className="pointer-events-none absolute right-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          onClick={onRefresh}
          loading={loading}
        >
          Refresh Queue
        </Button>
      </div>
    </div>
  );
}
