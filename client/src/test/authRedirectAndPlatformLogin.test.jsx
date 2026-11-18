import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth, normalizeAuthUser } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import LoginPage from '../modules/marketing/LoginPage';
import * as apiModule from '../api';

vi.mock('../api', () => ({
  authApi: {
    login: vi.fn(),
    me: vi.fn(),
    registerCandidate: vi.fn(),
    verifyCandidateEmail: vi.fn(),
    resendCandidateVerification: vi.fn(),
    forgotCandidatePassword: vi.fn(),
    resetCandidatePassword: vi.fn(),
    changeCandidatePassword: vi.fn()
  }
}));

function renderWithAuth(ui, { initialRoute = '/login', token = null, user = null } = {}) {
  if (token) localStorage.setItem('nexnuv_token', token);
  else localStorage.removeItem('nexnuv_token');

  if (user) localStorage.setItem('nexnuv_user', JSON.stringify(user));
  else localStorage.removeItem('nexnuv_user');

  return render(
    <ToastProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialRoute]}>
          {ui}
        </MemoryRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

describe('Auth Normalization & Session Lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('1. correctly normalizes super_admin role into PLATFORM_ADMIN', () => {
    const rawAuthServiceUser = {
      id: '7112e443-6b55-4ae5-81a6-a35f28c042a4',
      email: 'platformadmin@nexnuv.com',
      role: 'super_admin',
      organizationId: null,
      status: 'active'
    };

    const normalized = normalizeAuthUser(rawAuthServiceUser);
    expect(normalized.activeRoleCode).toBe('PLATFORM_ADMIN');
    expect(normalized.userType).toBe('PLATFORM_ADMIN');
    expect(normalized.permissions).toContain('*');
  });

  it('2. normalizes recruitment shared role into PLATFORM_ADMIN', () => {
    const rawRecruitmentUser = {
      userId: '7112e443-6b55-4ae5-81a6-a35f28c042a4',
      email: 'platformadmin@nexnuv.com',
      sharedRole: 'super_admin',
      userType: 'PLATFORM_ADMIN',
      roles: ['PLATFORM_ADMIN'],
      organisationId: null
    };

    const normalized = normalizeAuthUser(rawRecruitmentUser);
    expect(normalized.activeRoleCode).toBe('PLATFORM_ADMIN');
    expect(normalized.userType).toBe('PLATFORM_ADMIN');
    expect(normalized.permissions).toContain('*');
  });

  it('3. normalizes candidate and org_admin roles appropriately', () => {
    const cand = normalizeAuthUser({ email: 'c@cand.io', role: 'candidate' });
    expect(cand.activeRoleCode).toBe('CANDIDATE');
    expect(cand.userType).toBe('CANDIDATE');

    const orgAdmin = normalizeAuthUser({ email: 'o@acme.io', role: 'org_admin' });
    expect(orgAdmin.activeRoleCode).toBe('ORGANISATION_ADMIN');
    expect(orgAdmin.userType).toBe('ORG_USER');
  });
});

