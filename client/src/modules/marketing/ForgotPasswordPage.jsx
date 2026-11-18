import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { InputField } from '../../components/common/FormField';
import { authApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const isOrgPortal = searchParams.get('portal') === 'org';
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const loginBackPath = isOrgPortal ? '/org-login' : '/login';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotCandidatePassword({ email: email.trim() });
      setSubmitted(true);
      addToast({
        title: 'Recovery request processed',
        message: 'If an active account exists for this email, password reset instructions have been sent.',
        variant: 'success'
      });
    } catch (err) {
      addToast({ title: 'Unable to send recovery email', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition className="w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-10 xl:px-12">
      <div className="mx-auto max-w-lg">
        <Card
          title={isOrgPortal ? 'Reset Organisation Admin Password' : 'Reset Account Password'}
          subtitle="Request a time-limited single-use recovery link for your Candidate or Organisation Admin account."
        >
          {submitted ? (
            <div className="space-y-4 py-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <KeyRound className="h-5 w-5" />
              </div>
              <p className="text-sm text-slate-700">
                If an active account exists for <strong>{email}</strong>, a password reset link has been sent to your inbox. Please check your email (and spam folder) and open the link to set a new password.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link to={isOrgPortal ? '/reset-password?portal=org' : '/reset-password'}>
                  <Button variant="secondary">I Have a Reset Token</Button>
                </Link>
                <Link to={loginBackPath}>
                  <Button>Back to Sign In</Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <InputField
                label={isOrgPortal ? 'Organisation Admin Email Address' : 'Account Email Address'}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isOrgPortal ? 'admin@yourcompany.com' : 'jordan@example.com'}
              />
              <p className="text-xs text-slate-500">
                Works for both verified Candidate accounts and active Organisation Admin accounts.
              </p>
              <Button type="submit" loading={loading} className="w-full">
                Send Reset Instructions
              </Button>
              <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
                <Link to={isOrgPortal ? '/reset-password?portal=org' : '/reset-password'} className="font-semibold text-brand-600 hover:underline">
                  Already have a reset token?
                </Link>
                <Link to={loginBackPath} className="hover:text-slate-900">
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

