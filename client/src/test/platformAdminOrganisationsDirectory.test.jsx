import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../context/ToastContext';
import { subscriptionApi } from '../api';

import {
  AccountStatusBadge,
  ProvisioningStatusBadge,
  InvitationLifecycleBadge,
  PaymentStatusBadge
} from '../modules/platform/components/OrganisationStatusBadges';
import OrganisationAdminAccountCard from '../modules/platform/components/OrganisationAdminAccountCard';
import OrganisationDirectoryTable from '../modules/platform/components/OrganisationDirectoryTable';
import OrganisationDetailsModal from '../modules/platform/components/OrganisationDetailsModal';
import PlatformOrganisationsPage from '../modules/platform/PlatformOrganisationsPage';

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

const mockDirectoryOrganisations = [
  {
    id: 'sub-org-1',
    subscriptionId: 'sub-org-1',
    organisationId: 'c19fa048-1d33-479b-949a-64f46d3fee5d',
    organisationName: 'Alpha Apex Tech',
    organisationDomain: 'alphaapex.tech',
    industry: 'Engineering & Technology',
    companySize: '51-200',
    adminName: 'Marcus Aurelius',
    adminEmail: 'marcus@alphaapex.tech',
    adminAccountStatus: 'ACTIVATED',
    invitationStatus: 'ACCOUNT_ACTIVATED',
    planCode: 'RECRUITMENT_ADVANCED',
    planName: 'Advanced',
    billingCycle: 'MONTHLY',
    startsAt: '2026-11-14T04:48:22.108Z',
    expiresAt: '2026-11-29T04:48:22.108Z',
    paymentStatus: 'TRIAL',
    provisioningStatus: 'PROVISIONED',
    invitationSentAt: '2026-11-14T04:48:22.108Z',
    invitationExpiresAt: null,
    invitationResendCount: 0,
    loginPortalUrl: 'http://localhost:5173/org-login',
    hasAdminAccount: true,
    isMissingAssignment: false
  },
  {
    id: 'sub-org-2',
    subscriptionId: 'sub-org-2',
    organisationId: 'd22fa048-1d33-479b-949a-64f46d3fee5e',
    organisationName: 'Aether Test Org',
    organisationDomain: 'aethertest.io',
    industry: 'Technology & SaaS',
    companySize: '51-200',
    adminName: 'Alexander Hayes',
    adminEmail: 'admin@aethertest.io',
    adminAccountStatus: 'INVITED',
    invitationStatus: 'INVITATION_SENT',
    planCode: 'RECRUITMENT_ADVANCED',
    planName: 'Advanced',
    billingCycle: 'ANNUAL',
    startsAt: '2026-11-17T10:00:00.000Z',
    expiresAt: '2027-11-17T10:00:00.000Z',
    paymentStatus: 'VERIFIED',
    provisioningStatus: 'PROVISIONED',
    invitationSentAt: '2026-11-17T10:00:00.000Z',
    invitationExpiresAt: '2026-11-19T10:00:00.000Z',
    invitationResendCount: 1,
    loginPortalUrl: 'http://localhost:5173/org-login',
    hasAdminAccount: false,
    isMissingAssignment: false
  },
  {
    id: 'sub-org-3',
    subscriptionId: 'sub-org-3',
    organisationId: 'e33fa048-1d33-479b-949a-64f46d3fee5f',
    organisationName: 'Missing Admin Corp',
    organisationDomain: 'missingadmin.com',
    industry: 'Robotics',
    companySize: '11-50',
    adminName: 'Sarah Connor',
    adminEmail: 'sarah@missingadmin.com',
    adminAccountStatus: 'NOT_PROVISIONED',
    invitationStatus: 'NO_INVITATION',
    planCode: 'RECRUITMENT_BASIC',
    planName: 'Basic',
    billingCycle: 'MONTHLY',
    startsAt: '2026-11-17T10:00:00.000Z',
    expiresAt: '2026-12-17T10:00:00.000Z',
    paymentStatus: 'VERIFIED',
    provisioningStatus: 'PROVISIONED',
    invitationSentAt: null,
    invitationExpiresAt: null,
    invitationResendCount: 0,
    loginPortalUrl: 'http://localhost:5173/org-login',
    hasAdminAccount: false,
    isMissingAssignment: true
  }
];

