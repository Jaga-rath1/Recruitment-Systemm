import React, { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Building2,
  CreditCard,
  Clock,
  KeyRound,
  Sparkles,
  Zap,
  Building,
  Calendar,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import FileUpload from '../../components/common/FileUpload';
import { InputField, SelectField, TextAreaField } from '../../components/common/FormField';
import { subscriptionApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

const PLAN_CONFIG = {
  BASIC: {
    code: 'RECRUITMENT_BASIC',
    name: 'Basic',
    description: 'Essential recruitment features for small businesses.',
    monthlyPrice: 999,
    annualPrice: 9999,
    trialDays: 15,
    icon: Zap
  },
  ADVANCED: {
    code: 'RECRUITMENT_ADVANCED',
    name: 'Advanced',
    description: 'Complete recruitment workflow for growing organisations.',
    monthlyPrice: 1999,
    annualPrice: 19999,
    trialDays: 15,
    icon: Sparkles
  },
  ENTERPRISE: {
    code: 'RECRUITMENT_ENTERPRISE',
    name: 'Enterprise',
    description: 'Advanced recruitment capabilities for large organisations.',
    monthlyPrice: 4999,
    annualPrice: 49999,
    trialDays: 15,
    icon: Building
  }
};

export default function SubscribePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { setSession } = useAuth();

  const initialPlanParam = searchParams.get('plan')?.toUpperCase() || 'ADVANCED';
  const initialMode = initialPlanParam === 'TRIAL' ? 'TRIAL' : 'PAID';
  const initialPaidPlan = ['BASIC', 'ADVANCED', 'ENTERPRISE'].includes(initialPlanParam)
    ? initialPlanParam
    : 'ADVANCED';

  const [mode, setMode] = useState(initialMode); // 'TRIAL' or 'PAID'
  const [selectedPlanKey, setSelectedPlanKey] = useState(initialPaidPlan);
  const [billingCycle, setBillingCycle] = useState(
    searchParams.get('cycle')?.toUpperCase() === 'MONTHLY' ? 'MONTHLY' : 'ANNUAL'
  );

  const [subscription, setSubscription] = useState(null);
  const [trialResult, setTrialResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [proofFile, setProofFile] = useState(null);

  // Form for Trial
  const [trialForm, setTrialForm] = useState({
    organisationName: '',
    organisationDomain: '',
    industry: 'Technology & SaaS',
    companySize: '11-50',
    adminName: '',
    adminEmail: '',
    password: ''
  });

  // Form for Paid Plan
  const [orgForm, setOrgForm] = useState({
    organisationName: '',
    organisationDomain: '',
    industry: 'Technology & SaaS',
    companySize: '51-200',
    adminName: '',
    adminEmail: ''
  });

  const [paymentForm, setPaymentForm] = useState({
    paymentReference: '',
    paymentMethod: 'WIRE_TRANSFER',
    notes: ''
  });

  // Dates for trial projection
  const trialStartDate = new Date();
  const trialEndDate = new Date(trialStartDate.getTime() + 15 * 24 * 60 * 60 * 1000);

  const handleSelectMode = (newMode, planKey = null) => {
    setMode(newMode);
    if (newMode === 'TRIAL') {
      setSearchParams({ plan: 'TRIAL' });
    } else {
      const targetPlan = planKey || selectedPlanKey;
      setSelectedPlanKey(targetPlan);
      setSearchParams({ plan: targetPlan, cycle: billingCycle });
    }
  };

  const handleActivateTrial = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await subscriptionApi.activateTrial(trialForm);
      setTrialResult(res.data);
      if (res.data?.token && res.data?.user) {
        await setSession(res.data.token, res.data.user);
      }
      addToast({
        title: '15-Day Free Trial Activated',
        message: 'Your organisation workspace has been provisioned. Welcome to NEXNUV Recruitment!',
        variant: 'success'
      });
    } catch (err) {
      if (err.data?.code === 'TRIAL_ALREADY_USED' || err.message?.includes('already been activated')) {
        addToast({
          title: 'Trial Already Used',
          message:
            'A 15-day free trial has already been used for this organisation domain or administrator email. Please select Basic, Advanced, or Enterprise.',
          variant: 'error'
        });
      } else {
        addToast({ title: 'Trial Activation Failed', message: err.message, variant: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSubscription = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const activeTier = PLAN_CONFIG[selectedPlanKey];
      const res = await subscriptionApi.create({
        ...orgForm,
        planCode: activeTier.code,
        billingCycle
      });
      setSubscription(res.data);
      addToast({
        title: 'Subscription Created',
        message: 'Review payment instructions below and upload your wire/ACH remittance receipt.',
        variant: 'success'
      });
    } catch (err) {
      addToast({ title: 'Error', message: err.message, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('paymentReference', paymentForm.paymentReference);
      fd.append('paymentMethod', paymentForm.paymentMethod);
      fd.append('submittedByEmail', subscription.adminEmail);
      if (paymentForm.notes) fd.append('notes', paymentForm.notes);
      if (proofFile) fd.append('proof', proofFile);

      const res = await subscriptionApi.submitPaymentProof(subscription.id, fd);
      setSubscription(res.data.subscription);
      addToast({
        title: 'Payment Proof Submitted',
        message: 'Your payment is queued for Platform Admin verification.',
        variant: 'success'
      });
    } catch (err) {
      addToast({ title: 'Submission Failed', message: err.message, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!subscription?.id) return;
    try {
      const res = await subscriptionApi.getStatus(subscription.id);
      setSubscription(res.data);
    } catch (err) {
      addToast({ title: 'Refresh Failed', message: err.message, variant: 'error' });
    }
  };

  const currentStep = !subscription
    ? 1
    : ['PENDING_PAYMENT', 'REJECTED'].includes(subscription.status)
    ? 2
    : 3;

  const currentPlan = PLAN_CONFIG[selectedPlanKey];
  const calculatedPrice = billingCycle === 'ANNUAL' ? currentPlan.annualPrice : currentPlan.monthlyPrice;

  return (
    <PageTransition className="w-full px-4 py-12 sm:px-6 lg:px-10 xl:px-12">
      {/* Header Banner */}
      <div className="mb-8 border-b border-slate-100 pb-6">
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          ORGANISATION ONBOARDING
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
          {mode === 'TRIAL' ? 'Activate 15-Day Free Trial' : 'Subscribe Your Organisation'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          {mode === 'TRIAL'
            ? 'Evaluate the complete recruitment automation pipeline with zero commitment or payment info needed.'
            : 'Select your preferred subscription tier, remit payment via wire/ACH, and activate your dedicated Recruitment workspace.'}
        </p>

        {/* Plan Mode Selector Tabs */}
        {!subscription && !trialResult && (
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleSelectMode('TRIAL')}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                mode === 'TRIAL'
                  ? 'border border-brand-500 bg-brand-50 text-brand-800 shadow-xs'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Clock className="h-4 w-4 text-brand-600" />
              <span>15-Day Free Trial (₹0)</span>
            </button>

            {Object.keys(PLAN_CONFIG).map((pKey) => {
              const p = PLAN_CONFIG[pKey];
              const isSelected = mode === 'PAID' && selectedPlanKey === pKey;
              const formattedPrice = (billingCycle === 'ANNUAL' ? p.annualPrice : p.monthlyPrice).toLocaleString('en-IN');
              return (
                <button
                  key={pKey}
                  type="button"
                  onClick={() => handleSelectMode('PAID', pKey)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${
                    isSelected
                      ? 'border border-brand-500 bg-brand-50 text-brand-800 shadow-xs'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{p.name}</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    (₹{formattedPrice}/{billingCycle === 'ANNUAL' ? 'yr' : 'mo'})
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid w-full items-start gap-8 lg:grid-cols-12">
        {/* Left Side: Information Card */}
        <aside className="space-y-4 lg:col-span-4">
          {mode === 'TRIAL' ? (
            <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/70 via-blue-50/50 to-white p-6 shadow-xs">
              <div className="flex items-center gap-2 text-brand-700">
                <Clock className="h-5 w-5" />
                <h2 className="text-base font-bold text-slate-900">15-Day Free Trial Terms</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Test-drive our full Advanced tier capabilities. Trial begins instantly from your activation timestamp and is strictly enforced server-side.
              </p>

              <div className="mt-5 space-y-3 border-t border-brand-100 pt-5 text-xs text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Duration:</span>
                  <span className="font-semibold text-slate-900">15 Days (Calendar)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Evaluation Plan:</span>
                  <span className="font-semibold text-brand-700">Advanced Tier</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Estimated Expiry:</span>
                  <span className="font-semibold text-slate-900">
                    {trialEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Credit Card:</span>
                  <span className="font-semibold text-emerald-700">Not Required</span>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-brand-200 bg-white/80 p-3.5 text-[11px] leading-relaxed text-slate-600">
                <strong>No Automatic Charges:</strong> When your 15 days expire, you will be prompted to select Basic, Advanced, or Enterprise to continue. You will never be billed automatically.
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Onboarding Progress
              </h2>
              <div className="mt-4 space-y-4">
                {[
                  {
                    step: 1,
                    icon: Building2,
                    title: 'Organisation Details',
                    desc: 'Register tenant domain, size, and primary administrator email.'
                  },
                  {
                    step: 2,
                    icon: CreditCard,
                    title: 'Remittance & Payment Proof',
                    desc: 'Transfer subscription fee and attach wire/ACH receipt.'
                  },
                  {
                    step: 3,
                    icon: KeyRound,
                    title: 'Verification & Activation',
                    desc: 'Platform Admin provisions your tenant and sends activation link.'
                  }
                ].map((item) => {
                  const Icon = item.icon;
                  const active = currentStep === item.step;
                  const complete = currentStep > item.step;
                  return (
                    <div
                      key={item.step}
                      className={`flex items-start gap-3 rounded-xl border p-3.5 transition ${
                        active
                          ? 'border-brand-300 bg-white shadow-xs'
                          : complete
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : 'border-slate-200/70 bg-white/50'
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          complete
                            ? 'bg-emerald-600 text-white'
                            : active
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          {item.step}. {item.title}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Right Side: Execution Forms */}
        <div className="lg:col-span-8">
          {mode === 'TRIAL' ? (
            /* TRIAL FLOW */
            trialResult ? (
              <Card
                title="15-Day Free Trial Activated"
                subtitle="Your organisation tenant is active and configured."
              >
                <div className="space-y-6">
                  <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
                    <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-600" />
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        Welcome, {trialResult.user?.name || trialResult.subscription?.adminName}!
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Organisation <strong>{trialResult.subscription?.organisationName}</strong> is now live on the 15-day evaluation period.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-5 sm:grid-cols-3">
                    <div>
                      <span className="text-xs text-slate-500">Trial Started:</span>
                      <p className="mt-1 font-semibold text-slate-900">
                        {new Date(trialResult.trial?.startsAt || Date.now()).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Trial Expiry:</span>
                      <p className="mt-1 font-semibold text-slate-900">
                        {new Date(trialResult.trial?.expiresAt || Date.now()).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Days Remaining:</span>
                      <p className="mt-1 font-bold text-emerald-700">
                        {trialResult.trial?.daysRemaining ?? 15} Days
                      </p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      size="lg"
                      className="w-full"
                      onClick={() => navigate('/org/dashboard')}
                    >
                      <span>Enter Organisation Workspace</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card
                title="Start Your 15-Day Free Trial"
                subtitle="Enter your organisation details and administrator credentials to activate immediately."
              >
                <form onSubmit={handleActivateTrial} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <InputField
                      label="Organisation Name"
                      required
                      value={trialForm.organisationName}
                      onChange={(e) => setTrialForm({ ...trialForm, organisationName: e.target.value })}
                      placeholder="Acme Technologies Corp"
                    />
                    <InputField
                      label="Organisation Domain"
                      required
                      value={trialForm.organisationDomain}
                      onChange={(e) => setTrialForm({ ...trialForm, organisationDomain: e.target.value })}
                      placeholder="acmetech.io"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <InputField
                      label="Industry"
                      required
                      value={trialForm.industry}
                      onChange={(e) => setTrialForm({ ...trialForm, industry: e.target.value })}
                    />
                    <SelectField
                      label="Company Size"
                      value={trialForm.companySize}
                      onChange={(e) => setTrialForm({ ...trialForm, companySize: e.target.value })}
                      options={[
                        { value: '1-10', label: '1-10 Employees' },
                        { value: '11-50', label: '11-50 Employees' },
                        { value: '51-200', label: '51-200 Employees' },
                        { value: '201-500', label: '201-500 Employees' },
                        { value: '500+', label: '500+ Enterprise' }
                      ]}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <InputField
                      label="Organisation Admin Full Name"
                      required
                      value={trialForm.adminName}
                      onChange={(e) => setTrialForm({ ...trialForm, adminName: e.target.value })}
                      placeholder="Elena Vance"
                    />
                    <InputField
                      label="Registered Admin Email"
                      type="email"
                      required
                      value={trialForm.adminEmail}
                      onChange={(e) => setTrialForm({ ...trialForm, adminEmail: e.target.value })}
                      placeholder="elena@acmetech.io"
                    />
                  </div>

                  <InputField
                    label="Initial Administrator Password"
                    type="password"
                    required
                    value={trialForm.password}
                    onChange={(e) => setTrialForm({ ...trialForm, password: e.target.value })}
                    placeholder="Min 8 characters"
                  />

                  <Button type="submit" loading={submitting} icon={Clock} className="w-full">
                    Activate 15-Day Free Trial Now
                  </Button>
                </form>
              </Card>
            )
          ) : (
            /* PAID PLAN FLOW */
            !subscription ? (
              <Card
                title={`Step 1: Subscribe to ${currentPlan.name} Tier`}
                subtitle="Administrator email will receive the passwordless activation invitation once payment is verified."
              >
                <form onSubmit={handleCreateSubscription} className="space-y-4">
                  {/* Plan & Cycle Confirmation */}
                  <div className="grid gap-4 sm:grid-cols-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Selected Plan</label>
                      <select
                        value={selectedPlanKey}
                        onChange={(e) => setSelectedPlanKey(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-brand-500 focus:outline-none"
                      >
                        <option value="BASIC">Basic (₹999/mo / ₹9,999/yr)</option>
                        <option value="ADVANCED">Advanced (₹1,999/mo / ₹19,999/yr)</option>
                        <option value="ENTERPRISE">Enterprise (₹4,999/mo / ₹49,999/yr)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Billing Cycle</label>
                      <select
                        value={billingCycle}
                        onChange={(e) => setBillingCycle(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-brand-500 focus:outline-none"
                      >
                        <option value="ANNUAL">Annual (Save 17%)</option>
                        <option value="MONTHLY">Monthly</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-xs text-slate-600">Calculated Remittance Total:</span>
                      <span className="text-base font-bold text-slate-900">
                        ₹{calculatedPrice.toLocaleString('en-IN')} INR ({billingCycle === 'ANNUAL' ? '12 Months' : '1 Month'})
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <InputField
                      label="Organisation Name"
                      required
                      value={orgForm.organisationName}
                      onChange={(e) => setOrgForm({ ...orgForm, organisationName: e.target.value })}
                      placeholder="Acme Robotics Corp"
                    />
                    <InputField
                      label="Organisation Domain"
                      required
                      value={orgForm.organisationDomain}
                      onChange={(e) => setOrgForm({ ...orgForm, organisationDomain: e.target.value })}
                      placeholder="acmerobotics.io"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <InputField
                      label="Industry"
                      required
                      value={orgForm.industry}
                      onChange={(e) => setOrgForm({ ...orgForm, industry: e.target.value })}
                    />
                    <SelectField
                      label="Company Size"
                      value={orgForm.companySize}
                      onChange={(e) => setOrgForm({ ...orgForm, companySize: e.target.value })}
                      options={[
                        { value: '1-50', label: '1-50 Employees' },
                        { value: '51-200', label: '51-200 Employees' },
                        { value: '201-500', label: '201-500 Employees' },
                        { value: '500+', label: '500+ Enterprise' }
                      ]}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <InputField
                      label="Organisation Admin Name"
                      required
                      value={orgForm.adminName}
                      onChange={(e) => setOrgForm({ ...orgForm, adminName: e.target.value })}
                      placeholder="Elena Vance"
                    />
                    <InputField
                      label="Registered Admin Email"
                      type="email"
                      required
                      value={orgForm.adminEmail}
                      onChange={(e) => setOrgForm({ ...orgForm, adminEmail: e.target.value })}
                      placeholder="elena@acmerobotics.io"
                    />
                  </div>

                  <Button type="submit" loading={submitting} icon={Building2} className="w-full">
                    Create Subscription Request & Get Payment Instructions
                  </Button>
                </form>
              </Card>
            ) : (
              <div className="space-y-6">
                {(() => {
                  const isInstructionsAvailable =
                    subscription.paymentInstructions?.isAvailable !== false &&
                    Boolean(subscription.paymentInstructions?.bankName);

                  return (
                    <>
                      <Card
                        title={`Subscription #${subscription.id.slice(0, 8).toUpperCase()}`}
                        subtitle={`${subscription.organisationName} (${subscription.adminEmail})`}
                        actions={
                          <div className="flex items-center gap-2">
                            <Badge status={subscription.status} />
                            <Button variant="secondary" size="sm" onClick={handleRefreshStatus}>
                              Refresh Status
                            </Button>
                          </div>
                        }
                      >
                        <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 text-sm">
                          <p className="font-semibold text-slate-900">Payment Remittance Instructions</p>
                          {!isInstructionsAvailable ? (
                            <div className="mt-3 space-y-3">
                              <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                                <p>
                                  <strong>Plan:</strong> {subscription.paymentInstructions?.planName || currentPlan.name}
                                </p>
                                <p>
                                  <strong>Amount Due:</strong> {subscription.paymentInstructions?.amountFormatted}
                                </p>
                                <p className="sm:col-span-2">
                                  <strong>Payment Memo:</strong>{' '}
                                  <span className="rounded bg-white px-2 py-0.5 font-mono font-semibold text-brand-700">
                                    {subscription.paymentInstructions?.paymentMemo}
                                  </span>
                                </p>
                              </div>
                              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                <div>
                                  <p className="font-semibold text-amber-900">Remittance Notice</p>
                                  <p className="mt-0.5 text-amber-800">
                                    Payment instructions are temporarily unavailable. Please contact the platform administrator.
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                              <p>
                                <strong>Plan:</strong> {subscription.paymentInstructions?.planName || currentPlan.name}
                              </p>
                              <p>
                                <strong>Amount Due:</strong> {subscription.paymentInstructions?.amountFormatted}
                              </p>
                              <p>
                                <strong>Bank:</strong> {subscription.paymentInstructions?.bankName}
                              </p>
                              <p>
                                <strong>Account Name:</strong> {subscription.paymentInstructions?.accountName}
                              </p>
                              {subscription.paymentInstructions?.accountNumberMasked && (
                                <p>
                                  <strong>Account Number:</strong> {subscription.paymentInstructions?.accountNumberMasked}
                                </p>
                              )}
                              {subscription.paymentInstructions?.ifscCode && (
                                <p>
                                  <strong>IFSC Code:</strong> {subscription.paymentInstructions?.ifscCode}
                                </p>
                              )}
                              {subscription.paymentInstructions?.upiId && (
                                <p>
                                  <strong>UPI ID:</strong> {subscription.paymentInstructions?.upiId}
                                </p>
                              )}
                              {subscription.paymentInstructions?.swiftCode && (
                                <p>
                                  <strong>SWIFT / BIC:</strong> {subscription.paymentInstructions?.swiftCode}
                                </p>
                              )}
                              <p className="sm:col-span-2">
                                <strong>Payment Memo:</strong>{' '}
                                <span className="rounded bg-white px-2 py-0.5 font-mono font-semibold text-brand-700">
                                  {subscription.paymentInstructions?.paymentMemo}
                                </span>
                              </p>
                            </div>
                          )}
                        </div>
                      </Card>

                      {['PENDING_PAYMENT', 'REJECTED'].includes(subscription.status) && (
                        !isInstructionsAvailable ? (
                          <Card
                            title="Step 2: Submit Payment Reference & Proof"
                            subtitle="Platform Admin verifies payment before provisioning your tenant."
                          >
                            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 text-center">
                              <AlertCircle className="mx-auto h-8 w-8 text-amber-600" />
                              <h4 className="mt-2 text-sm font-semibold text-slate-900">
                                Payment Proof Submission Unavailable
                              </h4>
                              <p className="mx-auto mt-1 max-w-md text-xs text-slate-600">
                                Payment instructions are temporarily unavailable. Please contact the platform administrator to obtain official treasury remittance details before submitting payment proof.
                              </p>
                            </div>
                          </Card>
                        ) : (
                          <Card
                            title="Step 2: Submit Payment Reference & Proof"
                            subtitle="Platform Admin verifies payment before provisioning your tenant."
                          >
                            {subscription.rejectedReason && (
                              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                                Previous verification note: {subscription.rejectedReason}
                              </div>
                            )}
                            <form onSubmit={handlePaymentSubmit} className="space-y-4">
                              <div className="grid gap-4 sm:grid-cols-2">
                                <InputField
                                  label="Transaction / Payment Reference (UTR / IMPS / NEFT Ref)"
                                  required
                                  value={paymentForm.paymentReference}
                                  onChange={(e) =>
                                    setPaymentForm({ ...paymentForm, paymentReference: e.target.value })
                                  }
                                  placeholder="UTR-2026-88341"
                                />
                                <SelectField
                                  label="Payment Method"
                                  value={paymentForm.paymentMethod}
                                  onChange={(e) =>
                                    setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })
                                  }
                                  options={[
                                    { value: 'WIRE_TRANSFER', label: 'UPI / IMPS / NEFT Transfer' },
                                    { value: 'ACH', label: 'Bank Wire / RTGS Remittance' },
                                    { value: 'CORPORATE_INVOICE', label: 'Corporate Invoice Settlement' }
                                  ]}
                                />
                              </div>
                              <FileUpload
                                label="Payment Proof Receipt (PDF/PNG/JPG)"
                                file={proofFile}
                                onFileSelect={setProofFile}
                              />
                              <TextAreaField
                                label="Remittance Notes"
                                rows={2}
                                value={paymentForm.notes}
                                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                              />
                              <Button type="submit" loading={submitting} icon={CreditCard} className="w-full">
                                Submit Payment Proof for Verification
                              </Button>
                            </form>
                          </Card>
                        )
                      )}
                    </>
                  );
                })()}

                {subscription.status === 'PENDING_VERIFICATION' && (
                  <Card>
                    <div className="flex items-center gap-4">
                      <Clock className="h-9 w-9 shrink-0 text-brand-600" />
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">
                          Awaiting Platform Admin Verification
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-600">
                          Once Platform Admin verifies your payment reference, an account activation email will be sent to{' '}
                          <strong>{subscription.adminEmail}</strong>.
                        </p>
                      </div>
                    </div>
                  </Card>
                )}

                {['APPROVED', 'ACTIVE'].includes(subscription.status) && (
                  <Card>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" />
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">
                            Subscription {subscription.status}
                          </h3>
                          <p className="text-xs text-slate-600">
                            {subscription.status === 'APPROVED'
                              ? 'Check your email or use your activation token to set your Organisation Admin password.'
                              : 'Your organisation is active and ready to sign in.'}
                          </p>
                        </div>
                      </div>
                      <Link to={subscription.status === 'APPROVED' ? '/activate-account' : '/login'}>
                        <Button>
                          {subscription.status === 'APPROVED' ? 'Activate Account' : 'Sign In'}
                        </Button>
                      </Link>
                    </div>
                  </Card>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </PageTransition>
  );
}
