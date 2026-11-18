import React from 'react';
import { AlertTriangle, Archive, ShieldCheck } from 'lucide-react';
import Modal from '../../common/Modal';
import Button from '../../common/Button';
import { TextAreaField } from '../../common/FormField';
import { formatAmountCents } from '../../../utils/currency';

export default function BookingArchiveModal({
  isOpen,
  open,
  onClose,
  booking,
  reason,
  onReasonChange,
  onConfirm,
  loading
}) {
  const isVisible = isOpen !== undefined ? Boolean(isOpen) : Boolean(open);
  if (!isVisible || !booking) return null;

  const bookingRef = `#${booking.id.slice(0, 8).toUpperCase()}`;

  return (
    <Modal
      isOpen={isVisible}
      open={isVisible}
      onClose={onClose}
      title="Archive Customer Booking from History"
      subtitle={`Organisation: ${booking.organisationName} • Booking Ref: ${bookingRef}`}
      description={`Organisation: ${booking.organisationName} • Booking Ref: ${bookingRef}`}
    >
      <div className="space-y-4">
        {/* Organisation & Booking Context Pill */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs text-slate-700 space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Customer Organisation:</span>
            <span className="font-semibold text-slate-900">{booking.organisationName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Administrator Email:</span>
            <span className="font-medium text-slate-800">{booking.adminEmail}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Subscription Plan:</span>
            <span className="font-semibold text-brand-700">
              {booking.planCode} ({booking.billingCycle}) · {formatAmountCents(booking.amountCents, booking.currency)}
            </span>
          </div>
        </div>

        {/* Audit & Financial Integrity Disclosure */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Financial & Audit Integrity Disclosure</p>
            <p className="leading-relaxed text-amber-800">
              Archiving removes this customer booking individually from the normal active booking history.
              The underlying subscription, payment proofs, and immutable audit logs are <strong>fully preserved</strong> for financial compliance and accounting integrity.
            </p>
          </div>
        </div>

        {/* Mandatory Reason Input */}
        <TextAreaField
          label="Mandatory Reason for Removal / Archival"
          required
          rows={3}
          placeholder="State reason (minimum 5 characters, e.g. Customer cancelled onboarding, duplicate registration, internal testing, test booking removal)..."
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
            type="button"
            onClick={onConfirm}
            disabled={loading || !reason || reason.trim().length < 5}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 transition-colors bg-amber-600 hover:bg-amber-700"
          >
            <Archive className="h-4 w-4" />
            {loading ? 'Archiving...' : 'Confirm Archive & Remove'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
