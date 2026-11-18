import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

export function normalizeAuthUser(rawUser) {
  if (!rawUser) return null;
  const role = String(rawUser.activeRoleCode || rawUser.role || rawUser.userType || '').toLowerCase().trim();

  let activeRoleCode = rawUser.activeRoleCode;
  let userType = rawUser.userType;

  if (!activeRoleCode || !userType) {
    if (role === 'super_admin' || role === 'platform_admin' || role === 'superadmin' || role === 'platform') {
      activeRoleCode = 'PLATFORM_ADMIN';
      userType = 'PLATFORM_ADMIN';
    } else if (role === 'candidate') {
      activeRoleCode = 'CANDIDATE';
      userType = 'CANDIDATE';
    } else if (role === 'org_admin' || role === 'organization_admin') {
      activeRoleCode = 'ORGANISATION_ADMIN';
      userType = 'ORG_USER';
    } else {
      activeRoleCode = activeRoleCode || (role ? role.toUpperCase() : 'EMPLOYEE');
      userType = userType || 'ORG_USER';
    }
  }

  return {
    ...rawUser,
    activeRoleCode,
    userType,
    permissions: Array.isArray(rawUser.permissions) && rawUser.permissions.length > 0
      ? (activeRoleCode === 'PLATFORM_ADMIN' && !rawUser.permissions.includes('*') ? [...rawUser.permissions, '*'] : rawUser.permissions)
      : (activeRoleCode === 'PLATFORM_ADMIN' ? ['*'] : [])
  };
}

function getStoredUser() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('nexnuv_user') : null;
    return raw ? normalizeAuthUser(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser);
  const [organisation, setOrganisation] = useState(null);
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !getStoredUser() && Boolean(localStorage.getItem('nexnuv_token'));
  });
  const [authError, setAuthError] = useState('');

  const refreshProfile = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('nexnuv_token') : null;
    if (!token) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('nexnuv_user');
      }
      setUser(null);
      setOrganisation(null);
      setAuthError('');
      setLoading(false);
      return null;
    }

    setAuthError('');
    try {
      const res = await authApi.me();
      const rawUser = res?.data?.user || res?.user || null;
      const rawOrg = res?.data?.organisation || res?.organisation || null;
      if (rawUser) {
        const normalizedUser = normalizeAuthUser(rawUser);
        if (typeof window !== 'undefined') {
          localStorage.setItem('nexnuv_user', JSON.stringify(normalizedUser));
        }
        setUser(normalizedUser);
        setOrganisation(rawOrg);
        return normalizedUser;
      }
      return null;
    } catch (err) {
      // Only clear stored credentials when Auth/Recruitment explicitly rejects the token/session (401/403).
      // Preserve session across transient 503/network outages and return cached user.
      if (err?.status === 401 || err?.status === 403) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('nexnuv_token');
          localStorage.removeItem('nexnuv_user');
        }
        setUser(null);
        setOrganisation(null);
        return null;
      }
      if (err?.status === 503 || err?.isServiceUnavailable) {
        setAuthError(err.message || 'Authentication or upstream service is temporarily unavailable.');
      }
      return getStoredUser();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    const handleUnauthorized = () => {
      localStorage.removeItem('nexnuv_token');
      localStorage.removeItem('nexnuv_user');
      setUser(null);
      setOrganisation(null);
      setAuthError('');
      setLoading(false);
    };
    const handleStorageChange = (event) => {
      if (event.key === 'nexnuv_token' || event.key === null) {
        refreshProfile();
      }
    };
    window.addEventListener('nexnuv:unauthorized', handleUnauthorized);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('nexnuv:unauthorized', handleUnauthorized);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [refreshProfile]);

  const setSession = useCallback(
    async (token, initialUser = null) => {
      if (typeof window !== 'undefined' && token) {
        localStorage.setItem('nexnuv_token', token);
      }
      let active = null;
      if (initialUser) {
        active = normalizeAuthUser(initialUser);
        if (typeof window !== 'undefined') {
          localStorage.setItem('nexnuv_user', JSON.stringify(active));
        }
        setUser(active);
        setLoading(false);
      }
      try {
        const refreshed = await refreshProfile();
        return refreshed || active;
      } catch {
        return active;
      }
    },
    [refreshProfile]
  );

  const logout = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nexnuv_token');
      localStorage.removeItem('nexnuv_user');
    }
    setUser(null);
    setOrganisation(null);
    setAuthError('');
    setLoading(false);
  }, []);

  const hasPermission = useCallback(
    (perm) => {
      if (!user) return false;
      if (user.activeRoleCode === 'PLATFORM_ADMIN' || user.userType === 'PLATFORM_ADMIN') return true;
      if (Array.isArray(user.permissions)) {
        if (user.permissions.includes('*') || user.permissions.includes(perm)) return true;
      }
      return false;
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        organisation,
        loading,
        authError,
        isAuthenticated: Boolean(user),
        setSession,
        logout,
        refreshProfile,
        hasPermission
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
