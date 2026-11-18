import React, { useState } from 'react';
import { UploadCloud, FileText } from 'lucide-react';

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.msi', '.dll', '.bat', '.cmd', '.sh', '.ps1', '.vbs',
  '.js', '.mjs', '.cjs', '.html', '.htm', '.svg', '.php', '.py', '.jar'
]);

export default function FileUpload({
  label = 'Upload Document',
  accept = '.pdf,.doc,.docx,.png,.jpg',
  file = null,
  onFileSelect,
  required = false,
  maxSizeMb = 10,
  onValidationError = null,
  hint = 'PDF, DOC, DOCX, PNG, or JPG up to 10MB'
}) {
  const [localError, setLocalError] = useState('');

  const handleChange = (e) => {
    const selected = e.target.files?.[0] || null;
    if (!selected) {
      setLocalError('');
      onFileSelect(null);
      return;
    }

    const parts = String(selected.name || '').toLowerCase().split('.');
    const ext = parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
    const innerBlocked = parts.slice(1).map((p) => `.${p}`).find((seg) => BLOCKED_EXTENSIONS.has(seg));
    const allowedExts = accept
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.startsWith('.'));

    if (!ext || innerBlocked || (allowedExts.length > 0 && !allowedExts.includes(ext))) {
      const msg = `Unsupported or blocked file type (${selected.name}). Allowed: ${accept}`;
      setLocalError(msg);
      onValidationError?.(msg);
      e.target.value = '';
      onFileSelect(null);
      return;
    }

    if (selected.size > maxSizeMb * 1024 * 1024) {
      const msg = `File exceeds maximum size of ${maxSizeMb}MB.`;
      setLocalError(msg);
      onValidationError?.(msg);
      e.target.value = '';
      onFileSelect(null);
      return;
    }

    setLocalError('');
    onFileSelect(selected);
  };

  return (
    <div className="w-full">
      {label && (
        <label className="mb-1.5 block text-xs font-medium text-slate-700">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <label className="group flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center transition-all duration-150 hover:border-brand-400 hover:bg-brand-50/30">
        {file ? (
          <div className="flex items-center gap-2.5 text-sm font-medium text-brand-700">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <FileText className="h-4 w-4" />
            </div>
            <span className="break-all">{file.name}</span>
          </div>
        ) : (
          <>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-brand-600 shadow-sm transition-transform duration-150 group-hover:-translate-y-0.5">
              <UploadCloud className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium text-slate-700">Click to select a file</span>
            <span className="mt-1 text-xs text-slate-500">{hint}</span>
          </>
        )}
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleChange}
        />
      </label>
      {localError && <p className="mt-1.5 text-xs font-medium text-rose-600">{localError}</p>}
    </div>
  );
}
