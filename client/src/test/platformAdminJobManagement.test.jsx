import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../context/ToastContext';
import { jobApi } from '../api';

import CancelSubscriptionModal from '../modules/platform/components/CancelSubscriptionModal';
import UnpublishJobModal from '../modules/platform/components/UnpublishJobModal';
import DiscardJobModal from '../modules/platform/components/DiscardJobModal';
import JobManagementFilters from '../modules/platform/components/JobManagementFilters';
import PlatformAdminJobTable from '../modules/platform/components/PlatformAdminJobTable';
import PlatformAdminJobDetailsModal from '../modules/platform/components/PlatformAdminJobDetailsModal';
import PlatformAdminJobManagementPage from '../modules/platform/PlatformAdminJobManagementPage';

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

const mockOrgDetailsForCancel = {
  organisation: {
    id: 'org-uuid-1',
    name: 'Zenith Quantum Corp'
  },
  subscription: {
    id: 'sub-uuid-1',
    planName: 'Advanced Tier',
    billingCycle: 'MONTHLY',
    startsAt: '2026-11-01T00:00:00.000Z',
    expiresAt: '2026-12-01T00:00:00.000Z',
    status: 'ACTIVE'
  },
  jobsSummary: {
    publishedJobCount: 4,
    totalJobCount: 7
  }
};

const mockJobs = [
  {
    id: 'job-uuid-1',
    title: 'Lead Distributed Systems Architect',
    organisationId: 'org-uuid-1',
    organisationName: 'Zenith Quantum Corp',
    subscriptionStatus: 'ACTIVE',
    planCode: 'RECRUITMENT_ADVANCED',
    status: 'PUBLISHED',
    department: 'Engineering',
    location: 'Remote, US',
    employmentType: 'FULL_TIME',
    salaryDisplay: '$160,000 - $190,000 USD',
    createdAt: '2026-11-10T10:00:00.000Z',
    publishedAt: '2026-11-11T12:00:00.000Z',
    applicationCount: 14,
    isDiscarded: false,
    description: 'We are seeking a seasoned architect for distributed microservices.'
  },
  {
    id: 'job-uuid-2',
    title: 'Senior DevOps & Reliability Engineer',
    organisationId: 'org-uuid-2',
    organisationName: 'Aether Robotics Labs',
    subscriptionStatus: 'CANCELLED',
    planCode: 'RECRUITMENT_BASIC',
    status: 'UNPUBLISHED',
    department: 'Operations',
    location: 'Austin, TX',
    employmentType: 'FULL_TIME',
    salaryDisplay: '$140,000 USD',
    createdAt: '2026-11-05T09:00:00.000Z',
    publishedAt: null,
    applicationCount: 6,
    isDiscarded: true,
    discardReason: 'Duplicate test posting created during onboarding dry-run',
    unpublishReason: 'Subscription cancelled: Non-payment',
    description: 'Reliability and Kubernetes infrastructure automation role.'
  }
];

function renderWithProviders(ui) {
  return render(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>
  );
}

