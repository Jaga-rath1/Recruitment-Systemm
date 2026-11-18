import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { ToastProvider } from '../context/ToastContext';
import { AuthProvider } from '../context/AuthContext';
import ToastContainer from '../components/common/ToastContainer';
import StageTracker from '../components/common/StageTracker';
import Modal from '../components/common/Modal';
import Tabs from '../components/common/Tabs';
import MarketingNavbar from '../components/layout/MarketingNavbar';
import DashboardSidebar from '../components/layout/DashboardSidebar';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import HomePage from '../modules/marketing/HomePage';
import CareersPage from '../modules/marketing/CareersPage';
import SubscribePage from '../modules/subscription/SubscribePage';
import CandidatePortalPage from '../modules/candidate-portal/CandidatePortalPage';
import * as apiModule from '../api';

vi.mock('../api', () => ({
  authApi: {
    me: vi.fn().mockRejectedValue(new Error('No session')),
    login: vi.fn(),
    registerCandidate: vi.fn(),
    verifyCandidateEmail: vi.fn(),
    resendCandidateVerification: vi.fn(),
    forgotCandidatePassword: vi.fn(),
    resetCandidatePassword: vi.fn(),
    changeCandidatePassword: vi.fn()
  },
  subscriptionApi: {
    create: vi.fn(),
    getStatus: vi.fn(),
    submitPaymentProof: vi.fn(),
    activateAccount: vi.fn()
  },
  portalApi: {
    getOverview: vi.fn(),
    updateProfile: vi.fn(),
    claimApplication: vi.fn(),
    respondOffer: vi.fn()
  },
  jobApi: {
    listPublicCareers: vi.fn(),
    getPublicJob: vi.fn()
  }
}));

function renderWithProviders(ui, initialRoute = '/') {
  return render(
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialRoute]}>
            {ui}
            <ToastContainer />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </MotionConfig>
  );
}

