import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

const DEFAULT_STEPS = [
  { key: 'APPLIED', label: 'Applied' },
  { key: 'SCREENING', label: 'Screening' },
  { key: 'TECHNICAL_INTERVIEW', label: 'Technical Interview' },
  { key: 'MANAGERIAL_INTERVIEW', label: 'Managerial Interview' },
  { key: 'FINAL_SELECTION', label: 'Final Selection' },
  { key: 'OFFER_PROCESSING', label: 'Offer Processing' },
  { key: 'OFFER_ACCEPTED', label: 'Offer Accepted' },
  { key: 'JOINING', label: 'Joining' }
];

export default function StageTracker({ steps = DEFAULT_STEPS, currentStage }) {
  return (
    <div className="w-full overflow-x-auto py-2">
      <div className="flex min-w-[700px] w-full items-start justify-between gap-2">
        {steps.map((step, index) => {
          const isCompleted = step.status === 'COMPLETED';
          const isCurrent = step.status === 'CURRENT';
          const isSkipped = step.status === 'SKIPPED';

          return (
            <div key={step.key} className="relative flex flex-1 flex-col items-center text-center">
              {index < steps.length - 1 && (
                <div
                  className={`absolute left-1/2 top-3.5 h-0.5 w-full transition-colors duration-300 ${
                    isCompleted ? 'bg-brand-600' : 'bg-slate-200'
                  }`}
                />
              )}
              <motion.div
                initial={{ scale: 0.9, opacity: 0.7 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.24) }}
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-200 ${
                  isCompleted
                    ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                    : isCurrent
                    ? 'border-brand-600 bg-brand-50 text-brand-700 ring-4 ring-brand-100'
                    : isSkipped
                    ? 'border-slate-300 bg-slate-100 text-slate-400'
                    : 'border-slate-200 bg-white text-slate-400'
                }`}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </motion.div>
              <span
                className={`mt-2 px-1 text-[11px] font-medium leading-tight ${
                  isCompleted || isCurrent ? 'text-slate-900' : 'text-slate-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      {currentStage === 'HIRED' && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-xs font-semibold text-emerald-800">
          Congratulations! Status: HIRED
        </div>
      )}
    </div>
  );
}
