import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LoadingSkeleton from '../common/LoadingSkeleton';
import ErrorState from '../common/ErrorState';

export default function ProtectedRoute({ allowedUserTypes = null }) {
  const { isAuthenticated, user, loading, authError, refreshProfile } = useAuth();

  if (loading) {
    return (
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
        <LoadingSkeleton rows={6} />
      </div>
    );
  }

  if (authError && !isAuthenticated) {
    return (
      <div className="w-full px-4 py-12 sm:px-6 lg:px-8">
        <ErrorState
          title="Dependent Service Temporarily Unavailable"
          message={authError}
          onRetry={refreshProfile}
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedUserTypes) {
    const roleLower = String(user?.activeRoleCode || user?.role || user?.userType || '').toLowerCase();
    const effectiveUserType =
      user?.userType ||
      (roleLower === 'super_admin' || roleLower === 'platform_admin' || roleLower === 'superadmin'
        ? 'PLATFORM_ADMIN'
        : roleLower === 'candidate'
        ? 'CANDIDATE'
        : 'ORG_USER');

    if (!allowedUserTypes.includes(effectiveUserType)) {
      const fallback =
        effectiveUserType === 'CANDIDATE'
          ? '/portal'
          : effectiveUserType === 'PLATFORM_ADMIN'
          ? '/platform-admin'
          : '/app';
      return <Navigate to={fallback} replace />;
    }
  }

  return <Outlet />;
}
