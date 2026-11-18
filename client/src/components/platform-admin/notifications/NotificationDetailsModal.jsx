import React from 'react';
import { Mail, Clock, ShieldCheck, CheckCircle2, AlertTriangle, Building2, User } from 'lucide-react';
import Modal from '../../common/Modal';
import Badge from '../../common/Badge';
import Button from '../../common/Button';

export default function NotificationDetailsModal({
  isOpen,
  onClose,
  notification
}) {
  if (!isOpen || !notification) return null;

  const statusVariant = {
    DELIVERED: 'success',
    SENT: 'info',
    ACCEPTED: 'warning',
    FAILED: 'danger'
  }[notification.deliveryStatus] || 'neutral';

  return (
    <Modal
      isOpen={isOpen}
      open={isOpen}
      onClose={onClose}
      title={notification.title || 'Notification Details'}
      subtitle={`Event: ${notification.eventType} • ID: ${notification.notificationId}`}
      description={`Event: ${notification.eventType} • ID: ${notification.notificationId}`}
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 border border-slate-200">
          <div>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Recipient</span>
            <div className="text-base font-semibold text-slate-900 mt-0.5">
              {notification.recipientName || 'Administrator'}
            </div>
            <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              <span>{notification.recipientEmail}</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Delivery Status</span>
            <div className="mt-1">
              <Badge variant={statusVariant}>{notification.deliveryStatus}</Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <span className="text-slate-500 font-medium">Organisation</span>
            <p className="text-slate-800 font-medium">{notification.organisationName || 'Platform Level'}</p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 font-medium">Recipient Type</span>
            <p className="text-slate-800 font-medium">{notification.recipientType || 'ORGANISATION_ADMIN'}</p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 font-medium">Dispatched At</span>
            <p className="text-slate-800 font-medium">
              {notification.createdAt ? new Date(notification.createdAt).toLocaleString() : 'N/A'}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 font-medium">Provider / Message ID</span>
            <p className="text-slate-800 font-mono truncate">{notification.providerMessageId || notification.provider || 'STANDALONE'}</p>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 text-xs space-y-1.5">
          <span className="font-semibold text-slate-800 block">Rendered Message Body:</span>
          <p className="text-slate-700 whitespace-pre-wrap leading-relaxed bg-white p-3 rounded border border-slate-200 font-sans">
            {notification.message}
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-600 shrink-0" />
            <span>Sensitive tokens or credentials in message and links are automatically redacted for platform review safety.</span>
          </div>
        </div>

        {notification.metadata && Object.keys(notification.metadata).length > 0 && (
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 text-xs">
            <span className="font-semibold text-slate-700 block mb-1">Payload Metadata:</span>
            <pre className="text-[11px] text-slate-600 overflow-x-auto p-2 bg-white rounded border border-slate-200">
              {JSON.stringify(notification.metadata, null, 2)}
            </pre>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
