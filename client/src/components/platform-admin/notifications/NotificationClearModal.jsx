import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import Modal from '../../common/Modal';
import Button from '../../common/Button';
import { TextAreaField } from '../../common/FormField';

export default function NotificationClearModal({
  isOpen,
  onClose,
  targetNotification, // null for bulk clear
  isBulk = false,
  reason,
  onReasonChange,
  onConfirm,
  loading
}) {
  if (!isOpen) return null;

  const title = isBulk ? 'Bulk Clear Notification History' : 'Clear Notification Record';
  const subtitle = isBulk
    ? 'Archive and soft-delete multiple notification records from active history'
    : `Event: ${targetNotification?.eventType} • To: ${targetNotification?.recipientEmail}`;

  return (
    <Modal isOpen={isOpen} open={isOpen} onClose={onClose} title={title} subtitle={subtitle} description={subtitle}>
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Soft-Delete & Audit Disclosure</p>
            <p>
              Records are soft-deleted from the active history table. Financial records, customer subscription records,
              and security audit logs are completely preserved and never altered.
            </p>
          </div>
        </div>

        <TextAreaField
          label="Mandatory Reason"
          required
          rows={3}
          placeholder="State reason (minimum 5 characters, e.g. Customer requested privacy removal, test cleanup)..."
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            {loading ? 'Clearing...' : isBulk ? 'Confirm Bulk Clear' : 'Confirm Clear'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
