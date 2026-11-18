import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, AlertCircle, Lock } from 'lucide-react';
import AuthCardWrapper from './AuthCardWrapper';
import Button from '../../components/common/Button';
import { InputField } from '../../components/common/FormField';
import { authApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function PlatformAdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, setSession } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [form, setForm] = useState({ email: '', password: '' });

  useEffect(() => {
    if (isAuthenticated && user) {
      const isPlatformAdmin =
        user.userType === 'PLATFORM_ADMIN' ||
        (Array.isArray(user.roles) && (user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('SUPER_ADMIN')));
      if (isPlatformAdmin) {
        navigate('/platform-admin', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    const stateEmail = location.state?.email || new URLSearchParams(location.search).get('email');
    if (stateEmail) {
      setForm((prev) => ({ ...prev, email: stateEmail }));
    }
  }, [location]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await authApi.platformAdminLogin(form);
      const token = res?.data?.token || res?.token;
      const rawUser = res?.data?.user || res?.user;

      if (!token || !rawUser) {
        throw new Error('Authentication response is missing token or user details.');
      }

      await setSession(token, rawUser);
      addToast({ title: 'Welcome Admin', message: `Signed in as ${rawUser.email}`, variant: 'success' });
      navigate('/platform-admin', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Platform Admin authentication failed';
      setErrorMessage(msg);
      addToast({ title: 'Authentication Failed', message: msg, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCardWrapper
      badgeText="Platform Governance"
      badgeColor="indigo"
      title="Platform Admin Login"
      subtitle="Restricted access console for platform governance, treasury, and subscription verification."
      icon={ShieldCheck}
      footer={
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Not a platform administrator?</p>
          <div className="flex items-center justify-center gap-4 text-xs font-semibold">
            <Link to="/login" className="text-indigo-600 hover:text-indigo-700 hover:underline">
              Candidate Portal &rarr;
            </Link>
            <span className="text-slate-300">|</span>
            <Link to="/org-login" className="text-indigo-600 hover:text-indigo-700 hover:underline">
              Organisation Admin &rarr;
            </Link>
          </div>
        </div>
      }
    >
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 mb-5 text-xs text-indigo-950 flex items-start gap-2.5">
        <Lock className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-indigo-950">Privileged Access Only</p>
          <p className="text-indigo-800 text-[11px] mt-0.5">
            Only authorized platform administrators and super administrators may log in here. Candidate or organisation accounts will be rejected.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <InputField
          label="Administrator Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="superadmin@nexnuv.com"
        />

        <InputField
          label="Password"
          type="password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="••••••••"
        />

        <Button type="submit" variant="primary" className="w-full bg-indigo-600 hover:bg-indigo-700" loading={loading}>
          Authenticate Platform Admin
        </Button>
      </form>
    </AuthCardWrapper>
  );
}
