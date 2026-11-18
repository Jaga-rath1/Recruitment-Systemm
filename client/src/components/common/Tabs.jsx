import React, { useId } from 'react';
import { motion } from 'framer-motion';
import { ENTER_EASE } from './MotionPrimitives';

export default function Tabs({ tabs = [], activeTab, onChange }) {
  const groupId = useId();

  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              active ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  active ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            )}
            {active && (
              <motion.span
                layoutId={`tab-underline-${groupId}`}
                transition={{ duration: 0.2, ease: ENTER_EASE }}
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
