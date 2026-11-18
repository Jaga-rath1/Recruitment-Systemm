'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['super_admin', 'org_admin', 'hr', 'manager', 'employee', 'agent'];
const MIN_PASSWORD_LENGTH = 8;

function passwordError(value, field) {
  if (!value || typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    return `${field} must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

function validateRegister(body) {
  const { email, password, firstName, lastName } = body;
  if (!email || !EMAIL_RE.test(email)) return 'Valid email is required';
  const pwError = passwordError(password, 'Password');
  if (pwError) return pwError;
  if (firstName && typeof firstName !== 'string') return 'firstName must be a string';
  if (lastName && typeof lastName !== 'string') return 'lastName must be a string';
  return null;
}

function validateLogin(body) {
  const { email, password } = body;
  if (!email || !EMAIL_RE.test(email)) return 'Valid email is required';
  if (!password) return 'Password is required';
  return null;
}

function validateChangePassword(body) {
  const { currentPassword, newPassword } = body;
  if (!currentPassword) return 'currentPassword is required';
  const pwError = passwordError(newPassword, 'newPassword');
  if (pwError) return pwError;
  if (currentPassword === newPassword) return 'newPassword must differ from currentPassword';
  return null;
}

function validateSetupPassword(body) {
  const { temporaryPassword, currentPassword, newPassword, confirmPassword } = body;
  const tempPw = temporaryPassword || currentPassword;
  if (!newPassword || typeof newPassword !== 'string') return 'New password is required';
  const pwError = passwordError(newPassword, 'New password');
  if (pwError) return pwError;
  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    return 'Passwords do not match';
  }
  if (tempPw && tempPw === newPassword) {
    return 'New password must differ from temporary password';
  }
  return null;
}

function validateForgotPassword(body) {
  if (!body.email || !EMAIL_RE.test(body.email)) return 'Valid email is required';
  return null;
}

function validateResetPassword(body) {
  const { token, newPassword } = body;
  if (!token || typeof token !== 'string') return 'token is required';
  return passwordError(newPassword, 'newPassword');
}

function validateProvision(body) {
  const { email, role } = body;
  if (!email || !EMAIL_RE.test(email)) return 'Valid email is required';
  if (!role || !ROLES.includes(role)) return `role must be one of ${ROLES.join(', ')}`;
  return null;
}

function validateRole(body) {
  if (!body.role || !ROLES.includes(body.role)) return `role must be one of ${ROLES.join(', ')}`;
  return null;
}

function validateRegisterTenant(body) {
  const { companyName, industryId, email, password } = body;
  if (!companyName || typeof companyName !== 'string' || !companyName.trim()) return 'Company name is required';
  if (!industryId || typeof industryId !== 'string' || !industryId.trim()) return 'Industry selection is required';
  if (!email || !EMAIL_RE.test(email)) return 'Valid email is required';
  const pwError = passwordError(password, 'Password');
  if (pwError) return pwError;
  return null;
}

module.exports = {
  validateRegister, validateLogin,
  validateChangePassword, validateSetupPassword, validateForgotPassword, validateResetPassword,
  validateProvision, validateRole, validateRegisterTenant,
};
