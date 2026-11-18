import React from 'react';
import { Download, CreditCard, Calendar, User, FileText, ShieldCheck, AlertCircle } from 'lucide-react';
import Modal from '../../common/Modal';
import Badge from '../../common/Badge';
import Button from '../../common/Button';
import { formatAmountCents, getExchangeRateMeta } from '../../../utils/currency';

export default function PaymentDetailsModal({
  isOpen,
  onClose,
  payment,
  onDownloadProof,
  downloadLoading
}) {
  if (!isOpen || !payment) return null;

  const statusVariant = {
    VERIFIED: 'success',
    SUBMITTED: 'warning',
    REJECTED: 'danger',
    VOIDED: 'neutral',
    ARCHIVED: 'neutral'
  }[payment.status] || 'neutral';

  return (
    <Modal
      isOpen={isOpen}
      open={isOpen}
      onClose={onClose}
      title="Payment Transaction Details"
      subtitle={`Reference: ${payment.paymentReference}`}
      description={`Reference: ${payment.paymentReference}`}
    >
      <div className="space-y-5 text-sm">
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 border border-slate-200">
          <div>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Amount Remitted</span>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              {formatAmountCents(payment.amountCents, payment.currency)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Original: {payment.currency || 'INR'} • {payment.paymentMethod}
              {payment.currency === 'USD' && (
                <span className="block text-[11px] text-brand-700 mt-0.5">
                  Approx. INR conversion at ₹{getExchangeRateMeta().rate}/USD ({getExchangeRateMeta().source})
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</span>
            <div className="mt-1">
              <Badge variant={statusVariant}>{payment.status}</Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <span className="text-slate-500 font-medium">Submitted By</span>
            <p className="text-slate-800 font-medium">{payment.submittedByEmail || 'Registered Administrator'}</p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 font-medium">Submission Timestamp</span>
            <p className="text-slate-800 font-medium">
              {payment.createdAt ? new Date(payment.createdAt).toLocaleString() : 'N/A'}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 font-medium">Subscription ID</span>
            <p className="font-mono text-slate-700 truncate">{payment.subscriptionId || 'N/A'}</p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 font-medium">Proof Attachment</span>
            <p className="text-slate-800 truncate">{payment.proofFileName || 'None uploaded'}</p>
          </div>
        </div>

        {payment.notes && (
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 text-xs">
            <span className="font-semibold text-slate-700 block mb-1">Customer Remittance Notes:</span>
            <p className="text-slate-600">{payment.notes}</p>
          </div>
        )}

        {(payment.status === 'VOIDED' || payment.status === 'ARCHIVED') && (
          <div className="rounded-lg bg-rose-50/70 p-3 border border-rose-200 text-xs text-rose-900 space-y-1">
            <p className="font-semibold">{payment.status === 'ARCHIVED' ? 'Archived Record Details' : 'Voided Record Details'}</p>
            <p><strong>Reason:</strong> {payment.voidReason || 'No reason specified'}</p>
            <p className="text-slate-600"><strong>Action Date:</strong> {payment.voidedAt ? new Date(payment.voidedAt).toLocaleString() : 'N/A'}</p>
          </div>
        )}

        {payment.status === 'REJECTED' && payment.rejectionReason && (
          <div className="rounded-lg bg-rose-50/70 p-3 border border-rose-200 text-xs text-rose-900">
            <span className="font-semibold block mb-0.5">Rejection Reason:</span>
            <p>{payment.rejectionReason}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          {payment.proofDownloadUrl ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownloadProof(payment)}
              loading={downloadLoading}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Download Remittance Proof
            </Button>
          ) : (
            <span className="text-xs text-slate-400">No proof file attached</span>
          )}

          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
