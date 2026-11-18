import React from 'react';
import { Eye, Trash2, Mail, Bell } from 'lucide-react';
import Badge from '../../common/Badge';

export default function NotificationHistoryTable({
  notifications = [],
  loading,
  onViewDetails,
  onClearRecord
}) {
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
        <Bell className="h-8 w-8 text-slate-400 mb-2" />
        <p className="text-sm font-medium">No notification records found</p>
        <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria or event type filter.</p>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    const variants = {
      DELIVERED: 'success',
      SENT: 'info',
      ACCEPTED: 'warning',
      FAILED: 'danger'
    };
    return <Badge variant={variants[status] || 'neutral'}>{status}</Badge>;
  };

  const getEventBadge = (eventType) => {
    let color = 'bg-slate-100 text-slate-700';
    if (eventType.includes('INVITATION')) color = 'bg-purple-100 text-purple-700';
    if (eventType.includes('APPROVED')) color = 'bg-emerald-100 text-emerald-700';
    if (eventType.includes('REJECTED')) color = 'bg-rose-100 text-rose-700';
    if (eventType.includes('APPLICATION')) color = 'bg-blue-100 text-blue-700';
    return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${color}`}>{eventType}</span>;
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
          <tr>
            <th className="px-4 py-3">Timestamp</th>
            <th className="px-4 py-3">Event Type</th>
            <th className="px-4 py-3">Recipient Email</th>
            <th className="px-4 py-3">Organisation</th>
            <th className="px-4 py-3">Subject / Title</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {notifications.map((n) => (
            <tr key={n.id} className="hover:bg-slate-50/60 transition-colors">
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                {n.createdAt ? new Date(n.createdAt).toLocaleString() : 'N/A'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{getEventBadge(n.eventType)}</td>
              <td className="px-4 py-3 font-medium text-slate-900 truncate max-w-[200px]">
                {n.recipientEmail}
              </td>
              <td className="px-4 py-3 text-slate-700 truncate max-w-[160px]">
                {n.organisationName || 'Platform'}
              </td>
              <td className="px-4 py-3 text-slate-800 truncate max-w-[220px]" title={n.title}>
                {n.title}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{getStatusBadge(n.deliveryStatus)}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <div className="inline-flex items-center gap-1.5">
                  <button
                    onClick={() => onViewDetails(n)}
                    title="View Notice Details"
                    className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onClearRecord(n)}
                    title="Clear Record"
                    className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
