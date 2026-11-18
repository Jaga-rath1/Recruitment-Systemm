import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { InputField } from '../../components/common/FormField';
import { authApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();

  const [token, setToken] = useState(searchParams.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loginPath, setLoginPath] = useState(searchParams.get('portal') === 'org' ? '/org-login' : '/login');
  const [resetEmail, setResetEmail] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addToast({ title: 'Password mismatch', message: 'New password and confirmation do not match.', variant: 'error' });
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.resetCandidatePassword({
        token: token.trim(),
        newPassword,
        confirmPassword
      });
      const targetLoginPath = res?.data?.loginPath || loginPath;
      setLoginPath(targetLoginPath);
      if (res?.data?.email) {
        setResetEmail(res.data.email);
      }
      setCompleted(true);
      addToast({
        title: 'Password updated',
        message: res?.message || 'Your password has been updated. Sign in with your new password.',
        variant: 'success'
      });
    } catch (err) {
      addToast({ title: 'Password reset failed', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition className="w-full px-4 py-12 sm:px-6 sm:py-16 lg:px-10 xl:px-12">
      <div className="mx-auto max-w-lg">
        <Card
          title={loginPath === '/org-login' ? 'Set New Organisation Admin Password' : 'Choose New Account Password'}
          subtitle="Passwords require 8+ characters including uppercase, lowercase, numeric, and special characters."
        >
          {completed ? (
            <div className="space-y-4 py-3 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="text-sm text-slate-700">
                Your password has been updated successfully. You can now sign in with your new credentials.
              </p>
              <Button
                className="w-full"
                onClick={() => navigate(loginPath, resetEmail ? { state: { email: resetEmail } } : undefined)}
              >
                {loginPath === '/org-login' ? 'Sign In to Organisation Admin Portal' : 'Sign In With New Password'}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <InputField
                label="Reset Token"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your one-time recovery token"
              />
              <InputField
                label="New Password"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="StrongPass#2026"
              />
              <InputField
                label="Confirm New Password"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
              />
              <Button type="submit" loading={loading} className="w-full">
                Reset Password
              </Button>
              <div className="text-center text-xs text-slate-500">
                <Link to="/forgot-password" className="font-semibold text-brand-600 hover:underline">
                  Request a new reset link
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </PageTransition>
  );
}

