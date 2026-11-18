const { z } = require('zod');

const BLOCKED_PROTOCOLS = /^(?:javascript|data|vbscript|file):/i;
const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function optionalHttpUrlSchema(maxLength = 300) {
  return z
    .string()
    .max(maxLength)
    .refine((val) => !val || /^https?:\/\/.+/i.test(val.trim()), {
      message: 'URL must start with http:// or https://'
    })
    .optional();
}

function safeLocationOrMeetingUrlSchema(minLength = 3, maxLength = 500) {
  return z
    .string()
    .min(minLength)
    .max(maxLength)
    .refine((val) => !BLOCKED_PROTOCOLS.test(val.trim()), {
      message: 'Unsafe URI scheme is not permitted'
    });
}

function containsUnsafeKeys(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (const key of Reflect.ownKeys(obj)) {
    if (typeof key === 'string' && FORBIDDEN_JSON_KEYS.has(key)) return true;
    const val = obj[key];
    if (typeof val === 'object' && val !== null && containsUnsafeKeys(val)) {
      return true;
    }
  }
  return false;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function strongPasswordSchema(label = 'Password') {
  return z
    .string()
    .min(8, `${label} must be at least 8 characters`)
    .max(128, `${label} must not exceed 128 characters`)
    .refine((val) => /[a-z]/.test(val), {
      message: `${label} must include at least one lowercase letter`
    })
    .refine((val) => /[A-Z]/.test(val), {
      message: `${label} must include at least one uppercase letter`
    })
    .refine((val) => /[0-9]/.test(val), {
      message: `${label} must include at least one number`
    })
    .refine((val) => /[^A-Za-z0-9]/.test(val), {
      message: `${label} must include at least one special character`
    });
}

module.exports = {
  optionalHttpUrlSchema,
  safeLocationOrMeetingUrlSchema,
  containsUnsafeKeys,
  normalizeEmail,
  strongPasswordSchema
};
