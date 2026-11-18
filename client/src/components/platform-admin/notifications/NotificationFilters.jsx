import React from 'react';
import { Search, Filter, Trash2 } from 'lucide-react';

export default function NotificationFilters({
  searchQuery,
  onSearchChange,
  eventTypeFilter,
  onEventTypeChange,
  deliveryStatusFilter,
  onDeliveryStatusChange,
  onRefresh,
  onBulkClear
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Search email, recipient, title, ID..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={eventTypeFilter}
            onChange={(e) => onEventTypeChange(e.target.value)}
          >
            <option value="ALL">All Event Types</option>
            <option value="ACCOUNT_INVITATION">Account Invitation</option>
            <option value="PAYMENT_APPROVED">Payment Approved</option>
            <option value="PAYMENT_REJECTED">Payment Rejected</option>
            <option value="SUBSCRIPTION_SUBMITTED">Subscription Submitted</option>
            <option value="TRIAL_ACTIVATED">Trial Activated</option>
            <option value="APPLICATION_RECEIVED">Application Received</option>
            <option value="OFFER_LETTER_SENT">Offer Letter Sent</option>
            <option value="INTERVIEW_SCHEDULED">Interview Scheduled</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={deliveryStatusFilter}
            onChange={(e) => onDeliveryStatusChange(e.target.value)}
          >
            <option value="ALL">All Delivery States</option>
            <option value="DELIVERED">Delivered (Confirmed)</option>
            <option value="SENT">Sent</option>
            <option value="ACCEPTED">Accepted / Queued</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onBulkClear && (
          <button
            onClick={onBulkClear}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Bulk Clear
          </button>
        )}

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}
