import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { InputField } from '../../components/common/FormField';
import { authApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function CandidateVerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();

  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setVerifying(true);
    try {
      await authApi.verifyCandidateEmail({ email: email.trim(), otp: otp.trim() });
      setVerified(true);
      addToast({
        title: 'Email verified',
        message: 'Your Candidate Portal account is now active. Please sign in.',
        variant: 'success'
      });
    } catch (err) {
      addToast({ title: 'Verification failed', message: err.message, variant: 'error' });
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim()) {
      addToast({ title: 'Email required', message: 'Enter your registered email address first.', variant: 'error' });
      return;
    }
    setResending(true);
    try {
      const res = await authApi.resendCandidateVerification({ email: email.trim() });
      setCooldown(Number(res.data?.cooldownSeconds || 60));
      addToast({
        title: 'Verification code dispatched',
        message: res.message || 'Check your inbox for a fresh 6-digit verification code.',
        variant: 'success'
      });
    } catch (err) {
      addToast({ title: 'Resend failed', message: err.message, variant: 'error' });
    } finally {
      setResending(false);
    }
  };

  return (
    <PageTransition className="w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-10 xl:px-12">
      <div className="mx-auto max-w-lg">
        <Card
          title="Verify Candidate Email"
          subtitle="Enter the 6-digit verification code sent to your inbox. Codes expire after 10 minutes."
        >
          {verified ? (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <MailCheck className="h-6 w-6" />
              </div>
              <p className="text-sm text-slate-700">
                Email verification completed for <strong>{email}</strong>. Sign in to access your Candidate Portal.
              </p>
              <Button className="w-full" onClick={() => navigate('/login')}>
                Continue to Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <InputField
                label="Candidate Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@example.com"
              />
              <InputField
                label="6-Digit Verification Code"
                required
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
              />
              <Button type="submit" loading={verifying} className="w-full">
                Verify Email
              </Button>
              <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
                <button
                  type="button"
                  disabled={resending || cooldown > 0}
                  onClick={handleResend}
                  className="font-semibold text-brand-600 hover:underline disabled:opacity-50"
                >
                  {cooldown > 0
                    ? `Resend code in ${cooldown}s`
                    : resending
                      ? 'Sending code...'
                      : 'Resend Verification Code'}
                </button>
                <Link to="/login" className="font-medium text-slate-600 hover:text-slate-900">
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </PageTransition>
  );
}

