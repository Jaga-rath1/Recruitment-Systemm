import React from 'react';
import { AlertTriangle, Archive, Ban } from 'lucide-react';
import Modal from '../../common/Modal';
import Button from '../../common/Button';
import { TextAreaField } from '../../common/FormField';
import { formatAmountCents } from '../../../utils/currency';

export default function PaymentActionModal({
  isOpen,
  onClose,
  targetPayment,
  actionType = 'VOID', // 'VOID' or 'ARCHIVE'
  reason,
  onReasonChange,
  onConfirm,
  loading
}) {
  if (!isOpen || !targetPayment) return null;

  const isArchive = actionType === 'ARCHIVE';
  const title = isArchive ? 'Archive Payment Record' : 'Void Payment Record';
  const Icon = isArchive ? Archive : Ban;
  const buttonColor = isArchive ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700';

  return (
    <Modal
      isOpen={isOpen}
      open={isOpen}
      onClose={onClose}
      title={title}
      subtitle={`Reference: ${targetPayment.paymentReference} • Amount: ${formatAmountCents(targetPayment.amountCents, targetPayment.currency)}`}
      description={`Reference: ${targetPayment.paymentReference} • Amount: ${formatAmountCents(targetPayment.amountCents, targetPayment.currency)}`}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Audit Logging Disclosure</p>
            <p>
              This action permanently records your administrator identity, timestamp, and mandatory reason in the immutable audit ledger.
              The financial record remains preserved for accounting compliance.
            </p>
          </div>
        </div>

        <TextAreaField
          label="Mandatory Reason"
          required
          rows={3}
          placeholder="State reason (minimum 5 characters, e.g. Duplicate submission, test transaction, customer refund)..."
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
        />
        {reason && reason.trim().length < 5 && (
          <p className="text-xs text-rose-600">Reason must be at least 5 characters long ({reason.trim().length}/5).</p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <button
            onClick={onConfirm}
            disabled={loading || !reason || reason.trim().length < 5}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 transition-colors ${buttonColor}`}
          >
            <Icon className="h-4 w-4" />
            {loading ? 'Processing...' : isArchive ? 'Confirm Archive' : 'Confirm Void'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
