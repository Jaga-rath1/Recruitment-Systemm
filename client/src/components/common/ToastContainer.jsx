import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { ENTER_EASE } from './MotionPrimitives';

const VARIANT_STYLES = {
  success: 'border-emerald-200 bg-white text-slate-900',
  error: 'border-rose-200 bg-white text-slate-900',
  info: 'border-brand-200 bg-white text-slate-900'
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: ENTER_EASE }}
            className={`flex items-start gap-3 rounded-xl border p-4 shadow-elevated ${VARIANT_STYLES[toast.variant] || VARIANT_STYLES.info}`}
          >
            {toast.variant === 'success' && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
            {toast.variant === 'error' && <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />}
            {toast.variant === 'info' && <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />}
            <div className="flex-1 text-sm">
              {toast.title && <p className="font-semibold text-slate-900">{toast.title}</p>}
              {toast.message && <p className="mt-0.5 text-xs text-slate-600">{toast.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
