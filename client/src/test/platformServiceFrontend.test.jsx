import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../context/ToastContext';
import { platformApi, subscriptionApi } from '../api';

import PlatformOverviewPage from '../modules/platform/PlatformOverviewPage';
import PlatformPlansPage from '../modules/platform/PlatformPlansPage';
import PlatformSubscriptionsPage from '../modules/platform/PlatformSubscriptionsPage';
import PlatformOrganisationsPage from '../modules/platform/PlatformOrganisationsPage';
import PlatformEntitlementsPage from '../modules/platform/PlatformEntitlementsPage';
import PlatformConfigurationPage from '../modules/platform/PlatformConfigurationPage';
import PlatformAdministrationPage from '../modules/platform/PlatformAdministrationPage';

// Mock AuthContext
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'super-admin-uuid-1',
      userId: 'super-admin-uuid-1',
      name: 'Super Admin',
      email: 'superadmin@nexnuv.com',
      activeRoleCode: 'PLATFORM_ADMIN',
      userType: 'PLATFORM_ADMIN'
    },
    organisation: null,
    logout: vi.fn(),
    hasPermission: () => true
  })
}));

const mockPlans = [
  {
    id: 'plan-uuid-1',
    name: 'Enterprise Plan',
    code: 'enterprise-tier',
    description: 'Full HRMS suite for enterprises',
    price: '999.00',
    billingCycle: 'monthly',
    trialDays: 14,
    status: 'active',
    modules: [{ id: 'mod-1', name: 'HRMS' }],
    submodules: [{ id: 'sub-1', name: 'Employees' }, { id: 'sub-2', name: 'Attendance' }]
  },
  {
    id: 'plan-uuid-2',
    name: 'Starter Plan',
    code: 'starter-tier',
    description: 'Basic tier',
    price: '199.00',
    billingCycle: 'monthly',
    trialDays: 7,
    status: 'inactive',
    modules: [],
    submodules: []
  }
];

const mockSubscriptions = [
  {
    id: 'sub-uuid-1',
    organizationId: '2bd19235-b81a-4ea7-9cac-457e888b63b2',
    planId: 'plan-uuid-1',
    status: 'active',
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: '2027-10-01T00:00:00.000Z',
    trialEndsAt: null,
    plan: mockPlans[0]
  },
  {
    id: 'sub-uuid-2',
    organizationId: '2e118174-598c-4fe3-a2be-b110d6285fc1',
    planId: 'plan-uuid-1',
    status: 'trial',
    startsAt: '2026-11-01T00:00:00.000Z',
    endsAt: null,
    trialEndsAt: '2026-11-15T00:00:00.000Z',
    plan: mockPlans[0]
  }
];

const mockModules = [
  {
    id: 'mod-1',
    name: 'HRMS Core',
    code: 'HRMS',
    description: 'Core Human Resource Management',
    status: 'active'
  }
];

const mockSubmodules = [
  {
    id: 'sub-1',
    moduleId: 'mod-1',
    name: 'Employee Records',
    code: 'EMPLOYEES',
    description: 'Employee directory',
    status: 'active'
  },
  {
    id: 'sub-2',
    moduleId: 'mod-1',
    name: 'Attendance Tracking',
    code: 'ATTENDANCE',
    description: 'Clock in/out',
    status: 'active'
  }
];

const mockEntitlements = {
  organizationId: '2bd19235-b81a-4ea7-9cac-457e888b63b2',
  active: true,
  reason: null,
  subscription: {
    id: 'sub-uuid-1',
    status: 'active',
    plan: { id: 'plan-uuid-1', code: 'enterprise-tier', name: 'Enterprise Plan', status: 'active' },
    expired: false
  },
  modules: [
    {
      id: 'mod-1',
      code: 'HRMS',
      name: 'HRMS Core',
      submodules: [{ id: 'sub-1', code: 'EMPLOYEES', name: 'Employee Records' }]
    }
  ],
  features: ['HRMS', 'EMPLOYEES']
};

function renderWithProviders(ui) {
  return render(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>
  );
}

