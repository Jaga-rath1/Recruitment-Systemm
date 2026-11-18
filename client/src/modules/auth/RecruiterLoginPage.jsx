import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { UserCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import AuthCardWrapper from './AuthCardWrapper';
import Button from '../../components/common/Button';
import { InputField } from '../../components/common/FormField';
import { authApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function RecruiterLoginPage() {
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
      const res = await authApi.recruiterLogin(form);
      const token = res?.data?.token || res?.token;
      const rawUser = res?.data?.user || res?.user;

      if (!token || !rawUser) {
        throw new Error('Authentication response is missing token or user profile.');
      }

      await setSession(token, rawUser);
      addToast({ title: 'Welcome', message: `Signed in as ${rawUser.email}`, variant: 'success' });
      navigate('/app', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Recruiter sign in failed';
      setErrorMessage(msg);
      addToast({ title: 'Sign In Failed', message: msg, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCardWrapper
      badgeText="Hiring Team Portal"
      badgeColor="emerald"
      title="Recruiter &amp; Interviewer Login"
      subtitle="Sign in to evaluate candidates, schedule interviews, and manage hiring pipelines."
      icon={UserCheck}
      footer={
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Need another portal?</p>
          <div className="flex items-center justify-center gap-4 text-xs font-semibold">
            <Link to="/org-login" className="text-emerald-600 hover:text-emerald-700 hover:underline">
              Organisation Admin &rarr;
            </Link>
            <span className="text-slate-300">|</span>
            <Link to="/login" className="text-emerald-600 hover:text-emerald-700 hover:underline">
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
            <p className="font-semibold text-emerald-950">Account Activated Successfully!</p>
            <p className="mt-0.5 text-emerald-800">Your recruiter password has been created. Sign in below.</p>
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
          label="Registered Work Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="recruiter@company.com"
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
            to={form.email ? `/forgot-password?portal=recruiter&email=${encodeURIComponent(form.email)}` : '/forgot-password?portal=recruiter'}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" variant="primary" className="w-full bg-emerald-600 hover:bg-emerald-700" loading={loading}>
          Sign In to Hiring Portal
        </Button>
      </form>

      <div className="mt-4 pt-4 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-500">
          Received an invitation email?{' '}
          <Link to="/activate-employee" className="text-emerald-600 hover:underline font-semibold">
            Activate Employee Account
          </Link>
        </p>
      </div>
    </AuthCardWrapper>
  );
}
