import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, LogOut, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Button from '../common/Button';

export default function DashboardTopbar({ onOpenSidebar }) {
  const { user, organisation, logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {organisation?.name ||
              (user?.activeRoleCode === 'CANDIDATE'
                ? 'Candidate Self-Service Portal'
                : 'NEXNUV Platform Administration')}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="truncate">
              Role: {String(user?.activeRoleCode || '').replace(/_/g, ' ')}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
        <Link
          to="/careers"
          className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 sm:inline-flex"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Public Careers</span>
        </Link>
        <Button variant="secondary" size="sm" icon={LogOut} onClick={logout}>
          Sign Out
        </Button>
      </div>
    </header>
  );
}
