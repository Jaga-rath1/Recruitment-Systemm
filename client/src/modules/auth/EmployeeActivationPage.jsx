import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, CheckCircle2, AlertCircle, ArrowRight, Lock, Building2 } from 'lucide-react';
import AuthCardWrapper from './AuthCardWrapper';
import Button from '../../components/common/Button';
import { InputField } from '../../components/common/FormField';
import { organisationApi } from '../../api';
import { useToast } from '../../context/ToastContext';

export default function EmployeeActivationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activatedSuccess, setActivatedSuccess] = useState(false);
  const [targetLoginUrl, setTargetLoginUrl] = useState('/recruiter-login');

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const rawToken = searchParams.get('token') || '';
    setToken(rawToken);

    if (!rawToken) {
      setErrorMessage('Missing invitation activation token. Please use the activation link provided in your onboarding email.');
      setLoading(false);
      return;
    }

    organisationApi
      .inspectEmployeeActivation(rawToken)
      .then((res) => {
        const data = res?.data?.data || res?.data || res;
        setPreview(data);
        if (data.loginUrl) {
          try {
            const parsedUrl = new URL(data.loginUrl, window.location.origin);
            setTargetLoginUrl(parsedUrl.pathname);
          } catch {
            setTargetLoginUrl(data.loginUrl);
          }
        }
      })
      .catch((err) => {
        const msg = err.response?.data?.message || err.message || 'Invitation is invalid or has expired.';
        setErrorMessage(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      addToast({ title: 'Validation Error', message: 'Password must be at least 8 characters long.', variant: 'error' });
      return;
    }
    if (password !== confirmPassword) {
      addToast({ title: 'Validation Error', message: 'Password confirmation does not match.', variant: 'error' });
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      const res = await organisationApi.activateEmployee({
        token,
        password
      });
      const data = res?.data?.data || res?.data || res;
      setActivatedSuccess(true);
      if (data.loginUrl) {
        try {
          const parsed = new URL(data.loginUrl, window.location.origin);
          setTargetLoginUrl(parsed.pathname);
        } catch {
          setTargetLoginUrl(data.loginUrl);
        }
      }
      addToast({ title: 'Account Activated', message: 'Your password has been set. You may now log in.', variant: 'success' });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Activation failed.';
      setErrorMessage(msg);
      addToast({ title: 'Activation Failed', message: msg, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthCardWrapper
        badgeText="Employee Onboarding"
        badgeColor="brand"
        title="Verifying Invitation..."
        icon={ShieldCheck}
      >
        <div className="py-12 text-center text-sm text-slate-500">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-brand-600 border-r-transparent mb-4" />
          <p>Validating your single-use invitation token...</p>
        </div>
      </AuthCardWrapper>
    );
  }

  if (activatedSuccess) {
    return (
      <AuthCardWrapper
        badgeText="Account Activated"
        badgeColor="emerald"
        title="Setup Complete!"
        subtitle="Your password has been successfully configured."
        icon={CheckCircle2}
      >
        <div className="space-y-5 text-center">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
            <p className="font-semibold text-emerald-900 text-sm">Welcome to the Team!</p>
            <p className="mt-1 text-emerald-800">
              Your internal recruitment credentials are active. Sign in to access your recruitment pipeline and interview tools.
            </p>
          </div>

          <Button
            type="button"
            variant="primary"
            className="w-full"
            onClick={() => navigate(targetLoginUrl, { state: { email: preview?.email, justActivated: true } })}
          >
            Proceed to Sign In &rarr;
          </Button>
        </div>
      </AuthCardWrapper>
    );
  }

  return (
    <AuthCardWrapper
      badgeText="Employee Activation"
      badgeColor="brand"
      title="Activate Your Account"
      subtitle={preview?.organisationName ? `Join ${preview.organisationName} on NEXNUV Recruitment` : 'Set your secure account password'}
      icon={Lock}
      footer={
        <p className="text-xs text-slate-500">
          Already activated?{' '}
          <Link to="/recruiter-login" className="text-brand-600 hover:underline font-semibold">
            Sign In Here
          </Link>
        </p>
      }
    >
      {errorMessage && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{errorMessage}</p>
        </div>
      )}

      {preview && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Organisation:</span>
            <span className="font-bold text-slate-900">{preview.organisationName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Name:</span>
            <span className="font-semibold text-slate-900">{preview.employeeName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Assigned Role:</span>
            <span className="font-semibold text-brand-600">{preview.roleName || preview.roleCode}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Registered Email:</span>
            <span className="text-slate-900">{preview.email}</span>
          </div>
          {preview.expiresInHours !== undefined && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
              <span className="text-amber-700 font-medium">Invitation Expiry:</span>
              <span className="text-amber-800 font-semibold">{preview.expiresInHours}h remaining</span>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="Create New Password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        <InputField
          label="Confirm Password"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
        />

        <p className="text-[11px] text-slate-500 leading-normal">
          Password must be at least 8 characters long and contain uppercase, lowercase, numbers, and special symbols.
        </p>

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          loading={submitting}
          disabled={!preview || !!errorMessage}
        >
          Set Password &amp; Activate Account
        </Button>
      </form>
    </AuthCardWrapper>
  );
}
