import React from 'react';
import { Search, Filter, RotateCcw } from 'lucide-react';
import Button from '../../../components/common/Button';

export default function JobManagementFilters({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  subscriptionFilter,
  onSubscriptionChange,
  discardFilter,
  onDiscardFilterChange,
  onReset
}) {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by job title, department, or org..."
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Job Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            <option value="ALL">All Publication Statuses</option>
            <option value="PUBLISHED">Published</option>
            <option value="UNPUBLISHED">Unpublished</option>
            <option value="DRAFT">Draft</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        {/* Subscription Status Filter */}
        <div>
          <select
            value={subscriptionFilter}
            onChange={(e) => onSubscriptionChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            <option value="ALL">All Subscription Statuses</option>
            <option value="ACTIVE">Active Subscription</option>
            <option value="TRIAL">Trial Subscription</option>
            <option value="CANCELLED">Cancelled Subscription</option>
            <option value="EXPIRED">Expired Subscription</option>
          </select>
        </div>

        {/* Discard Filter */}
        <div>
          <select
            value={discardFilter}
            onChange={(e) => onDiscardFilterChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            <option value="ACTIVE_ONLY">Active Jobs (Exclude Discarded)</option>
            <option value="DISCARDED_ONLY">Discarded / Archived Jobs Only</option>
            <option value="ALL">All Jobs (Including Discarded)</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onReset} className="text-slate-500 hover:text-slate-800">
          Reset Filters
        </Button>
      </div>
    </div>
  );
}
