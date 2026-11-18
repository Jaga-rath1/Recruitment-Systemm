import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CancelSubscriptionModal from '../modules/platform/components/CancelSubscriptionModal';

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

describe('Platform Admin Subscription Cancellation Modal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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
    expect(screen.getByText('4')).toBeInTheDocument();

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