describe('Super Admin Login & Post-Login Redirection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('4. successful Super Admin login navigates to /platform-admin', async () => {
    apiModule.authApi.login.mockResolvedValueOnce({
      success: true,
      token: 'mock-super-admin-jwt-token',
      user: {
        id: 'super-admin-1',
        email: 'platformadmin@nexnuv.com',
        role: 'super_admin',
        organizationId: null,
        status: 'active'
      }
    });

    apiModule.authApi.me.mockResolvedValue({
      success: true,
      user: {
        id: 'super-admin-1',
        email: 'platformadmin@nexnuv.com',
        role: 'super_admin',
        organizationId: null,
        status: 'active'
      }
    });

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={<ProtectedRoute allowedUserTypes={['PLATFORM_ADMIN']} />}
        >
          <Route path="/platform-admin" element={<div data-testid="platform-admin-landing">Platform Admin Console</div>} />
        </Route>
      </Routes>,
      { initialRoute: '/login' }
    );

    const emailInput = screen.getByPlaceholderText('admin@company.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitBtn = screen.getByRole('button', { name: /^Sign in$/i });

    fireEvent.change(emailInput, { target: { value: 'platformadmin@nexnuv.com' } });
    fireEvent.change(passwordInput, { target: { value: 'Welcome@123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('platform-admin-landing')).toBeInTheDocument();
      expect(localStorage.getItem('nexnuv_token')).toBe('mock-super-admin-jwt-token');
      expect(localStorage.getItem('nexnuv_user')).toContain('PLATFORM_ADMIN');
    });
  });

  it('5. auto-redirects already-authenticated Super Admin to /platform-admin when visiting /login', async () => {
    const superAdminUser = {
      id: 'super-admin-1',
      email: 'platformadmin@nexnuv.com',
      role: 'super_admin',
      activeRoleCode: 'PLATFORM_ADMIN',
      userType: 'PLATFORM_ADMIN'
    };

    apiModule.authApi.me.mockResolvedValue({
      success: true,
      user: superAdminUser
    });

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={<ProtectedRoute allowedUserTypes={['PLATFORM_ADMIN']} />}
        >
          <Route path="/platform-admin" element={<div data-testid="platform-admin-landing">Platform Admin Console</div>} />
        </Route>
      </Routes>,
      { initialRoute: '/login', token: 'valid-admin-token', user: superAdminUser }
    );

    await waitFor(() => {
      expect(screen.getByTestId('platform-admin-landing')).toBeInTheDocument();
    });
  });

  it('6. ProtectedRoute rejects non-admin users from accessing /platform-admin and routes them to /app', async () => {
    const orgUser = {
      id: 'org-user-1',
      email: 'recruiter@acme.io',
      role: 'org_admin',
      activeRoleCode: 'ORGANISATION_ADMIN',
      userType: 'ORG_USER'
    };

    apiModule.authApi.me.mockResolvedValue({
      success: true,
      user: orgUser
    });

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<div data-testid="org-app-landing">Organisation Workspace</div>} />
        <Route
          element={<ProtectedRoute allowedUserTypes={['PLATFORM_ADMIN']} />}
        >
          <Route path="/platform-admin" element={<div data-testid="platform-admin-landing">Platform Admin Console</div>} />
        </Route>
      </Routes>,
      { initialRoute: '/platform-admin', token: 'valid-org-token', user: orgUser }
    );

    await waitFor(() => {
      expect(screen.queryByTestId('platform-admin-landing')).not.toBeInTheDocument();
      expect(screen.getByTestId('org-app-landing')).toBeInTheDocument();
    });
  });

  it('7. ProtectedRoute rejects unauthenticated users and redirects to /login', async () => {
    apiModule.authApi.me.mockRejectedValue(new Error('No token'));

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<div data-testid="login-landing">Login Screen</div>} />
        <Route
          element={<ProtectedRoute allowedUserTypes={['PLATFORM_ADMIN']} />}
        >
          <Route path="/platform-admin" element={<div data-testid="platform-admin-landing">Platform Admin Console</div>} />
        </Route>
      </Routes>,
      { initialRoute: '/platform-admin' }
    );

    await waitFor(() => {
      expect(screen.queryByTestId('platform-admin-landing')).not.toBeInTheDocument();
      expect(screen.getByTestId('login-landing')).toBeInTheDocument();
    });
  });

  it('8. preserving session on refresh: stored user in localStorage avoids blank screens or login bounces', async () => {
    const adminUser = {
      id: 'super-admin-1',
      email: 'platformadmin@nexnuv.com',
      role: 'super_admin',
      activeRoleCode: 'PLATFORM_ADMIN',
      userType: 'PLATFORM_ADMIN'
    };

    // Upstream /me takes a moment to respond
    apiModule.authApi.me.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ success: true, user: adminUser }), 50)));

    renderWithAuth(
      <Routes>
        <Route path="/login" element={<div data-testid="login-landing">Login Screen</div>} />
        <Route
          element={<ProtectedRoute allowedUserTypes={['PLATFORM_ADMIN']} />}
        >
          <Route path="/platform-admin" element={<div data-testid="platform-admin-landing">Platform Admin Console</div>} />
        </Route>
      </Routes>,
      { initialRoute: '/platform-admin', token: 'persisted-jwt-token', user: adminUser }
    );

    // Should immediately display Platform Admin without bouncing to login
    expect(screen.getByTestId('platform-admin-landing')).toBeInTheDocument();
  });
});
