const RECRUITMENT_PLANS = {
  RECRUITMENT_BASIC: {
    name: 'Basic',
    code: 'RECRUITMENT_BASIC',
    description: 'Essential recruitment features for small businesses.',
    trialDays: 15,
    pricing: {
      MONTHLY: { amountCents: 99900, currency: 'INR', durationDays: 30 },
      ANNUAL: { amountCents: 999900, currency: 'INR', durationDays: 365 }
    },
    features: [
      'Unlimited manual job postings',
      'Public branded Careers portal',
      'Standard Applicant Tracking System (ATS)',
      'Candidate Self-Service Portal',
      'Basic Interview Scheduling',
      'Email notifications for applicants'
    ]
  },
  RECRUITMENT_ADVANCED: {
    name: 'Advanced',
    code: 'RECRUITMENT_ADVANCED',
    description: 'Complete recruitment workflow for growing organisations.',
    trialDays: 15,
    isPopular: true,
    pricing: {
      MONTHLY: { amountCents: 199900, currency: 'INR', durationDays: 30 },
      ANNUAL: { amountCents: 1999900, currency: 'INR', durationDays: 365 }
    },
    features: [
      'Everything in Basic',
      'Bidirectional HRMS Requisition Sync',
      'Technical & Senior Interview Scorecards',
      'Offer Letter Generation & Digital Signing',
      'Candidate Document Security & Anti-Malware Vault',
      'Multi-Role RBAC (Recruiters, Interviewers, Org Admins)',
      'Joining & Pre-Onboarding Workflow'
    ]
  },
  RECRUITMENT_ENTERPRISE: {
    name: 'Enterprise',
    code: 'RECRUITMENT_ENTERPRISE',
    description: 'Advanced recruitment capabilities for large organisations.',
    trialDays: 15,
    pricing: {
      MONTHLY: { amountCents: 499900, currency: 'INR', durationDays: 30 },
      ANNUAL: { amountCents: 4999900, currency: 'INR', durationDays: 365 }
    },
    features: [
      'Everything in Advanced',
      'Dedicated PostgreSQL Row-Level Tenant Isolation',
      'Immutable Audit Logging Ledger',
      'Cloudinary Horizontal Storage Integration',
      'Custom Treasury Wire/ACH Verification SLA',
      'Priority Support & Dedicated Account Setup'
    ]
  },
  RECRUITMENT_PREMIUM: {
    name: 'Recruitment Premium',
    code: 'RECRUITMENT_PREMIUM',
    description: 'Legacy premium recruitment tier.',
    trialDays: 15,
    pricing: {
      MONTHLY: { amountCents: 199900, currency: 'INR', durationDays: 30 },
      ANNUAL: { amountCents: 1999900, currency: 'INR', durationDays: 365 }
    },
    features: [
      'Full ATS pipeline',
      'Document security',
      'Candidate portal'
    ]
  }
};

const PLAN_PRICING = {
  RECRUITMENT_BASIC: RECRUITMENT_PLANS.RECRUITMENT_BASIC.pricing,
  RECRUITMENT_ADVANCED: RECRUITMENT_PLANS.RECRUITMENT_ADVANCED.pricing,
  RECRUITMENT_ENTERPRISE: RECRUITMENT_PLANS.RECRUITMENT_ENTERPRISE.pricing,
  RECRUITMENT_PREMIUM: RECRUITMENT_PLANS.RECRUITMENT_PREMIUM.pricing,
  BASIC: RECRUITMENT_PLANS.RECRUITMENT_BASIC.pricing,
  ADVANCED: RECRUITMENT_PLANS.RECRUITMENT_ADVANCED.pricing,
  ENTERPRISE: RECRUITMENT_PLANS.RECRUITMENT_ENTERPRISE.pricing
};

const ACTIVATION_LIFECYCLE_STATUS = {
  PENDING_PAYMENT: 'PAYMENT_PENDING',
  PENDING_VERIFICATION: 'PAYMENT_VERIFICATION_PENDING',
  APPROVED: 'PAYMENT_APPROVED',
  ACTIVE: 'ACTIVATION_COMPLETED',
  REJECTED: 'PAYMENT_REJECTED',
  EXPIRED: 'SUBSCRIPTION_EXPIRED',
  TRIAL: 'TRIAL_ACTIVE'
};

module.exports = {
  RECRUITMENT_PLANS,
  PLAN_PRICING,
  ACTIVATION_LIFECYCLE_STATUS
};
