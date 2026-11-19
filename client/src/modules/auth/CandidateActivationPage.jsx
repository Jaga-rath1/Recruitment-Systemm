import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ShieldCheck, KeyRound, CheckCircle2, Mail, AlertCircle, ArrowRight, UserCheck } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { InputField } from '../../components/common/FormField';
import { authApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function CandidateActivationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const tokenParam = searchParams.get('token') || '';
  const [token, setToken] = useState(tokenParam);
  const [candidateInfo, setCandidateInfo] = useState(null);
  const [inspectError, setInspectError] = useState(null);
  const [inspecting, setInspecting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [activatedEmail, setActivatedEmail] = useState('');

  // Resend state for expired tokens
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    const raw = searchParams.get('token');
    if (raw) {
      setToken(raw);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!token) return;

    setInspecting(true);
    authApi
      .inspectCandidateActivation(token)
      .then((res) => {
        setCandidateInfo(res.data);
        setInspectError(null);
        if (res.data?.email) {
          setResendEmail(res.data.email);
        }
      })
      .catch((err) => {
        setInspectError(err.response?.data?.message || err.message || 'Invalid or expired activation link');
      })
      .finally(() => {
        setInspecting(false);
      });
  }, [token]);

  const validatePassword = (pwd) => {
    if (pwd.length < 8) return 'Password must be at least 8 characters long.';
    if (!/[a-z]/.test(pwd)) return 'Password must include at least one lowercase letter.';
    if (!/[A-Z]/.test(pwd)) return 'Password must include at least one uppercase letter.';
    if (!/[0-9]/.test(pwd)) return 'Password must include at least one number.';
    if (!/[^A-Za-z0-9]/.test(pwd)) return 'Password must include at least one special character.';
    return null;
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    if (!token) {
      return addToast({
        title: 'Missing Token',
        message: 'Please provide a valid activation token from your invitation email.',
        variant: 'error'
      });
    }

    const pwdError = validatePassword(password);
    if (pwdError) {
      return addToast({
        title: 'Weak Password',
        message: pwdError,
        variant: 'error'
      });
    }

    if (password !== confirmPassword) {
      return addToast({
        title: 'Password Mismatch',
        message: 'Password confirmation does not match.',
        variant: 'error'
      });
    }

    setLoading(true);
    try {
      const res = await authApi.activateCandidate({
        token: token.trim(),
        password,
        confirmPassword
      });

      const email = res.data?.email || candidateInfo?.email || '';
      setActivatedEmail(email);
      setCompleted(true);
      addToast({
        title: 'Account Activated',
        message: 'Your candidate account has been activated! Sign in with your new credentials.',
        variant: 'success'
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Activation failed';
      addToast({ title: 'Activation Failed', message: msg, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleResendActivation = async (e) => {
    e.preventDefault();
    if (!resendEmail) return;
    setResendLoading(true);
    try {
      await authApi.resendCandidateActivation({ email: resendEmail.trim() });
      setResendSent(true);
      addToast({
        title: 'Activation Sent',
        message: 'If an unactivated candidate account exists, a new activation email has been sent.',
        variant: 'success'
      });
    } catch (err) {
      addToast({ title: 'Request Failed', message: err.message, variant: 'error' });
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <PageTransition className="w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-10 xl:px-12">
      <div className="mx-auto max-w-lg">
        <Card
          title="Activate Candidate Portal Account"
          subtitle="Set your password to track applications, schedule interviews, and review offer letters."
        >
          {completed ? (
            <div className="space-y-5 py-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-slate-900">Account Ready</h3>
                <p className="text-sm text-slate-600">
                  Your password has been configured and your candidate account is active.
                </p>
                {activatedEmail && (
                  <p className="text-xs font-mono text-slate-500 bg-slate-100 py-1 px-2 rounded inline-block mt-2">
                    {activatedEmail}
                  </p>
                )}
              </div>
              <Button
                className="w-full"
                onClick={() => navigate('/login', activatedEmail ? { state: { email: activatedEmail } } : undefined)}
              >
                Sign In to Candidate Portal
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : inspectError ? (
            <div className="space-y-5 py-3">
              <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-600" />
                <div className="text-sm">
                  <p className="font-medium">Activation Link Issue</p>
                  <p className="mt-1 text-rose-700">{inspectError}</p>
                </div>
              </div>

              {resendSent ? (
                <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200 text-center">
                  <p className="font-medium">New activation email requested</p>
                  <p className="mt-1 text-xs text-emerald-700">Please check your inbox for the refreshed link.</p>
                </div>
              ) : (
                <form onSubmit={handleResendActivation} className="space-y-3">
                  <p className="text-xs text-slate-600">
                    If your activation link expired, enter your email below to receive a new one:
                  </p>
                  <InputField
                    label="Registered Email"
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="candidate@example.com"
                    required
                  />
                  <Button type="submit" variant="secondary" className="w-full" loading={resendLoading}>
                    <Mail className="mr-2 h-4 w-4" />
                    Resend Activation Link
                  </Button>
                </form>
              )}

              <div className="text-center pt-2">
                <Link to="/login" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  Return to Candidate Login
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleActivate} className="space-y-4">
              {candidateInfo && (
                <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3.5 text-xs text-brand-900 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold">{candidateInfo.fullName || 'Candidate'}</p>
                    <p className="text-slate-600 font-mono">{candidateInfo.email}</p>
                  </div>
                </div>
              )}

              {!tokenParam && (
                <InputField
                  label="Activation Token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste single-use token from email"
                  required
                />
              )}

              <InputField
                label="Create Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                helper="Minimum 8 characters with uppercase, lowercase, number, and special character."
              />

              <InputField
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />

              <Button type="submit" className="w-full" loading={loading || inspecting}>
                <KeyRound className="mr-2 h-4 w-4" />
                Set Password & Activate
              </Button>

              <div className="text-center pt-2">
                <Link to="/login" className="text-xs text-slate-500 hover:text-brand-600">
                  Already activated? Sign In
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </PageTransition>
  );
}
