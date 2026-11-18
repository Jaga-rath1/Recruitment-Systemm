import React from 'react';
import { Link } from 'react-router-dom';
import { BriefcaseBusiness } from 'lucide-react';

export default function MarketingFooter() {
  return (
    <footer className="w-full border-t border-slate-800 bg-chrome-dark text-slate-300">
      <div className="grid w-full gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-12 lg:px-10 xl:px-12">
        <div className="lg:col-span-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <BriefcaseBusiness className="h-4 w-4" />
            </div>
            <div>
              <span className="block text-base font-bold tracking-tight text-white">
                NEXNUV Recruitment
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-widest text-brand-200">
                Enterprise Talent Suite
              </span>
            </div>
          </div>
          <p className="mt-4 max-w-md text-xs leading-relaxed text-slate-400">
            Enterprise multi-tenant talent acquisition SaaS engineered for seamless HRMS synchronization, structured interviews, and verified hiring workflows.
          </p>
        </div>

        <div className="lg:col-span-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white">Product</h4>
          <ul className="mt-3.5 space-y-2.5 text-xs">
            <li>
              <Link to="/features" className="transition hover:text-white">
                Platform Features
              </Link>
            </li>
            <li>
              <Link to="/pricing" className="transition hover:text-white">
                Recruitment Premium
              </Link>
            </li>
            <li>
              <Link to="/careers" className="transition hover:text-white">
                Public Careers Board
              </Link>
            </li>
            <li>
              <Link to="/subscribe" className="transition hover:text-white">
                Subscribe Organisation
              </Link>
            </li>
          </ul>
        </div>

        <div className="lg:col-span-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white">Company</h4>
          <ul className="mt-3.5 space-y-2.5 text-xs">
            <li>
              <Link to="/about" className="transition hover:text-white">
                About NEXNUV
              </Link>
            </li>
            <li>
              <Link to="/contact" className="transition hover:text-white">
                Enterprise Contact
              </Link>
            </li>
            <li>
              <Link to="/login" className="transition hover:text-white">
                Workspace Login
              </Link>
            </li>
          </ul>
        </div>

        <div className="lg:col-span-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white">
            Security & Compliance
          </h4>
          <ul className="mt-3.5 space-y-2.5 text-xs text-slate-400">
            <li>PostgreSQL Tenant Isolation</li>
            <li>Granular Backend RBAC</li>
            <li>Signed Object Storage Access</li>
            <li>Zero Plaintext Password Invites</li>
          </ul>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between gap-2 border-t border-slate-800/80 px-4 py-5 text-xs text-slate-400 sm:flex-row sm:px-6 lg:px-10 xl:px-12">
        <span>© {new Date().getFullYear()} NEXNUV Cloud Technologies. All rights reserved.</span>
        <span className="text-[11px] text-slate-500">Multi-Tenant Enterprise Recruitment SaaS</span>
      </div>
    </footer>
  );
}