describe('Platform Admin Subscription Cancellation & Global Job Governance', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. CancelSubscriptionModal', () => {
    it('displays organisation summary, active job count, and enforces mandatory reason', () => {
      const onConfirm = vi.fn();
      const onClose = vi.fn();

      render(
        <CancelSubscriptionModal
          isOpen={true}
          onClose={onClose}
          details={mockOrgDetailsForCancel}
          onConfirm={onConfirm}
        />
      );

      expect(screen.getByText('Zenith Quantum Corp')).toBeInTheDocument();
      expect(screen.getByText('Advanced Tier (MONTHLY)')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument(); // active job count

      // Attempt submit without reason
      const submitBtn = screen.getByRole('button', { name: /confirm cancellation & unpublish jobs/i });
      fireEvent.click(submitBtn);

      expect(screen.getByText(/mandatory cancellation reason/i)).toBeInTheDocument();
      expect(onConfirm).not.toHaveBeenCalled();

      // Enter valid reason
      const reasonInput = screen.getByPlaceholderText(/provide a mandatory reason for cancellation/i);
      fireEvent.change(reasonInput, { target: { value: 'Customer non-payment after reminder grace period.' } });
      fireEvent.click(submitBtn);

      expect(onConfirm).toHaveBeenCalledWith('Customer non-payment after reminder grace period.');
    });
  });

  describe('2. UnpublishJobModal', () => {
    it('displays job context and requires mandatory reason before unpublishing', () => {
      const onConfirm = vi.fn();
      const onClose = vi.fn();

      render(
        <UnpublishJobModal
          isOpen={true}
          onClose={onClose}
          job={mockJobs[0]}
          onConfirm={onConfirm}
        />
      );

      expect(screen.getAllByText('Lead Distributed Systems Architect')[0]).toBeInTheDocument();
      expect(screen.getByText('Zenith Quantum Corp')).toBeInTheDocument();

      const submitBtn = screen.getByRole('button', { name: /unpublish job/i });
      fireEvent.click(submitBtn);

      expect(screen.getByText(/mandatory unpublish reason/i)).toBeInTheDocument();
      expect(onConfirm).not.toHaveBeenCalled();

      const reasonInput = screen.getByPlaceholderText(/reason for unpublishing/i);
      fireEvent.change(reasonInput, { target: { value: 'Hiring paused for Q4.' } });
      fireEvent.click(submitBtn);

      expect(onConfirm).toHaveBeenCalledWith('Hiring paused for Q4.');
    });
  });

  describe('3. DiscardJobModal', () => {
    it('explains soft-discard data retention and requires mandatory reason', () => {
      const onConfirm = vi.fn();
      const onClose = vi.fn();

      render(
        <DiscardJobModal
          isOpen={true}
          onClose={onClose}
          job={mockJobs[0]}
          onConfirm={onConfirm}
        />
      );

      expect(screen.getByText(/Soft-Discard & Data Preservation Policy/i)).toBeInTheDocument();
      expect(screen.getByText(/14 Applications/i)).toBeInTheDocument();

      const submitBtn = screen.getByRole('button', { name: /confirm discard/i });
      fireEvent.click(submitBtn);

      expect(screen.getByText('A mandatory discard reason of at least 5 characters is required.')).toBeInTheDocument();
      expect(onConfirm).not.toHaveBeenCalled();

      const reasonInput = screen.getByPlaceholderText(/explain why this job is being discarded/i);
      fireEvent.change(reasonInput, { target: { value: 'Duplicate testing listing.' } });
      fireEvent.click(submitBtn);

      expect(onConfirm).toHaveBeenCalledWith('Duplicate testing listing.');
    });
  });

  describe('4. JobManagementFilters', () => {
    it('renders all filter options and triggers change handlers', () => {
      const onSearch = vi.fn();
      const onStatus = vi.fn();
      const onSub = vi.fn();
      const onDiscard = vi.fn();
      const onReset = vi.fn();

      render(
        <JobManagementFilters
          searchTerm=""
          onSearchChange={onSearch}
          statusFilter="ALL"
          onStatusChange={onStatus}
          subscriptionFilter="ALL"
          onSubscriptionChange={onSub}
          discardFilter="ACTIVE_ONLY"
          onDiscardFilterChange={onDiscard}
          onReset={onReset}
        />
      );

      const searchInput = screen.getByPlaceholderText(/search by job title/i);
      fireEvent.change(searchInput, { target: { value: 'Architect' } });
      expect(onSearch).toHaveBeenCalledWith('Architect');

      const resetBtn = screen.getByRole('button', { name: /reset filters/i });
      fireEvent.click(resetBtn);
      expect(onReset).toHaveBeenCalled();
    });
  });

  describe('5. PlatformAdminJobTable', () => {
    it('renders job rows with status badges and action buttons', () => {
      const onView = vi.fn();
      const onUnpublish = vi.fn();
      const onDiscard = vi.fn();

      render(
        <PlatformAdminJobTable
          jobs={mockJobs}
          isLoading={false}
          onViewJob={onView}
          onUnpublishJob={onUnpublish}
          onDiscardJob={onDiscard}
        />
      );

      expect(screen.getAllByText('Lead Distributed Systems Architect')[0]).toBeInTheDocument();
      expect(screen.getByText('Senior DevOps & Reliability Engineer')).toBeInTheDocument();
      expect(screen.getByText('Zenith Quantum Corp')).toBeInTheDocument();
      expect(screen.getByText('Aether Robotics Labs')).toBeInTheDocument();

      // Published job has unpublish and discard buttons
      const unpublishBtns = screen.getAllByRole('button', { name: /unpublish/i });
      expect(unpublishBtns.length).toBeGreaterThan(0);
      fireEvent.click(unpublishBtns[0]);
      expect(onUnpublish).toHaveBeenCalledWith(mockJobs[0]);

      // View button
      const viewBtns = screen.getAllByRole('button', { name: /view/i });
      fireEvent.click(viewBtns[0]);
      expect(onView).toHaveBeenCalledWith(mockJobs[0]);
    });
  });

  describe('6. PlatformAdminJobDetailsModal', () => {
    it('renders complete job details, description, and application count', () => {
      const onClose = vi.fn();
      const onUnpublish = vi.fn();
      const onDiscard = vi.fn();

      render(
        <PlatformAdminJobDetailsModal
          isOpen={true}
          onClose={onClose}
          job={mockJobs[0]}
          onUnpublish={onUnpublish}
          onDiscard={onDiscard}
        />
      );

      expect(screen.getAllByText('Lead Distributed Systems Architect')[0]).toBeInTheDocument();
      expect(screen.getByText(/We are seeking a seasoned architect/i)).toBeInTheDocument();
      expect(screen.getByText(/14 candidates/i)).toBeInTheDocument();

      const closeBtns = screen.getAllByRole('button', { name: /close/i });
      fireEvent.click(closeBtns[closeBtns.length - 1]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('7. PlatformAdminJobManagementPage Integration', () => {
    it('fetches and displays jobs list and supports unpublish workflow', async () => {
      vi.spyOn(jobApi, 'listPlatformAdminJobs').mockResolvedValue({
        data: mockJobs,
        meta: { total: 2, page: 1, limit: 15, totalPages: 1 }
      });
      const unpublishSpy = vi.spyOn(jobApi, 'unpublishPlatformAdminJob').mockResolvedValue({
        success: true,
        message: 'Job unpublished'
      });

      renderWithProviders(<PlatformAdminJobManagementPage />);

      expect(await screen.findByText('Lead Distributed Systems Architect')).toBeInTheDocument();
      expect(screen.getByText('Senior DevOps & Reliability Engineer')).toBeInTheDocument();

      // Click Unpublish on the published job
      const unpublishBtn = screen.getByRole('button', { name: /unpublish/i });
      fireEvent.click(unpublishBtn);

      // Modal appears
      expect(await screen.findByText('Unpublish Job Listing')).toBeInTheDocument();
      const reasonInput = screen.getByPlaceholderText(/reason for unpublishing/i);
      fireEvent.change(reasonInput, { target: { value: 'Platform governance enforcement.' } });

      const confirmBtn = screen.getByRole('button', { name: /unpublish job/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(unpublishSpy).toHaveBeenCalledWith('job-uuid-1', {
          reason: 'Platform governance enforcement.'
        });
      });
    });
  });
});