describe('NEXNUV Recruitment Frontend Components & Workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders Marketing HomePage with Subscribe CTA and clearly marked placeholder testimonials', () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByText(/Structured Enterprise Hiring from Requisition to Day-One Joining/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Start 15-Day Free Trial|Subscribe/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Placeholder Preview Testimonials/i)).toBeInTheDocument();
  });

  it('renders 8-stage Candidate Portal visual progress tracker cleanly', () => {
    const steps = [
      { key: 'APPLIED', label: 'Applied', status: 'COMPLETED' },
      { key: 'SCREENING', label: 'Screening', status: 'COMPLETED' },
      { key: 'TECHNICAL_INTERVIEW', label: 'Technical Interview', status: 'CURRENT' },
      { key: 'MANAGERIAL_INTERVIEW', label: 'Managerial Interview', status: 'UPCOMING' },
      { key: 'FINAL_SELECTION', label: 'Final Selection', status: 'UPCOMING' },
      { key: 'OFFER_PROCESSING', label: 'Offer Processing', status: 'UPCOMING' },
      { key: 'OFFER_ACCEPTED', label: 'Offer Accepted', status: 'UPCOMING' },
      { key: 'JOINING', label: 'Joining', status: 'UPCOMING' }
    ];

    render(<StageTracker steps={steps} currentStage="TECHNICAL_INTERVIEW" />);
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText('Technical Interview')).toBeInTheDocument();
    expect(screen.getByText('Joining')).toBeInTheDocument();
  });

  it('executes Organisation Subscription request and displays payment instructions', async () => {
    apiModule.subscriptionApi.create.mockResolvedValue({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        organisationName: 'Vertex Systems',
        adminEmail: 'admin@vertex.io',
        status: 'PENDING_PAYMENT',
        paymentInstructions: {
          isAvailable: true,
          bankName: 'Verified Partner Bank',
          accountName: 'NEXNUV Technologies Pvt. Ltd.',
          accountNumberMasked: '****4321',
          ifscCode: 'VPRT0001234',
          amountFormatted: '₹19,999',
          paymentMemo: 'NEXNUV-REC-11111111'
        }
      }
    });

    renderWithProviders(<SubscribePage />);

    fireEvent.change(screen.getByPlaceholderText('Acme Robotics Corp'), { target: { value: 'Vertex Systems' } });
    fireEvent.change(screen.getByPlaceholderText('acmerobotics.io'), { target: { value: 'vertex.io' } });
    fireEvent.change(screen.getByPlaceholderText('Elena Vance'), { target: { value: 'Sam Admin' } });
    fireEvent.change(screen.getByPlaceholderText('elena@acmerobotics.io'), { target: { value: 'admin@vertex.io' } });

    fireEvent.click(screen.getByRole('button', { name: /Create Subscription Request/i }));

    await waitFor(() => {
      expect(screen.getByText(/NEXNUV-REC-11111111/i)).toBeInTheDocument();
      expect(screen.getByText(/Step 2: Submit Payment Reference & Proof/i)).toBeInTheDocument();
    });
  });

  it('loads Candidate Portal overview without exposing internal remarks', async () => {
    apiModule.portalApi.getOverview.mockResolvedValue({
      data: {
        profile: { fullName: 'Jordan Blake', email: 'jordan@example.com' },
        applications: [
          {
            id: 'app-1',
            organisationName: 'Apex Cloud',
            applicationReference: 'NXV-20261110-ABCD',
            currentStage: 'OFFER_PROCESSING',
            submittedAt: '2026-11-10T08:00:00Z',
            job: { title: 'Principal Security Architect', department: 'Security', location: 'Remote' },
            progressTracker: [
              { key: 'APPLIED', label: 'Applied', status: 'COMPLETED' },
              { key: 'SCREENING', label: 'Screening', status: 'COMPLETED' },
              { key: 'TECHNICAL_INTERVIEW', label: 'Technical Interview', status: 'COMPLETED' },
              { key: 'MANAGERIAL_INTERVIEW', label: 'Managerial Interview', status: 'COMPLETED' },
              { key: 'FINAL_SELECTION', label: 'Final Selection', status: 'COMPLETED' },
              { key: 'OFFER_PROCESSING', label: 'Offer Processing', status: 'CURRENT' },
              { key: 'OFFER_ACCEPTED', label: 'Offer Accepted', status: 'UPCOMING' },
              { key: 'JOINING', label: 'Joining', status: 'UPCOMING' }
            ],
            stageHistory: [
              { id: 'h1', action: 'APPLICATION_SUBMITTED', note: 'Application submitted', createdAt: '2026-11-10T08:00:00Z' }
            ],
            offer: { id: 'off-1', status: 'SENT' }
          }
        ]
      }
    });

    renderWithProviders(<CandidatePortalPage />);

    await waitFor(() => {
      expect(screen.getByText('Principal Security Architect')).toBeInTheDocument();
      expect(screen.getByText(/NXV-20261110-ABCD/)).toBeInTheDocument();
      expect(screen.getByText('Offer: SENT')).toBeInTheDocument();
    });
  });

  it('loads Public Careers board with published jobs', async () => {
    apiModule.jobApi.listPublicCareers.mockResolvedValue({
      data: [
        {
          id: 'job-1',
          slug: 'staff-postgres-architect-job1',
          organisationName: 'Apex Cloud',
          title: 'Staff PostgreSQL Architect',
          department: 'Infrastructure',
          location: 'Remote',
          experienceLabel: '7-10 years',
          salaryDisplay: '160000-195000 USD',
          employmentType: 'FULL_TIME',
          skills: ['PostgreSQL', 'Prisma']
        }
      ],
      meta: { page: 1, totalPages: 1, total: 1 }
    });

    renderWithProviders(<CareersPage />);

    await waitFor(() => {
      expect(screen.getByText('Staff PostgreSQL Architect')).toBeInTheDocument();
      expect(screen.getByText('Apex Cloud')).toBeInTheDocument();
    });
  });

  it('toggles HomePage FAQ accordion items smoothly and updates aria-expanded', async () => {
    renderWithProviders(<HomePage />);
    const firstFaqBtn = screen.getByRole('button', {
      name: /How does NEXNUV Recruitment integrate with our existing HRMS/i
    });
    const secondFaqBtn = screen.getByRole('button', {
      name: /Are interviewer evaluations visible to candidates/i
    });
    expect(firstFaqBtn).toHaveAttribute('aria-expanded', 'true');
    expect(secondFaqBtn).toHaveAttribute('aria-expanded', 'false');

    await act(async () => {
      fireEvent.click(secondFaqBtn);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(secondFaqBtn).toHaveAttribute('aria-expanded', 'true');
    expect(firstFaqBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders full-width MarketingNavbar with mobile drawer toggle and primary links', async () => {
    renderWithProviders(<MarketingNavbar />);
    const toggleBtn = screen.getByRole('button', { name: /Toggle Menu/i });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

    await act(async () => {
      fireEvent.click(toggleBtn);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText('Features').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Careers').length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      fireEvent.click(toggleBtn);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders DashboardSidebar with permission items and supports desktop collapse toggle', async () => {
    localStorage.setItem('nexnuv_token', 'mock-jwt-token');
    apiModule.authApi.me.mockResolvedValue({
      data: {
        user: {
          name: 'Elena Vance',
          email: 'elena@acmerobotics.io',
          activeRoleCode: 'ORGANISATION_ADMIN',
          userType: 'ORG_USER',
          permissions: ['organisation:view', 'job:view', 'application:view']
        },
        organisation: { name: 'Acme Robotics Corp' }
      }
    });

    function SidebarHarness() {
      const [collapsed, setCollapsed] = useState(false);
      return (
        <DashboardSidebar
          open={false}
          onClose={() => {}}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
      );
    }

    renderWithProviders(<SidebarHarness />);

    await waitFor(() => {
      expect(screen.getByText('Jobs (HRMS & Manual)')).toBeInTheDocument();
      expect(screen.getByText('Applications')).toBeInTheDocument();
    });

    const collapseBtn = screen.getByRole('button', { name: /Collapse sidebar/i });
    fireEvent.click(collapseBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Expand sidebar/i })).toBeInTheDocument();
      expect(screen.queryByText('Jobs (HRMS & Manual)')).not.toBeInTheDocument();
    });
  });

  it('opens and closes accessible Modal via button and Escape key, and switches Tabs', () => {
    const onClose = vi.fn();
    function UiHarness() {
      const [tab, setTab] = useState('details');
      return (
        <div>
          <Tabs
            activeTab={tab}
            onChange={setTab}
            tabs={[
              { id: 'details', label: 'Details' },
              { id: 'history', label: 'History', count: 3 }
            ]}
          />
          <Modal isOpen title="Inspect Candidate" onClose={onClose}>
            <p>Active Tab: {tab}</p>
          </Modal>
        </div>
      );
    }

    renderWithProviders(<UiHarness />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Active Tab: details')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /History/i }));
    expect(screen.getByRole('tab', { name: /History/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Active Tab: history')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('preserves session token and shows retryable ErrorState when upstream returns 503 during auth check', async () => {
    localStorage.setItem('nexnuv_token', 'persistent-org-jwt');
    const outageErr = Object.assign(new Error('Auth Service is temporarily unavailable'), {
      status: 503,
      isServiceUnavailable: true
    });
    apiModule.authApi.me.mockRejectedValueOnce(outageErr);

    renderWithProviders(<ProtectedRoute allowedUserTypes={['ORG_USER']} />, '/app');

    await waitFor(() => {
      expect(screen.getByText('Dependent Service Temporarily Unavailable')).toBeInTheDocument();
      expect(screen.getByText('Auth Service is temporarily unavailable')).toBeInTheDocument();
    });
    expect(localStorage.getItem('nexnuv_token')).toBe('persistent-org-jwt');
  });

  it('clears session token on 401/403 authentication failure and prevents unauthorized portal access', async () => {
    localStorage.setItem('nexnuv_token', 'expired-jwt');
    const err401 = Object.assign(new Error('Unauthorized'), { status: 401, isServiceUnavailable: false });
    apiModule.authApi.me.mockRejectedValueOnce(err401);

    const { Routes, Route } = await import('react-router-dom');
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute allowedUserTypes={['ORG_USER']} />}>
          <Route path="/app" element={<div>Secret Org Dashboard</div>} />
        </Route>
        <Route path="/login" element={<div>Login Screen</div>} />
      </Routes>,
      '/app'
    );

    await waitFor(() => {
      expect(screen.getByText('Login Screen')).toBeInTheDocument();
    });
    expect(screen.queryByText('Secret Org Dashboard')).not.toBeInTheDocument();
    expect(localStorage.getItem('nexnuv_token')).toBeNull();
  });

  it('redirects candidate account away from /app to /portal without rendering internal data', async () => {
    localStorage.setItem('nexnuv_token', 'cand-jwt');
    apiModule.authApi.me.mockResolvedValueOnce({
      data: {
        user: {
          name: 'Cand User',
          email: 'cand@example.com',
          activeRoleCode: 'CANDIDATE',
          userType: 'CANDIDATE',
          permissions: ['candidate:self']
        },
        organisation: null
      }
    });

    const { Routes, Route } = await import('react-router-dom');
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute allowedUserTypes={['ORG_USER']} />}>
          <Route path="/app" element={<div>Secret Org Workspace</div>} />
        </Route>
        <Route path="/portal" element={<div>Candidate Portal Home</div>} />
      </Routes>,
      '/app'
    );

    await waitFor(() => {
      expect(screen.getByText('Candidate Portal Home')).toBeInTheDocument();
    });
    expect(screen.queryByText('Secret Org Workspace')).not.toBeInTheDocument();
  });

  it('redirects organisation employee away from /portal to /app and clears session on unauthorized event', async () => {
    localStorage.setItem('nexnuv_token', 'org-user-jwt');
    apiModule.authApi.me.mockResolvedValueOnce({
      data: {
        user: {
          name: 'Recruiter User',
          email: 'recruiter@acme.io',
          activeRoleCode: 'RECRUITER',
          userType: 'ORG_USER',
          permissions: ['job:view']
        },
        organisation: { id: 'org-1', name: 'Acme Corp' }
      }
    });

    const { Routes, Route } = await import('react-router-dom');
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute allowedUserTypes={['CANDIDATE']} />}>
          <Route path="/portal" element={<div>Secret Candidate Portal</div>} />
        </Route>
        <Route path="/app" element={<div>Organisation Workspace Home</div>} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>,
      '/portal'
    );

    await waitFor(() => {
      expect(screen.getByText('Organisation Workspace Home')).toBeInTheDocument();
    });
    expect(screen.queryByText('Secret Candidate Portal')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('nexnuv:unauthorized'));
    });

    await waitFor(() => {
      expect(localStorage.getItem('nexnuv_token')).toBeNull();
    });
  });

  it('enforces safe extensions & max file size in FileUpload and cleans up authenticated Blob downloads', async () => {
    const FileUpload = (await import('../components/common/FileUpload')).default;
    const CandidateOffersPage = (await import('../modules/candidate-portal/CandidateOffersPage')).default;
    const httpMod = await import('../api/httpClient');

    // 1. FileUpload blocks double dangerous extensions and oversized files client-side
    const onSelect = vi.fn();
    const { container } = render(<FileUpload label="Resume Upload" onFileSelect={onSelect} maxSizeMb={1} />);
    const input = container.querySelector('input[type="file"]');

    const dangerousFile = new File(['MZ'], 'resume.exe.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [dangerousFile] } });
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(screen.getByText(/Unsupported or blocked file type/i)).toBeInTheDocument();

    const oversizedFile = new File([new Uint8Array(2 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [oversizedFile] } });
    expect(screen.getByText(/exceeds maximum size of 1MB/i)).toBeInTheDocument();

    const validFile = new File(['%PDF-1.4'], 'clean-resume.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [validFile] } });
    expect(onSelect).toHaveBeenLastCalledWith(validFile);

    // 2. downloadAuthenticatedFile fetches Blob cleanly and revokes object URL
    vi.useFakeTimers();
    const createUrlSpy = vi.fn(() => 'blob:https://app.nexnuv.test/doc-123');
    const revokeUrlSpy = vi.fn();
    const origCreateObjectUrl = window.URL.createObjectURL;
    const origRevokeObjectUrl = window.URL.revokeObjectURL;
    window.URL.createObjectURL = createUrlSpy;
    window.URL.revokeObjectURL = revokeUrlSpy;

    const getSpy = vi
      .spyOn(httpMod.default, 'get')
      .mockResolvedValueOnce(new Blob(['%PDF-1.4\noffer'], { type: 'application/pdf' }))
      .mockRejectedValueOnce(new Error('Cross-tenant document access denied'));

    try {
      await httpMod.downloadAuthenticatedFile('/api/v1/files/download?token=signed-abc', 'offer-letter.pdf');
      expect(getSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/files\/download\?token=signed-abc$/),
        {
          baseURL: '',
          responseType: 'blob'
        }
      );
      expect(createUrlSpy).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1100);
      expect(revokeUrlSpy).toHaveBeenCalledWith('blob:https://app.nexnuv.test/doc-123');

      await expect(
        httpMod.downloadAuthenticatedFile('/api/v1/files/download?token=forbidden', 'secret.pdf')
      ).rejects.toThrow(/Cross-tenant document access denied/);
    } finally {
      vi.useRealTimers();
      window.URL.createObjectURL = origCreateObjectUrl;
      window.URL.revokeObjectURL = origRevokeObjectUrl;
      getSpy.mockRestore();
    }

    // 3. CandidateOffersPage uses authenticated download trigger cleanly without exposing raw URLs
    apiModule.portalApi.getOverview.mockResolvedValueOnce({
      data: {
        applications: [
          {
            id: 'app-1',
            applicationReference: 'NXV-20261111-AABB11',
            organisationName: 'Acme Corp',
            offer: {
              id: 'offer-1',
              designation: 'Senior Engineer',
              department: 'Platform',
              offeredSalary: 140000,
              salaryCurrency: 'USD',
              joiningDate: new Date().toISOString(),
              offerValidUntil: new Date(Date.now() + 86400000).toISOString(),
              status: 'SENT',
              documents: [
                {
                  id: 'od-1',
                  fileName: 'acme-offer.pdf',
                  downloadUrl: '/api/v1/files/download?token=offer-tok'
                }
              ]
            },
            joiningRecord: null
          }
        ]
      }
    });

    renderWithProviders(<CandidateOffersPage />);
    await waitFor(() => {
      expect(screen.getByText(/Download acme-offer\.pdf/i)).toBeInTheDocument();
    });
    const offerBtn = screen.getByText(/Download acme-offer\.pdf/i);
    expect(offerBtn.tagName).toBe('BUTTON');
    expect(offerBtn.getAttribute('href')).toBeNull();
  });

  it('enforces candidate email verification flow on registration without granting a session before OTP verification', async () => {
    const LoginPage = (await import('../modules/marketing/LoginPage')).default;
    apiModule.authApi.registerCandidate.mockResolvedValueOnce({
      data: {
        requiresEmailVerification: true,
        emailVerified: false,
        resendCooldownSeconds: 60,
        user: { email: 'new.cand@example.com', userType: 'CANDIDATE', emailVerified: false }
      }
    });
    apiModule.authApi.verifyCandidateEmail.mockResolvedValueOnce({
      data: { emailVerified: true }
    });

    renderWithProviders(<LoginPage />, '/login');
    fireEvent.click(screen.getByText('Candidate Sign Up'));
    fireEvent.change(screen.getByPlaceholderText('Jordan Blake'), { target: { value: 'New Candidate' } });
    fireEvent.change(screen.getByPlaceholderText('jordan@example.com'), { target: { value: 'new.cand@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('StrongPass#2026'), { target: { value: 'StrongPass#2026' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Candidate Account/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
    });
    expect(localStorage.getItem('nexnuv_token')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify Email/i }));

    await waitFor(() => {
      expect(apiModule.authApi.verifyCandidateEmail).toHaveBeenCalledWith({
        email: 'new.cand@example.com',
        otp: '654321'
      });
    });
    expect(localStorage.getItem('nexnuv_token')).toBeNull();
    expect(screen.getByPlaceholderText('admin@company.com')).toBeInTheDocument();
  });

  it('handles forgot password request cleanly without revealing account existence', async () => {
    const ForgotPasswordPage = (await import('../modules/marketing/ForgotPasswordPage')).default;

    apiModule.authApi.forgotCandidatePassword.mockResolvedValueOnce({
      data: { accepted: true },
      message: 'If a verified candidate account exists for this email, password reset instructions have been sent.'
    });

    renderWithProviders(<ForgotPasswordPage />, '/forgot-password');
    fireEvent.change(screen.getByPlaceholderText('jordan@example.com'), {
      target: { value: 'jordan@example.com' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Send Reset Instructions/i }));

    await waitFor(() => {
      expect(apiModule.authApi.forgotCandidatePassword).toHaveBeenCalledWith({ email: 'jordan@example.com' });
      expect(screen.getByText(/I Have a Reset Token/i)).toBeInTheDocument();
    });
  });

  it('handles candidate password reset token submission flow', async () => {
    const ResetPasswordPage = (await import('../modules/marketing/ResetPasswordPage')).default;
    apiModule.authApi.resetCandidatePassword.mockResolvedValueOnce({ data: { resetCompleted: true } });

    renderWithProviders(<ResetPasswordPage />, '/reset-password?token=test-reset-token-value-123456');
    const newPassInputs = screen.getAllByPlaceholderText(/StrongPass#2026|Re-enter new password/i);
    fireEvent.change(newPassInputs[0], { target: { value: 'NewStrongPass#2026' } });
    fireEvent.change(newPassInputs[1], { target: { value: 'NewStrongPass#2026' } });
    fireEvent.click(screen.getByRole('button', { name: /Reset Password/i }));

    await waitFor(() => {
      expect(apiModule.authApi.resetCandidatePassword).toHaveBeenCalledWith({
        token: 'test-reset-token-value-123456',
        newPassword: 'NewStrongPass#2026',
        confirmPassword: 'NewStrongPass#2026'
      });
      expect(screen.getByText(/Sign In With New Password/i)).toBeInTheDocument();
    });
  });

  it('handles explicit application claim UI and change password session revocation on CandidateProfilePage', async () => {
    const CandidateProfilePage = (await import('../modules/candidate-portal/CandidateProfilePage')).default;

    localStorage.setItem('nexnuv_token', 'verified-cand-jwt');
    apiModule.authApi.me.mockResolvedValue({
      data: {
        user: {
          name: 'Jordan Candidate',
          email: 'jordan@example.com',
          activeRoleCode: 'CANDIDATE',
          userType: 'CANDIDATE',
          emailVerified: true,
          permissions: ['candidate:self']
        },
        organisation: null
      }
    });
    apiModule.portalApi.getOverview.mockResolvedValue({
      data: {
        profile: { fullName: 'Jordan Candidate', email: 'jordan@example.com', mobileNumber: '+1-555-1111', location: 'NYC' },
        accountSecurity: { emailVerified: true, emailVerifiedAt: new Date().toISOString(), passwordChangedAt: null },
        applications: []
      }
    });
    apiModule.portalApi.claimApplication.mockResolvedValueOnce({
      data: { claimed: true, claimedApplications: [{ id: 'app-1' }], organisationName: 'Acme Corp' }
    });
    apiModule.authApi.changeCandidatePassword.mockResolvedValueOnce({
      data: { passwordChanged: true, sessionsRevoked: true }
    });

    renderWithProviders(<CandidateProfilePage />, '/portal/profile');
    await waitFor(() => {
      expect(screen.getByText('Email Verified')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx'), {
      target: { value: '11111111-1111-4111-8111-111111111111' }
    });
    fireEvent.change(screen.getByPlaceholderText('NXV-20261112-A1B2C3'), {
      target: { value: 'NXV-20261112-XYZ999' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Claim Application/i }));

    await waitFor(() => {
      expect(apiModule.portalApi.claimApplication).toHaveBeenCalledWith({
        organisationId: '11111111-1111-4111-8111-111111111111',
        applicationReference: 'NXV-20261112-XYZ999'
      });
    });

    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'StrongPass#2026' } });
    const changePwInputs = screen.getAllByPlaceholderText('StrongPass#2026');
    fireEvent.change(changePwInputs[0], { target: { value: 'ChangedPass#2026' } });
    fireEvent.change(changePwInputs[1], { target: { value: 'ChangedPass#2026' } });
    fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

    await waitFor(() => {
      expect(apiModule.authApi.changeCandidatePassword).toHaveBeenCalledWith({
        currentPassword: 'StrongPass#2026',
        newPassword: 'ChangedPass#2026',
        confirmPassword: 'ChangedPass#2026'
      });
      expect(localStorage.getItem('nexnuv_token')).toBeNull();
    });
  });
});
