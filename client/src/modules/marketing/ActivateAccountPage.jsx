import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  Building2,
  Mail,
  Clock,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Lock
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { InputField } from '../../components/common/FormField';
import { subscriptionApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function ActivateAccountPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const { addToast } = useToast();

  const tokenParam = searchParams.get('token') || '';
  const [activationToken, setActivationToken] = useState(tokenParam);
  const [invitationInfo, setInvitationInfo] = useState(null);
  const [inspectError, setInspectError] = useState(null);
  const [inspecting, setInspecting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState(null);

  useEffect(() => {
    const raw = searchParams.get('token');
    const type = searchParams.get('type') || searchParams.get('portal');
    if (type === 'candidate') {
      navigate(`/activate-candidate?token=${encodeURIComponent(raw || '')}`, { replace: true });
      return;
    }
    if (raw) {
      setActivationToken(raw);
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    if (!activationToken) return;

    setInspecting(true);
    subscriptionApi
      .inspectActivationToken(activationToken)
      .then((res) => {
        setInvitationInfo(res.data);
        setInspectError(null);
      })
      .catch((err) => {
        setInspectError(err.message || 'Invalid or expired invitation link');
      })
      .finally(() => {
        setInspecting(false);
      });
  }, [activationToken]);

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
    if (!activationToken) {
      return addToast({
        title: 'Missing Invitation Token',
        message: 'Please provide a valid activation invitation link.',
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
      return addToast({ title: 'Password Mismatch', message: 'Passwords must match.', variant: 'error' });
    }

    setLoading(true);
    try {
      const res = await subscriptionApi.activateAccount({ activationToken, password });
      
      // Establish active session
      if (res.data?.token && res.data?.user) {
        await setSession(res.data.token, res.data.user);
      }

      // Securely clear raw token from browser address bar
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {
        // safe fallback
      }

      setActivationSuccess({
        user: res.data?.user,
        email: res.data?.user?.email || invitationInfo?.adminEmail || '',
        orgName: res.data?.user?.organisationName || invitationInfo?.organisationName || 'Your Organisation'
      });

      addToast({
        title: 'Password Set Successfully',
        message: 'Your administrator account has been activated!',
        variant: 'success'
      });
    } catch (err) {
      addToast({ title: 'Activation Failed', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Phase 2: Dedicated Activation Success Screen
  if (activationSuccess) {
    return (
      <PageTransition className="w-full px-4 py-16 sm:px-6 lg:px-10 max-w-3xl mx-auto">
        <Card>
          <div className="py-8 px-4 text-center space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                ACTIVATION COMPLETE
              </span>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Password Created Successfully!
              </h1>
              <p className="mt-2 text-sm text-slate-600 max-w-lg mx-auto">
                Your Organisation Admin credentials for <strong>{activationSuccess.orgName}</strong> are active.
                You can now log in to manage hiring pipelines, roles, and employees.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 max-w-md mx-auto text-left text-xs space-y-2">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Organisation:</span>
                <span className="font-semibold text-slate-900">{activationSuccess.orgName}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Administrator Email:</span>
                <span className="font-semibold text-slate-900">{activationSuccess.email}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 font-medium">Login Portal:</span>
                <span className="font-mono text-brand-700 font-semibold">{window.location.origin}/login</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
              <Button
                variant="primary"
                icon={ArrowRight}
                className="w-full sm:w-auto"
                onClick={() =>
                  navigate('/login', {
                    replace: true,
                    state: { email: activationSuccess.email, justActivated: true }
                  })
                }
              >
                Go to Organisation Admin Login
              </Button>
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => navigate('/app', { replace: true })}
              >
                Launch Dashboard Directly
              </Button>
            </div>
          </div>
        </Card>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-10 xl:px-12">
      <div className="grid w-full items-start gap-10 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <KeyRound className="h-3.5 w-3.5" />
              Secure Organisation Onboarding
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              Set Administrator Password
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Your payment has been verified and organisation provisioned. Define your password to access your dedicated recruitment workspace.
            </p>
          </div>

          {invitationInfo && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-sm text-emerald-900 space-y-2.5">
              <div className="flex items-center gap-2 font-semibold text-emerald-950">
                <Building2 className="h-4 w-4 text-emerald-600" />
                <span>{invitationInfo.organisationName}</span>
                <span className="ml-auto rounded-full bg-emerald-200/80 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  {invitationInfo.planName || 'Active Tier'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-800">
                <Mail className="h-3.5 w-3.5 text-emerald-600" />
                <span>Administrator Email: <strong>{invitationInfo.adminEmail}</strong></span>
              </div>
              {invitationInfo.expiresInHours !== undefined && (
                <div className="flex items-center gap-2 text-xs text-emerald-700">
                  <Clock className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Invitation expires in ~{invitationInfo.expiresInHours} hours</span>
                </div>
              )}
            </div>
          )}

          {inspectError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-900 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Invitation Verification Notice</p>
                <p className="mt-1 text-xs text-amber-800">{inspectError}</p>
                <p className="mt-2 text-[11px] text-amber-700">
                  If this link has expired, please request your Platform Administrator to resend an activation invitation from the Verification Queue.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-6 text-xs text-slate-700">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <span>Zero plaintext passwords or raw credentials are ever transmitted over email.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <span>Activation instantly launches your Organisation Admin session with tenant isolation.</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <Card
            title="Create Administrator Password"
            subtitle={
              invitationInfo
                ? `Account for ${invitationInfo.adminEmail}`
                : 'Define a strong password to complete account activation.'
            }
          >
            <form onSubmit={handleActivate} className="space-y-4">
              {!activationToken && (
                <div className="space-y-2">
                  <InputField
                    label="Activation Token"
                    required
                    value={activationToken}
                    onChange={(e) => setActivationToken(e.target.value.trim())}
                    placeholder="Paste the invitation token from your email"
                  />
                  <p className="text-xs text-slate-500">
                    Check your inbox for the email titled "Activate Your NEXNUV Recruitment Workspace".
                  </p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  label="Set New Password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                />
                <InputField
                  label="Confirm Password"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                />
              </div>

              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                <p className="font-medium text-slate-700">Password Requirements:</p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-500">
                  <li className={password.length >= 8 ? 'text-emerald-600 font-medium' : ''}>At least 8 characters</li>
                  <li className={/[a-z]/.test(password) && /[A-Z]/.test(password) ? 'text-emerald-600 font-medium' : ''}>Uppercase & lowercase letters</li>
                  <li className={/[0-9]/.test(password) ? 'text-emerald-600 font-medium' : ''}>At least one numeric digit</li>
                  <li className={/[^A-Za-z0-9]/.test(password) ? 'text-emerald-600 font-medium' : ''}>At least one special character</li>
                </ul>
              </div>

              <Button type="submit" loading={loading} className="w-full">
                Activate Account & Set Password
              </Button>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
              <p>
                Already set your password?{' '}
                <Link to="/login" className="font-semibold text-brand-600 hover:underline">
                  Sign in to Organisation Workspace
                </Link>
              </p>
            </div>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
