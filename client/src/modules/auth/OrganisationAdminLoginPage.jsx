import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Building2, AlertCircle, CheckCircle2 } from 'lucide-react';
import AuthCardWrapper from './AuthCardWrapper';
import Button from '../../components/common/Button';
import { InputField } from '../../components/common/FormField';
import { authApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function OrganisationAdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, setSession } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [justActivated, setJustActivated] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });

  useEffect(() => {
    if (isAuthenticated && user) {
      if (user.userType === 'ORG_USER') {
        navigate('/app', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    const stateEmail = location.state?.email || new URLSearchParams(location.search).get('email');
    if (stateEmail) {
      setForm((prev) => ({ ...prev, email: stateEmail }));
    }
    if (location.state?.justActivated || new URLSearchParams(location.search).get('activated') === 'true') {
      setJustActivated(true);
    }
  }, [location]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await authApi.orgAdminLogin(form);
      const token = res?.data?.token || res?.token;
      const rawUser = res?.data?.user || res?.user;

      if (!token || !rawUser) {
        throw new Error('Authentication response is missing token or user profile.');
      }

      await setSession(token, rawUser);
      addToast({ title: 'Welcome Admin', message: `Signed in as ${rawUser.email}`, variant: 'success' });
      navigate('/app', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Organisation Admin sign in failed';
      setErrorMessage(msg);
      addToast({ title: 'Sign In Failed', message: msg, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCardWrapper
      badgeText="Organisation Admin Workspace"
      badgeColor="purple"
      title="Organisation Admin Sign In"
      subtitle="Dedicated portal for Organisation Administrators managing team access, jobs, and recruitment workflows."
      icon={Building2}
      footer={
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Need a different portal?</p>
          <div className="flex items-center justify-center gap-4 text-xs font-semibold">
            <Link to="/recruiter-login" className="text-purple-600 hover:text-purple-700 hover:underline">
              Recruiter Login &rarr;
            </Link>
            <span className="text-slate-300">|</span>
            <Link to="/login" className="text-purple-600 hover:text-purple-700 hover:underline">
              Candidate Portal &rarr;
            </Link>
          </div>
        </div>
      }
    >
      {justActivated && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 flex items-start gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-950">Password Set Successfully!</p>
            <p className="mt-0.5 text-emerald-800">Your account is activated. Sign in with your new password below.</p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <InputField
          label="Organisation Admin Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="admin@yourcompany.com"
        />

        <InputField
          label="Password"
          type="password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="••••••••"
        />

        <div className="flex justify-end -mt-2">
          <Link
            to={form.email ? `/forgot-password?portal=org&email=${encodeURIComponent(form.email)}` : '/forgot-password?portal=org'}
            className="text-xs font-semibold text-purple-600 hover:text-purple-700 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="primary" className="w-full bg-purple-600 hover:bg-purple-700" loading={loading}>
          Sign In to Workspace
        </Button>
      </form>

      <div className="mt-4 pt-4 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-500">
          New paid customer?{' '}
          <Link to="/activate-account" className="text-purple-600 hover:underline font-semibold">
            Activate Subscription Account
          </Link>
        </p>
      </div>
    </AuthCardWrapper>
  );
}
