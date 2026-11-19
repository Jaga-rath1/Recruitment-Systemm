import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Users, MailCheck, AlertCircle, ArrowRight } from 'lucide-react';
import AuthCardWrapper from './AuthCardWrapper';
import Tabs from '../../components/common/Tabs';
import Button from '../../components/common/Button';
import { InputField } from '../../components/common/FormField';
import { authApi } from '../../api';
import { useAuth, normalizeAuthUser } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function CandidateLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, setSession } = useAuth();
  const { addToast } = useToast();

  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ fullName: '', email: '', password: '' });
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const redirectByRole = (targetUser) => {
    const role = String(targetUser?.activeRoleCode || targetUser?.role || targetUser?.userType || '').toLowerCase();
    if (role === 'platform_admin' || role === 'super_admin' || role === 'superadmin') {
      navigate('/platform-admin', { replace: true });
    } else if (role === 'candidate') {
      navigate('/portal', { replace: true });
    } else {
      navigate('/app', { replace: true });
    }
  };

  useEffect(() => {
    if (isAuthenticated && user) {
      redirectByRole(user);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    const stateEmail = location.state?.email || new URLSearchParams(location.search).get('email');
    if (stateEmail) {
      setLoginForm((prev) => ({ ...prev, email: stateEmail }));
    }
  }, [location]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    try {
      const loginFn = authApi.candidateLogin || authApi.login;
      const res = await loginFn(loginForm);
      const token = res?.token || res?.data?.token || res?.data?.data?.token;
      const rawUser = res?.user || res?.data?.user || res?.data?.data?.user;

      if (!token || !rawUser) {
        throw new Error('Authentication response is missing required token or user profile.');
      }

      const activeUser = await setSession(token, rawUser);
      const targetUser = activeUser || normalizeAuthUser(rawUser);
      addToast({ title: 'Welcome', message: `Signed in as ${targetUser?.email || 'User'}`, variant: 'success' });
      redirectByRole(targetUser);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Candidate sign in failed';
      setErrorMessage(msg);
      addToast({ title: 'Sign in failed', message: msg, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await authApi.registerCandidate(registerForm);
      const email = res.data?.user?.email || registerForm.email.trim();
      setPendingVerificationEmail(email);
      setOtpInput('');
      setResendCooldown(Number(res.data?.resendCooldownSeconds || 60));
      addToast({
        title: 'Verification Code Sent',
        message: `A 6-digit code has been sent to ${email}.`,
        variant: 'success'
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Registration failed';
      setErrorMessage(msg);
      addToast({ title: 'Registration failed', message: msg, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    try {
      await authApi.verifyCandidateEmail({
        email: pendingVerificationEmail,
        otp: otpInput.trim()
      });
      addToast({ title: 'Email Verified', message: 'You may now sign in to your Candidate Portal.', variant: 'success' });
      setLoginForm((prev) => ({ ...prev, email: pendingVerificationEmail, password: '' }));
      setPendingVerificationEmail('');
      setTab('login');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Verification failed';
      setErrorMessage(msg);
      addToast({ title: 'Verification failed', message: msg, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingVerificationEmail || resendCooldown > 0) return;
    setLoading(true);
    try {
      const res = await authApi.resendCandidateVerification({ email: pendingVerificationEmail });
      setResendCooldown(Number(res.data?.cooldownSeconds || 60));
      addToast({ title: 'Code Resent', message: 'Fresh code sent to your inbox.', variant: 'success' });
    } catch (err) {
      addToast({ title: 'Resend failed', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCardWrapper
      badgeText="Candidate Portal"
      badgeColor="brand"
      title="Candidate Sign In"
      subtitle="Track job applications, schedule interviews, and accept digital offers."
      icon={Users}
      footer={
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Employer or Recruitment Team member?
          </p>
          <div className="flex items-center justify-center gap-4 text-xs font-semibold">
            <Link to="/org-login" className="text-brand-600 hover:text-brand-700 hover:underline">
              Organisation Admin Login &rarr;
            </Link>
            <span className="text-slate-300">|</span>
            <Link to="/recruiter-login" className="text-brand-600 hover:text-brand-700 hover:underline">
              Recruiter Login &rarr;
            </Link>
          </div>
        </div>
      }
    >
      <Tabs
        activeTab={tab}
        onChange={(newTab) => {
          setTab(newTab);
          setErrorMessage('');
        }}
        tabs={[
          { id: 'login', label: 'Sign In' },
          { id: 'candidate-signup', label: 'Candidate Sign Up' }
        ]}
      />

      {errorMessage && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{errorMessage}</p>
        </div>
      )}

      {pendingVerificationEmail ? (
        <form onSubmit={handleVerifyOtp} className="mt-4 space-y-4">
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs text-brand-900 flex items-start gap-2.5">
            <MailCheck className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Enter 6-Digit Verification Code</p>
              <p className="text-[11px] text-brand-800 mt-0.5">Sent to {pendingVerificationEmail}</p>
            </div>
          </div>

          <InputField
            label="Verification Code"
            type="text"
            required
            maxLength={6}
            value={otpInput}
            onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
          />

          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Verify Email &amp; Continue
          </Button>

          <div className="text-center">
            <button
              type="button"
              disabled={resendCooldown > 0 || loading}
              onClick={handleResendOtp}
              className="text-xs text-brand-600 hover:underline disabled:text-slate-400"
            >
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend verification code'}
            </button>
          </div>
        </form>
      ) : tab === 'login' ? (
        <form onSubmit={handleLogin} className="mt-4 space-y-4">
          <InputField
            label="Email Address"
            type="email"
            required
            value={loginForm.email}
            onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
            placeholder="candidate@example.com"
          />
          <InputField
            label="Password"
            type="password"
            required
            value={loginForm.password}
            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
            placeholder="••••••••"
          />

          <div className="flex items-center justify-between text-xs">
            <Link to="/forgot-password" className="text-brand-600 hover:text-brand-700 hover:underline">
              Forgot password?
            </Link>
            <Link to="/activate-candidate" className="text-slate-500 hover:text-brand-600 hover:underline">
              Activate account
            </Link>
          </div>

          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Sign In
          </Button>
        </form>
      ) : (
        <form onSubmit={handleRegister} className="mt-4 space-y-4">
          <InputField
            label="Full Name"
            type="text"
            required
            value={registerForm.fullName}
            onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })}
            placeholder="Jordan Blake"
          />
          <InputField
            label="Email Address"
            type="email"
            required
            value={registerForm.email}
            onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
            placeholder="jordan@example.com"
          />
          <InputField
            label="Password"
            type="password"
            required
            value={registerForm.password}
            onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
            placeholder="StrongPass#2026"
          />

          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Create Candidate Account
          </Button>
        </form>
      )}
    </AuthCardWrapper>
  );
}
