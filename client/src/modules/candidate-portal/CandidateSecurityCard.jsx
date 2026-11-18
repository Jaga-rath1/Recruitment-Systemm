import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import { InputField } from '../../components/common/FormField';
import { authApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function CandidateSecurityCard({ accountSecurity }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { addToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const isVerified = Boolean(accountSecurity?.emailVerified ?? user?.emailVerified);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      addToast({ title: 'Password mismatch', message: 'New password and confirmation must match.', variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      await authApi.changeCandidatePassword({
        currentPassword,
        newPassword,
        confirmPassword
      });
      addToast({
        title: 'Password updated',
        message: 'All prior candidate sessions were revoked. Please sign in with your new password.',
        variant: 'success'
      });
      logout();
      navigate('/login');
    } catch (err) {
      addToast({ title: 'Password update failed', message: err.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Account Security & Password"
      subtitle="Email verification status and session-revoking password management."
      actions={
        <Badge variant={isVerified ? 'success' : 'warning'}>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            {isVerified ? 'Email Verified' : 'Verification Pending'}
          </span>
        </Badge>
      }
    >
      <div className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600 sm:grid-cols-3">
        <div>
          <span className="block font-medium text-slate-500">Account Email</span>
          <span className="font-semibold text-slate-900">{user?.email || '—'}</span>
        </div>
        <div>
          <span className="block font-medium text-slate-500">Email Verified At</span>
          <span className="font-semibold text-slate-900">
            {accountSecurity?.emailVerifiedAt
              ? new Date(accountSecurity.emailVerifiedAt).toLocaleDateString()
              : isVerified
                ? 'Verified'
                : 'Not Verified'}
          </span>
        </div>
        <div>
          <span className="block font-medium text-slate-500">Last Password Change</span>
          <span className="font-semibold text-slate-900">
            {accountSecurity?.passwordChangedAt
              ? new Date(accountSecurity.passwordChangedAt).toLocaleDateString()
              : 'Initial password'}
          </span>
        </div>
      </div>

      <form onSubmit={handleChangePassword} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <InputField
            label="Current Password"
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
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
            placeholder="StrongPass#2026"
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            Changing your password invalidates all existing portal sessions across devices.
          </p>
          <Button type="submit" loading={saving}>
            Update Password
          </Button>
        </div>
      </form>
    </Card>
  );
}