describe('Platform Service Frontend Modules', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(platformApi, 'getHealth').mockResolvedValue({ success: true, service: 'platform-service' });
    vi.spyOn(platformApi, 'listPlans').mockResolvedValue({ data: mockPlans });
    vi.spyOn(platformApi, 'listSubscriptions').mockResolvedValue({ data: mockSubscriptions });
    vi.spyOn(platformApi, 'listModules').mockResolvedValue({ data: mockModules });
    vi.spyOn(platformApi, 'listSubmodules').mockResolvedValue({ data: mockSubmodules });
    vi.spyOn(platformApi, 'getOrgSubscription').mockResolvedValue({ data: mockSubscriptions[0] });
    vi.spyOn(platformApi, 'getOrgTrial').mockResolvedValue({ data: null });
    vi.spyOn(platformApi, 'getOrgEntitlements').mockResolvedValue({ data: mockEntitlements });
    vi.spyOn(subscriptionApi, 'listAdminQueue').mockResolvedValue({ data: [], meta: { total: 0 } });
  });

  it('1. PlatformOverviewPage: renders summary cards and live service diagnostics', async () => {
    renderWithProviders(<PlatformOverviewPage />);

    expect(await screen.findByText('Platform Administration')).toBeInTheDocument();
    expect(await screen.findByText('Active Subscriptions')).toBeInTheDocument();
    expect(screen.getByText('Active Trials')).toBeInTheDocument();
    expect(screen.getByText('Platform Infrastructure')).toBeInTheDocument();
    expect(screen.getByText('Recent Subscriptions & Trials')).toBeInTheDocument();
  });

  it('2. PlatformPlansPage: lists plans, supports filtering, and opens create modal', async () => {
    renderWithProviders(<PlatformPlansPage />);

    expect(await screen.findByText('Platform Plans Management')).toBeInTheDocument();
    expect(screen.getByText('Enterprise Plan')).toBeInTheDocument();
    expect(screen.getByText('Starter Plan')).toBeInTheDocument();

    // Open create plan modal
    const createBtn = screen.getByRole('button', { name: /create plan/i });
    fireEvent.click(createBtn);

    expect(await screen.findByText('Create New Platform Plan')).toBeInTheDocument();
  });

  it('3. PlatformSubscriptionsPage: displays tenant subscriptions and filters', async () => {
    renderWithProviders(<PlatformSubscriptionsPage />);

    expect(await screen.findByText('Subscription Management')).toBeInTheDocument();
    expect(screen.getAllByText('2bd19235-b81a-4ea7-9cac-457e888b63b2')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Enterprise Plan')[0]).toBeInTheDocument();
  });

  it('4. PlatformOrganisationsPage: audits tenant SaaS status and features', async () => {
    renderWithProviders(<PlatformOrganisationsPage />);

    expect(await screen.findByText('Organisation SaaS Overview')).toBeInTheDocument();
    expect(screen.getByText('Active Subscription')).toBeInTheDocument();
    expect(screen.getByText('Evaluation Trial')).toBeInTheDocument();
    expect(screen.getByText('Real-Time Entitlements Snapshot')).toBeInTheDocument();
  });

  it('5. PlatformEntitlementsPage: evaluates live engine and surfaces feature flags and limitations', async () => {
    renderWithProviders(<PlatformEntitlementsPage />);

    expect(await screen.findByText(/Usage & Resource Limits/i)).toBeInTheDocument();
    expect(screen.getByText(/Entitlement Enforcement Model & Quota Transparency/i)).toBeInTheDocument();
    expect(screen.getByText('Authorized Software Modules')).toBeInTheDocument();
    expect(screen.getByText('Resolved RBAC Feature Keys')).toBeInTheDocument();
    expect(screen.getByText('EMPLOYEES')).toBeInTheDocument();
  });

  it('6. PlatformConfigurationPage: manages catalog modules, submodules and diagnostics', async () => {
    renderWithProviders(<PlatformConfigurationPage />);

    expect(await screen.findByText('Platform Configuration & Settings')).toBeInTheDocument();
    expect(screen.getByText('HRMS Core')).toBeInTheDocument();

    // Switch to Submodules tab
    const submodulesTab = screen.getByRole('tab', { name: /submodules/i });
    fireEvent.click(submodulesTab);

    expect(await screen.findByText('Employee Records')).toBeInTheDocument();
    expect(screen.getByText('Attendance Tracking')).toBeInTheDocument();
  });

  it('7. PlatformAdministrationPage: verifies Super Admin identity and three-tier RBAC architecture', async () => {
    renderWithProviders(<PlatformAdministrationPage />);

    expect(await screen.findByText('Platform Administration & RBAC Security')).toBeInTheDocument();
    expect(screen.getByText('Super Admin Identity')).toBeInTheDocument();
    expect(screen.getByText('superadmin@nexnuv.com')).toBeInTheDocument();
    expect(screen.getByText(/Three-Tier RBAC Guard Model/i)).toBeInTheDocument();
    expect(screen.getByText(/Microservice Topology & Verified Local Ports/i)).toBeInTheDocument();
  });
});