const mockOrgDetails = {
  organisation: {
    id: 'c19fa048-1d33-479b-949a-64f46d3fee5d',
    name: 'Alpha Apex Tech',
    domain: 'alphaapex.tech',
    industry: 'Engineering & Technology',
    companySize: '51-200',
    provisioningStatus: 'PROVISIONED',
    createdAt: '2026-11-14T04:48:22.108Z'
  },
  adminAccount: {
    fullName: 'Marcus Aurelius',
    email: 'marcus@alphaapex.tech',
    accountStatus: 'ACTIVATED',
    invitationStatus: 'ACCOUNT_ACTIVATED',
    invitationSentAt: '2026-11-14T04:48:22.108Z',
    invitationExpiresAt: null,
    invitationResendCount: 0,
    loginPortalUrl: 'http://localhost:5173/org-login',
    isMissingAssignment: false,
    assignmentId: 'assign-uuid-1'
  },
  subscription: {
    id: 'sub-org-1',
    planCode: 'RECRUITMENT_ADVANCED',
    planName: 'Advanced',
    billingCycle: 'MONTHLY',
    status: 'TRIAL',
    startsAt: '2026-11-14T04:48:22.108Z',
    expiresAt: '2026-11-29T04:48:22.108Z'
  },
  payments: []
};

function renderWithProviders(ui) {
  return render(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>
  );
}

