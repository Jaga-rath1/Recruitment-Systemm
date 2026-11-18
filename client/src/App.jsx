import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/common/ToastContainer';

import MarketingLayout from './components/layout/MarketingLayout';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';

// Eager entry & authentication pages for instant first-paint
import HomePage from './modules/marketing/HomePage';
import LoginPage from './modules/marketing/LoginPage';
import PlatformAdminLoginPage from './modules/auth/PlatformAdminLoginPage';
import OrganisationAdminLoginPage from './modules/auth/OrganisationAdminLoginPage';
import RecruiterLoginPage from './modules/auth/RecruiterLoginPage';

// Lazy-loaded public & onboarding pages
const FeaturesPage = lazy(() => import('./modules/marketing/FeaturesPage'));
const PricingPage = lazy(() => import('./modules/marketing/PricingPage'));
const AboutPage = lazy(() => import('./modules/marketing/AboutPage'));
const ContactPage = lazy(() => import('./modules/marketing/ContactPage'));
const CandidateVerifyEmailPage = lazy(() => import('./modules/marketing/CandidateVerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./modules/marketing/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./modules/marketing/ResetPasswordPage'));
const ActivateAccountPage = lazy(() => import('./modules/marketing/ActivateAccountPage'));
const EmployeeActivationPage = lazy(() => import('./modules/auth/EmployeeActivationPage'));
const CareersPage = lazy(() => import('./modules/marketing/CareersPage'));
const JobDetailApplyPage = lazy(() => import('./modules/marketing/JobDetailApplyPage'));
const SubscribePage = lazy(() => import('./modules/subscription/SubscribePage'));

// Lazy-loaded Platform Admin workspace
const PlatformAdminReviewPage = lazy(() => import('./modules/subscription/PlatformAdminReviewPage'));
const PlatformOverviewPage = lazy(() => import('./modules/platform/PlatformOverviewPage'));
const PlatformPlansPage = lazy(() => import('./modules/platform/PlatformPlansPage'));
const PlatformSubscriptionsPage = lazy(() => import('./modules/platform/PlatformSubscriptionsPage'));
const PlatformOrganisationsPage = lazy(() => import('./modules/platform/PlatformOrganisationsPage'));
const PlatformEntitlementsPage = lazy(() => import('./modules/platform/PlatformEntitlementsPage'));
const PlatformConfigurationPage = lazy(() => import('./modules/platform/PlatformConfigurationPage'));
const PlatformAdministrationPage = lazy(() => import('./modules/platform/PlatformAdministrationPage'));
const PlatformAdminJobManagementPage = lazy(() => import('./modules/platform/PlatformAdminJobManagementPage'));

// Lazy-loaded Organisation workspace
const OrganisationDashboardPage = lazy(() => import('./modules/organisation/OrganisationDashboardPage'));
const OrganisationProfilePage = lazy(() => import('./modules/organisation/OrganisationProfilePage'));
const EmployeesPage = lazy(() => import('./modules/employees/EmployeesPage'));
const RolesPermissionsPage = lazy(() => import('./modules/roles/RolesPermissionsPage'));
const JobsPage = lazy(() => import('./modules/jobs/JobsPage'));
const ApplicationsPage = lazy(() => import('./modules/applications/ApplicationsPage'));
const CandidatesPage = lazy(() => import('./modules/candidates/CandidatesPage'));
const InterviewsPage = lazy(() => import('./modules/interviews/InterviewsPage'));
const OffersPage = lazy(() => import('./modules/offers/OffersPage'));
const JoiningPage = lazy(() => import('./modules/joining/JoiningPage'));
const ReportsPage = lazy(() => import('./modules/reports/ReportsPage'));

// Lazy-loaded Candidate portal
const CandidatePortalPage = lazy(() => import('./modules/candidate-portal/CandidatePortalPage'));
const CandidateInterviewsPage = lazy(() => import('./modules/candidate-portal/CandidateInterviewsPage'));
const CandidateOffersPage = lazy(() => import('./modules/candidate-portal/CandidateOffersPage'));
const CandidateProfilePage = lazy(() => import('./modules/candidate-portal/CandidateProfilePage'));

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center p-8" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        <p className="text-xs font-medium text-slate-500">Loading workspace...</p>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {/* Public Marketing & Careers */}
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/platform-admin/login" element={<PlatformAdminLoginPage />} />
          <Route path="/org-login" element={<OrganisationAdminLoginPage />} />
          <Route path="/recruiter-login" element={<RecruiterLoginPage />} />
          <Route path="/activate-employee" element={<EmployeeActivationPage />} />
          <Route path="/verify-email" element={<CandidateVerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/subscribe" element={<SubscribePage />} />
          <Route path="/activate-account" element={<ActivateAccountPage />} />
          <Route path="/activate" element={<Navigate to="/activate-account" replace />} />
          <Route path="/careers" element={<CareersPage />} />
          <Route path="/careers/:identifier" element={<JobDetailApplyPage />} />
        </Route>

        {/* Organisation Workspace (Org Admin, Recruiter, Tech Interviewer, Senior Interviewer) */}
        <Route element={<ProtectedRoute allowedUserTypes={['ORG_USER']} />}>
          <Route path="/app" element={<DashboardLayout />}>
            <Route index element={<OrganisationDashboardPage />} />
            <Route path="organisation" element={<OrganisationProfilePage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="roles" element={<RolesPermissionsPage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="applications" element={<ApplicationsPage />} />
            <Route path="candidates" element={<CandidatesPage />} />
            <Route path="interviews" element={<InterviewsPage />} />
            <Route path="offers" element={<OffersPage />} />
            <Route path="joining" element={<JoiningPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>
        </Route>

        {/* Candidate Portal */}
        <Route element={<ProtectedRoute allowedUserTypes={['CANDIDATE']} />}>
          <Route path="/portal" element={<DashboardLayout />}>
            <Route index element={<CandidatePortalPage />} />
            <Route path="interviews" element={<CandidateInterviewsPage />} />
            <Route path="offers" element={<CandidateOffersPage />} />
            <Route path="profile" element={<CandidateProfilePage />} />
          </Route>
        </Route>

        {/* Platform Admin Workspace (7 Core Modules + Verification Queue + Job Governance) */}
        <Route element={<ProtectedRoute allowedUserTypes={['PLATFORM_ADMIN']} />}>
          <Route path="/platform-admin" element={<DashboardLayout />}>
            <Route index element={<PlatformOverviewPage />} />
            <Route path="plans" element={<PlatformPlansPage />} />
            <Route path="subscriptions" element={<PlatformSubscriptionsPage />} />
            <Route path="organisations" element={<PlatformOrganisationsPage />} />
            <Route path="jobs" element={<PlatformAdminJobManagementPage />} />
            <Route path="entitlements" element={<PlatformEntitlementsPage />} />
            <Route path="configuration" element={<PlatformConfigurationPage />} />
            <Route path="administration" element={<PlatformAdministrationPage />} />
            <Route path="verification-queue" element={<PlatformAdminReviewPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
            <ToastContainer />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
