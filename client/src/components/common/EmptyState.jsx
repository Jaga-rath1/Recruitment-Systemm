import React from 'react';
import { motion } from 'framer-motion';
import { Inbox } from 'lucide-react';
import { ENTER_EASE } from './MotionPrimitives';

export default function EmptyState({ title = 'Nothing here yet', description, icon: Icon = Inbox, action = null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: ENTER_EASE }}
      className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center"
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="h-6 w-6" />
      </div>
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      {description && <p className="mt-1 max-w-md text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}