describe('Platform Admin Organisation Directory & Admin Credentials Visibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. OrganisationStatusBadges', () => {
    it('renders AccountStatusBadge with appropriate styling and labels', () => {
      const { rerender } = render(<AccountStatusBadge status="ACTIVATED" />);
      expect(screen.getByText('Activated')).toBeInTheDocument();

      rerender(<AccountStatusBadge status="INVITED" />);
      expect(screen.getByText('Invited')).toBeInTheDocument();

      rerender(<AccountStatusBadge status="NOT_PROVISIONED" />);
      expect(screen.getByText('Not Provisioned')).toBeInTheDocument();
    });

    it('renders ProvisioningStatusBadge and PaymentStatusBadge', () => {
      render(
        <div>
          <ProvisioningStatusBadge status="PROVISIONED" />
          <PaymentStatusBadge status="VERIFIED" />
        </div>
      );
      expect(screen.getByText('Provisioned')).toBeInTheDocument();
      expect(screen.getByText('Verified')).toBeInTheDocument();
    });
  });

  describe('2. OrganisationAdminAccountCard', () => {
    it('renders complete admin credentials metadata, org-login portal link, and action buttons', () => {
      const onResend = vi.fn();
      const onReset = vi.fn();
      const onRecover = vi.fn();

      render(
        <OrganisationAdminAccountCard
          adminAccount={mockOrgDetails.adminAccount}
          organisationId="c19fa048-1d33-479b-949a-64f46d3fee5d"
          onResendActivation={onResend}
          onTriggerPasswordReset={onReset}
          onRecoverAccount={onRecover}
        />
      );

      expect(screen.getByText('Marcus Aurelius')).toBeInTheDocument();
      expect(screen.getByText('marcus@alphaapex.tech')).toBeInTheDocument();
      expect(screen.getByText(/http:\/\/localhost:5173\/org-login/i)).toBeInTheDocument();

      // Trigger password reset for activated account
      const resetBtn = screen.getByRole('button', { name: /send password reset email/i });
      fireEvent.click(resetBtn);
      expect(onReset).toHaveBeenCalled();
    });

    it('displays recovery button when isMissingAssignment is true', () => {
      const onRecover = vi.fn();
      render(
        <OrganisationAdminAccountCard
          adminAccount={{
            ...mockOrgDetails.adminAccount,
            accountStatus: 'NOT_PROVISIONED',
            isMissingAssignment: true
          }}
          organisationId="missing-org-id"
          onRecoverAccount={onRecover}
        />
      );

      const recoverBtn = screen.getByRole('button', { name: /recover admin account/i });
      expect(recoverBtn).toBeInTheDocument();
      fireEvent.click(recoverBtn);
      expect(onRecover).toHaveBeenCalled();
    });
  });

  describe('3. OrganisationDirectoryTable', () => {
    it('renders table headers and displays all 3 test organisations with accurate status badges', () => {
      const onView = vi.fn();
      render(
        <OrganisationDirectoryTable
          organisations={mockDirectoryOrganisations}
          isLoading={false}
          onViewOrganisation={onView}
        />
      );

      expect(screen.getByText('Alpha Apex Tech')).toBeInTheDocument();
      expect(screen.getByText('Aether Test Org')).toBeInTheDocument();
      expect(screen.getByText('Missing Admin Corp')).toBeInTheDocument();

      expect(screen.getByText('marcus@alphaapex.tech')).toBeInTheDocument();
      expect(screen.getByText('admin@aethertest.io')).toBeInTheDocument();

      // Click view on first organisation
      const viewButtons = screen.getAllByRole('button', { name: /view/i });
      fireEvent.click(viewButtons[0]);
      expect(onView).toHaveBeenCalledWith(mockDirectoryOrganisations[0]);
    });
  });

  describe('4. OrganisationDetailsModal', () => {
    it('renders modal with Admin Account Card, subscription info, and close button', () => {
      const onClose = vi.fn();
      render(
        <OrganisationDetailsModal
          isOpen={true}
          onClose={onClose}
          details={mockOrgDetails}
          loading={false}
        />
      );

      expect(screen.getByText(/Organisation Admin Account/i)).toBeInTheDocument();
      expect(screen.getByText('marcus@alphaapex.tech')).toBeInTheDocument();
      expect(screen.getAllByText('Alpha Apex Tech')[0]).toBeInTheDocument();

      const closeBtn = screen.getByRole('button', { name: /close modal/i });
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('5. PlatformOrganisationsPage Integration', () => {
    it('fetches and displays organisations directory from subscriptionApi', async () => {
      vi.spyOn(subscriptionApi, 'listOrganisations').mockResolvedValue({
        data: mockDirectoryOrganisations,
        meta: { total: 3, page: 1, limit: 20 }
      });

      renderWithProviders(<PlatformOrganisationsPage />);

      expect(await screen.findByText('Alpha Apex Tech')).toBeInTheDocument();
      expect(screen.getByText('Marcus Aurelius')).toBeInTheDocument();
      expect(screen.getByText('marcus@alphaapex.tech')).toBeInTheDocument();
      expect(screen.getByText('Aether Test Org')).toBeInTheDocument();
    });

    it('opens OrganisationDetailsModal when View is clicked and executes Resend Activation', async () => {
      vi.spyOn(subscriptionApi, 'listOrganisations').mockResolvedValue({
        data: mockDirectoryOrganisations,
        meta: { total: 3, page: 1, limit: 20 }
      });
      vi.spyOn(subscriptionApi, 'getOrganisationDetails').mockResolvedValue({
        data: {
          ...mockOrgDetails,
          adminAccount: {
            ...mockOrgDetails.adminAccount,
            accountStatus: 'INVITED',
            invitationStatus: 'INVITATION_SENT'
          }
        }
      });
      const resendSpy = vi.spyOn(subscriptionApi, 'resendOrgAdminActivation').mockResolvedValue({
        message: 'Activation invitation resent'
      });

      renderWithProviders(<PlatformOrganisationsPage />);

      expect(await screen.findByText('Alpha Apex Tech')).toBeInTheDocument();
      const viewButtons = screen.getAllByRole('button', { name: /view/i });
      fireEvent.click(viewButtons[0]);

      // Modal opens
      expect(await screen.findByText('Organisation Admin Account')).toBeInTheDocument();
      const resendBtn = screen.getByRole('button', { name: /resend activation email/i });
      fireEvent.click(resendBtn);

      await waitFor(() => {
        expect(resendSpy).toHaveBeenCalled();
      });
    });
  });
});
