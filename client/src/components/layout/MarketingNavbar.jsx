import React, { useState, useRef, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X, BriefcaseBusiness, ChevronDown, Users, Building2, UserCheck, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ENTER_EASE } from '../common/MotionPrimitives';

export default function MarketingNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { to: '/', label: 'Home', end: true },
    { to: '/features', label: 'Features' },
    { to: '/pricing', label: 'Pricing' },
    { to: '/careers', label: 'Careers' },
    { to: '/about', label: 'About' },
    { to: '/contact', label: 'Contact' }
  ];

  const roleLower = String(user?.activeRoleCode || user?.role || user?.userType || '').toLowerCase();
  const dashboardPath =
    roleLower === 'candidate'
      ? '/portal'
      : roleLower === 'platform_admin' || roleLower === 'super_admin' || roleLower === 'superadmin'
      ? '/platform-admin'
      : '/app';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/90 bg-chrome-dark/95 text-white backdrop-blur-md">
      <div className="flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-10 xl:px-12">
        <Link to="/" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <BriefcaseBusiness className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <span className="block text-sm font-bold tracking-tight text-white">NEXNUV</span>
            <span className="block text-[10px] font-medium uppercase tracking-widest text-brand-200">
              Recruitment
            </span>
          </div>
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span>{item.label}</span>
                  {isActive && (
                    <motion.span
                      layoutId="marketing-nav-underline"
                      transition={{ duration: 0.2, ease: ENTER_EASE }}
                      className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand-500"
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          {isAuthenticated ? (
            <Link
              to={dashboardPath}
              className="whitespace-nowrap rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Open Workspace
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white"
              >
                Candidate Sign In
              </Link>

              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((o) => !o)}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-sm font-medium text-slate-200 shadow-sm transition hover:bg-slate-700 hover:text-white"
                >
                  <span>Team Sign In</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-700 bg-slate-900/95 p-2 shadow-xl backdrop-blur-md z-50">
                    <Link
                      to="/org-login"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-start gap-3 rounded-lg p-2.5 text-xs text-slate-200 transition hover:bg-slate-800 hover:text-white"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400 shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-semibold block text-white">Organisation Admin</span>
                        <span className="text-[11px] text-slate-400">Manage tenant, roles &amp; team</span>
                      </div>
                    </Link>

                    <Link
                      to="/recruiter-login"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-start gap-3 rounded-lg p-2.5 text-xs text-slate-200 transition hover:bg-slate-800 hover:text-white"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                        <UserCheck className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-semibold block text-white">Recruiter &amp; Interviewer</span>
                        <span className="text-[11px] text-slate-400">Review apps &amp; schedule rounds</span>
                      </div>
                    </Link>

                    <div className="my-1 border-t border-slate-800" />

                    <Link
                      to="/platform-admin/login"
                      data-testid="platform-admin-login-entry"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-start gap-3 rounded-lg p-2.5 text-xs text-slate-200 transition hover:bg-indigo-950/60 hover:text-white"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 shrink-0">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-semibold block text-white">Platform Governance</span>
                        <span className="text-[11px] text-slate-400">Treasury &amp; payments console</span>
                      </div>
                    </Link>
                  </div>
                )}
              </div>

              <Link
                to="/subscribe?plan=TRIAL"
                className="whitespace-nowrap rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
              >
                Start 15-Day Free Trial
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="rounded-lg p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white lg:hidden"
          aria-label="Toggle Menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: ENTER_EASE }}
            className="overflow-hidden border-t border-slate-800 bg-chrome-nav lg:hidden"
          >
            <div className="flex flex-col gap-1.5 px-4 py-4 sm:px-6">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-200 hover:bg-slate-800/60 hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <hr className="my-2 border-slate-800" />
              {isAuthenticated ? (
                <Link
                  to={dashboardPath}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl bg-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Open Workspace
                </Link>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link
                    to="/login"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-slate-700 px-4 py-2.5 text-center text-sm font-medium text-slate-200 hover:bg-slate-800 hover:text-white"
                  >
                    Candidate Sign In
                  </Link>
                  <Link
                    to="/org-login"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-purple-800/50 bg-purple-950/20 px-4 py-2 text-center text-xs font-semibold text-purple-300 hover:bg-purple-900/30"
                  >
                    Organisation Admin Sign In
                  </Link>
                  <Link
                    to="/recruiter-login"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 px-4 py-2 text-center text-xs font-semibold text-emerald-300 hover:bg-emerald-900/30"
                  >
                    Recruiter Sign In
                  </Link>
                  <Link
                    to="/platform-admin/login"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl border border-indigo-800/50 bg-indigo-950/20 px-4 py-2 text-center text-xs font-semibold text-indigo-300 hover:bg-indigo-900/30"
                  >
                    Platform Admin Console
                  </Link>
                  <Link
                    to="/subscribe?plan=TRIAL"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl bg-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-700 mt-1"
                  >
                    Start 15-Day Free Trial
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
