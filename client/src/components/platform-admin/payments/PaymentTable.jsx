import React from 'react';
import { Eye, Download, Ban, Archive, FileText } from 'lucide-react';
import Badge from '../../common/Badge';
import { formatAmountCents } from '../../../utils/currency';

export default function PaymentTable({
  payments = [],
  loading,
  onViewDetails,
  onDownloadProof,
  onOpenVoidModal,
  onOpenArchiveModal
}) {
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
        <FileText className="h-8 w-8 text-slate-400 mb-2" />
        <p className="text-sm font-medium">No payment records found</p>
        <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria or status filter.</p>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    const variants = {
      VERIFIED: 'success',
      SUBMITTED: 'warning',
      REJECTED: 'danger',
      VOIDED: 'neutral',
      ARCHIVED: 'neutral'
    };
    return <Badge variant={variants[status] || 'neutral'}>{status}</Badge>;
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
          <tr>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Method</th>
            <th className="px-4 py-3">Submitted By</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {payments.map((p) => {
            const isEligibleToVoid = ['SUBMITTED', 'REJECTED'].includes(p.status);
            const isArchivedOrVoided = ['VOIDED', 'ARCHIVED'].includes(p.status);

            return (
              <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-4 py-3 font-mono font-medium text-slate-900">{p.paymentReference}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">
                  {formatAmountCents(p.amountCents, p.currency)}
                </td>
                <td className="px-4 py-3 text-slate-600">{p.paymentMethod}</td>
                <td className="px-4 py-3 text-slate-700 truncate max-w-[180px]">{p.submittedByEmail || 'N/A'}</td>
                <td className="px-4 py-3">{getStatusBadge(p.status)}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'N/A'}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      onClick={() => onViewDetails(p)}
                      title="View Details"
                      className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                    >
                      <Eye className="h-4 w-4" />
                    </button>

                    {p.proofDownloadUrl && (
                      <button
                        onClick={() => onDownloadProof(p)}
                        title="Download Proof"
                        className="p-1 rounded text-slate-500 hover:text-brand-600 hover:bg-slate-100"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    )}

                    {isEligibleToVoid && (
                      <>
                        <button
                          onClick={() => onOpenArchiveModal(p)}
                          title="Archive Payment"
                          className="p-1 rounded text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onOpenVoidModal(p)}
                          title="Void Payment"
                          className="p-1 rounded text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      </>
                    )}

                    {isArchivedOrVoided && (
                      <span className="text-[10px] text-slate-400 italic">Protected</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
