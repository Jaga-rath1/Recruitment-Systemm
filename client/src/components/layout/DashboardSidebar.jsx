import React from 'react';
import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Briefcase,
  FileText,
  UserCheck,
  CalendarClock,
  Award,
  UserPlus,
  BarChart3,
  Building2,
  ClipboardCheck,
  BriefcaseBusiness,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Layers,
  CreditCard,
  KeyRound,
  Sliders
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ENTER_EASE } from '../common/MotionPrimitives';

export default function DashboardSidebar({
  open,
  onClose,
  collapsed = false,
  onToggleCollapse
}) {
  const { user, hasPermission } = useAuth();
  const role = user?.activeRoleCode;

  const orgNavItems = [
    { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true, show: hasPermission('organisation:view') },
    { to: '/app/organisation', label: 'Organisation Profile', icon: Building2, show: hasPermission('organisation:view') },
    { to: '/app/employees', label: 'Employees', icon: Users, show: hasPermission('employee:view') },
    { to: '/app/roles', label: 'Roles & Permissions', icon: ShieldCheck, show: hasPermission('role:view') },
    { to: '/app/jobs', label: 'Jobs (HRMS & Manual)', icon: Briefcase, show: hasPermission('job:view') },
    { to: '/app/applications', label: 'Applications', icon: FileText, show: hasPermission('application:view') },
    { to: '/app/candidates', label: 'Candidates', icon: UserCheck, show: hasPermission('candidate:view') },
    {
      to: '/app/interviews',
      label: 'Interviews',
      icon: CalendarClock,
      show:
        hasPermission('interview:view_all') ||
        hasPermission('interview:technical:view_assigned') ||
        hasPermission('interview:managerial:view_assigned')
    },
    { to: '/app/offers', label: 'Offers', icon: Award, show: hasPermission('offer:view') },
    { to: '/app/joining', label: 'Joining & Onboarding', icon: UserPlus, show: hasPermission('joining:view') },
    { to: '/app/reports', label: 'Recruitment Reports', icon: BarChart3, show: hasPermission('report:view') }
  ].filter((item) => item.show);

  const candidateNavItems = [
    { to: '/portal', label: 'My Applications', icon: FileText, end: true },
    { to: '/portal/interviews', label: 'Interview Schedule', icon: CalendarClock },
    { to: '/portal/offers', label: 'Offers & Joining', icon: Award },
    { to: '/portal/profile', label: 'My Profile', icon: UserCheck }
  ];

  const platformAdminNavItems = [
    { to: '/platform-admin', label: 'Dashboard Overview', icon: LayoutDashboard, end: true },
    { to: '/platform-admin/plans', label: 'Platform Plans', icon: Layers },
    { to: '/platform-admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
    { to: '/platform-admin/organisations', label: 'Organisation Overview', icon: Building2 },
    { to: '/platform-admin/entitlements', label: 'Usage & Resource Limits', icon: KeyRound },
    { to: '/platform-admin/configuration', label: 'Catalog & Settings', icon: Sliders },
    { to: '/platform-admin/administration', label: 'Platform Administration', icon: ShieldCheck },
    { to: '/platform-admin/verification-queue', label: 'Payment Verification', icon: ClipboardCheck }
  ];

  const items =
    role === 'CANDIDATE'
      ? candidateNavItems
      : role === 'PLATFORM_ADMIN'
      ? platformAdminNavItems
      : orgNavItems;

  const renderSidebarContent = (isCollapsed = false, isMobile = false) => (
    <div className="flex h-full w-full flex-col">
      <div
        className={`flex h-16 shrink-0 items-center border-b border-slate-800 bg-chrome-dark text-white ${
          isCollapsed ? 'justify-center px-3' : 'justify-between px-4'
        }`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 shadow-sm">
            <BriefcaseBusiness className="h-4 w-4 text-white" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-bold">NEXNUV</span>
              <span className="block truncate text-[10px] uppercase tracking-widest text-brand-200">
                {role === 'CANDIDATE'
                  ? 'Candidate Portal'
                  : role === 'PLATFORM_ADMIN'
                  ? 'Platform Admin'
                  : 'Talent SaaS'}
              </span>
            </div>
          )}
        </div>
        {isMobile ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          onToggleCollapse &&
          !isCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="hidden rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white lg:inline-flex"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )
        )}
      </div>

      {!isMobile && onToggleCollapse && isCollapsed && (
        <div className="flex justify-center border-b border-slate-100 py-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      <nav aria-label="Workspace navigation" className="flex-1 space-y-1 overflow-y-auto px-2.5 py-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={isMobile ? onClose : undefined}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center rounded-xl py-2.5 text-sm font-medium transition-all duration-150 ${
                  isCollapsed ? 'justify-center px-2' : 'gap-3 px-3'
                } ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && !isCollapsed && (
                    <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-600" />
                  )}
                  <Icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        {isCollapsed ? (
          <div
            title={`${user?.name || 'User'} (${String(role || '').replace(/_/g, ' ')})`}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-xs font-bold text-brand-700"
          >
            {(user?.name || 'N').charAt(0).toUpperCase()}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
            <p className="truncate font-semibold text-slate-900">{user?.name}</p>
            <p className="truncate text-slate-500">{user?.email}</p>
            <span className="mt-2 inline-block rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
              {String(role || '').replace(/_/g, ' ')}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-[1px] lg:hidden"
              onClick={onClose}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.22, ease: ENTER_EASE }}
              className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white shadow-xl lg:hidden"
            >
              {renderSidebarContent(false, true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <aside
        className={`hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ease-out lg:flex ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        {renderSidebarContent(collapsed, false)}
      </aside>
    </>
  );
}
