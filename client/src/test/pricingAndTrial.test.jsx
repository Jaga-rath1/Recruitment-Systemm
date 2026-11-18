import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../context/ToastContext';
import { subscriptionApi } from '../api';
import PricingPage from '../modules/marketing/PricingPage';
import SubscribePage from '../modules/subscription/SubscribePage';

// Mock AuthContext
const mockSetSession = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    organisation: null,
    setSession: mockSetSession,
    logout: vi.fn(),
    hasPermission: () => true
  })
}));

describe('Pricing Page & 15-Day Free Trial UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSetSession.mockClear();
  });

  it('renders all three paid plans (Basic, Advanced, Enterprise) and the 15-Day Free Trial banner', async () => {
    vi.spyOn(subscriptionApi, 'getPlans').mockResolvedValue({
      data: {
        plans: [
          { code: 'RECRUITMENT_BASIC', name: 'Basic', pricing: { monthly: { amount: 999 }, annual: { amount: 9999 } } },
          { code: 'RECRUITMENT_ADVANCED', name: 'Advanced', isPopular: true, pricing: { monthly: { amount: 1999 }, annual: { amount: 19999 } } },
          { code: 'RECRUITMENT_ENTERPRISE', name: 'Enterprise', pricing: { monthly: { amount: 4999 }, annual: { amount: 49999 } } }
        ],
        trial: { durationDays: 15, price: 0 }
      }
    });

    render(
      <MemoryRouter>
        <ToastProvider>
          <PricingPage />
        </ToastProvider>
      </MemoryRouter>
    );

    // Trial Banner Verification
    expect(screen.getAllByText(/Start 15-Day Free Trial/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Zero Commitment/i)).toBeInTheDocument();

    // 3 Paid Plans Verification
    expect(screen.getByRole('heading', { name: /^Basic$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Advanced$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Enterprise$/i })).toBeInTheDocument();

    // Most popular badge
    expect(screen.getByText(/MOST POPULAR/i)).toBeInTheDocument();

    // Comparison Table
    expect(screen.getByText(/Detailed Plan Comparison/i)).toBeInTheDocument();
    expect(screen.getByText(/Job & Requisition Management/i)).toBeInTheDocument();
  });

  it('switches billing cycle between Monthly and Annual on PricingPage and updates prices', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <PricingPage />
        </ToastProvider>
      </MemoryRouter>
    );

    // Initial is Annual (Save 17%)
    expect(screen.getByText(/Save 17%/i)).toBeInTheDocument();
    expect(screen.getByText('₹833')).toBeInTheDocument(); // Basic annual monthly equivalent

    // Switch to Monthly
    const monthlyBtn = screen.getByRole('button', { name: /Monthly Billing/i });
    fireEvent.click(monthlyBtn);

    // Prices updated to monthly rates
    expect(screen.getByText('₹999')).toBeInTheDocument();
    expect(screen.getByText('₹1,999')).toBeInTheDocument();
    expect(screen.getByText('₹4,999')).toBeInTheDocument();
  });

  it('allows activating 15-Day Free Trial in SubscribePage with instant account creation', async () => {
    const activateTrialSpy = vi.spyOn(subscriptionApi, 'activateTrial').mockResolvedValue({
      data: {
        subscription: {
          id: 'sub-trial-1234',
          organisationName: 'Galactic Ventures',
          organisationDomain: 'galactic.io',
          status: 'TRIAL',
          adminName: 'Arthur Dent',
          adminEmail: 'arthur@galactic.io'
        },
        token: 'mock-jwt-token-trial',
        user: {
          userId: 'user-trial-1234',
          name: 'Arthur Dent',
          email: 'arthur@galactic.io',
          activeRoleCode: 'ORGANISATION_ADMIN'
        },
        trial: {
          startsAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 15 * 86400000).toISOString(),
          daysRemaining: 15
        }
      }
    });

    render(
      <MemoryRouter initialEntries={['/subscribe?plan=TRIAL']}>
        <ToastProvider>
          <SubscribePage />
        </ToastProvider>
      </MemoryRouter>
    );

    // Verify 15-Day Free Trial mode is active
    expect(screen.getByRole('heading', { name: /Activate 15-Day Free Trial/i })).toBeInTheDocument();
    expect(screen.getByText(/15-Day Free Trial Terms/i)).toBeInTheDocument();

    // Fill trial form
    fireEvent.change(screen.getByPlaceholderText('Acme Technologies Corp'), {
      target: { value: 'Galactic Ventures' }
    });
    fireEvent.change(screen.getByPlaceholderText('acmetech.io'), {
      target: { value: 'galactic.io' }
    });
    fireEvent.change(screen.getByPlaceholderText('Elena Vance'), {
      target: { value: 'Arthur Dent' }
    });
    fireEvent.change(screen.getByPlaceholderText('elena@acmetech.io'), {
      target: { value: 'arthur@galactic.io' }
    });
    fireEvent.change(screen.getByPlaceholderText('Min 8 characters'), {
      target: { value: 'Password123!' }
    });

    // Submit trial activation
    const submitBtn = screen.getByRole('button', { name: /Activate 15-Day Free Trial Now/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(activateTrialSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          organisationName: 'Galactic Ventures',
          organisationDomain: 'galactic.io',
          adminName: 'Arthur Dent',
          adminEmail: 'arthur@galactic.io',
          password: 'Password123!'
        })
      );
    });

    // Success screen rendered
    await waitFor(() => {
      expect(screen.getByText(/15-Day Free Trial Activated/i)).toBeInTheDocument();
      expect(screen.getByText(/Enter Organisation Workspace/i)).toBeInTheDocument();
      expect(screen.getByText(/Days Remaining:/i)).toBeInTheDocument();
    });
  });

  it('allows selecting paid plans (Basic, Advanced, Enterprise) with calculated wire remittance on SubscribePage', async () => {
    const createSubSpy = vi.spyOn(subscriptionApi, 'create').mockResolvedValue({
      data: {
        id: 'sub-paid-9988',
        organisationName: 'Nova FinTech Corp',
        adminEmail: 'alex@novafin.com',
        status: 'PENDING_PAYMENT',
        paymentInstructions: {
          isAvailable: true,
          planName: 'Enterprise',
          amountFormatted: '₹49,999',
          bankName: 'Verified Partner Bank',
          accountName: 'NEXNUV Technologies Pvt. Ltd.',
          accountNumberMasked: '****4321',
          ifscCode: 'VPRT0001234',
          paymentMemo: 'NEXNUV-REC-SUB9988'
        }
      }
    });

    render(
      <MemoryRouter initialEntries={['/subscribe?plan=ENTERPRISE&cycle=ANNUAL']}>
        <ToastProvider>
          <SubscribePage />
        </ToastProvider>
      </MemoryRouter>
    );

    // Should be in paid mode for Enterprise
    expect(screen.getByRole('heading', { name: /Subscribe to Enterprise Tier/i })).toBeInTheDocument();
    expect(screen.getByText(/₹49,999 INR \(12 Months\)/i)).toBeInTheDocument();

    // Fill Step 1 details
    fireEvent.change(screen.getByPlaceholderText('Acme Robotics Corp'), {
      target: { value: 'Nova FinTech Corp' }
    });
    fireEvent.change(screen.getByPlaceholderText('acmerobotics.io'), {
      target: { value: 'novafin.com' }
    });
    fireEvent.change(screen.getByPlaceholderText('Elena Vance'), {
      target: { value: 'Alex Mercer' }
    });
    fireEvent.change(screen.getByPlaceholderText('elena@acmerobotics.io'), {
      target: { value: 'alex@novafin.com' }
    });

    // Click submit
    const submitBtn = screen.getByRole('button', { name: /Create Subscription Request/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSubSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          organisationName: 'Nova FinTech Corp',
          organisationDomain: 'novafin.com',
          planCode: 'RECRUITMENT_ENTERPRISE',
          billingCycle: 'ANNUAL'
        })
      );
    });

    // Step 2 payment instructions rendered
    await waitFor(() => {
      expect(screen.getByText(/Payment Remittance Instructions/i)).toBeInTheDocument();
      expect(screen.getByText(/NEXNUV-REC-SUB9988/i)).toBeInTheDocument();
    });
  });

  it('displays safe unavailable notice and disables payment proof submission when treasury is unavailable', async () => {
    vi.spyOn(subscriptionApi, 'create').mockResolvedValue({
      data: {
        id: 'sub-unavail-1122',
        organisationName: 'Cloud Nexus Corp',
        adminEmail: 'ops@cloudnexus.io',
        status: 'PENDING_PAYMENT',
        paymentInstructions: {
          isAvailable: false,
          planName: 'Basic',
          amountFormatted: '₹9,999',
          paymentMemo: 'NEXNUV-REC-SUB1122',
          unavailableReason:
            'Payment instructions are temporarily unavailable. Please contact the platform administrator.'
        }
      }
    });

    render(
      <MemoryRouter initialEntries={['/subscribe?plan=BASIC&cycle=ANNUAL']}>
        <ToastProvider>
          <SubscribePage />
        </ToastProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText('Acme Robotics Corp'), {
      target: { value: 'Cloud Nexus Corp' }
    });
    fireEvent.change(screen.getByPlaceholderText('acmerobotics.io'), {
      target: { value: 'cloudnexus.io' }
    });
    fireEvent.change(screen.getByPlaceholderText('Elena Vance'), {
      target: { value: 'Morgan Pendelton' }
    });
    fireEvent.change(screen.getByPlaceholderText('elena@acmerobotics.io'), {
      target: { value: 'ops@cloudnexus.io' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Create Subscription Request/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /Payment instructions are temporarily unavailable\. Please contact the platform administrator\./i
        )
      ).toBeInTheDocument();
      expect(screen.getByText(/Payment Proof Submission Unavailable/i)).toBeInTheDocument();
      // Bank detail fields must NOT be rendered
      expect(screen.queryByText(/^Bank:$/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/HDFC/i)).not.toBeInTheDocument();
      // Proof submit button should not be present
      expect(
        screen.queryByRole('button', { name: /Submit Payment Proof for Verification/i })
      ).not.toBeInTheDocument();
    });
  });
});
