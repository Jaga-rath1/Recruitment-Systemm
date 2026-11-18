const { createRequire } = require('module');
const req = createRequire(__filename);
const emailAdapter = req('../../src/integrations/email/email.adapter');

function extractOtpFromText(text = '') {
  const match = String(text).match(/verification code is:\s*(\d{6})/i) || String(text).match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

function extractResetTokenFromText(text = '') {
  const urlMatch = String(text).match(/token=([A-Za-z0-9_-]{20,})/);
  if (urlMatch) return decodeURIComponent(urlMatch[1]);
  const lineMatch = String(text).match(/reset token[^:]*:\s*([A-Za-z0-9_-]{20,})/i);
  return lineMatch ? lineMatch[1] : null;
}

function createEmailCaptureHarness() {
  const messages = [];

  emailAdapter.setTestEmailTransport(async (payload) => {
    const otp = extractOtpFromText(payload.text);
    const resetToken = extractResetTokenFromText(payload.text);
    const entry = {
      ...payload,
      otp,
      resetToken
    };
    messages.push(entry);
    return {
      delivered: true,
      provider: 'TEST_CAPTURE',
      messageId: `test-msg-${messages.length}`
    };
  });

  return {
    messages,
    getLatestFor(email, category = null) {
      const normalized = String(email || '').trim().toLowerCase();
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        if (String(msg.to || '').trim().toLowerCase() === normalized) {
          if (!category || msg.category === category) return msg;
        }
      }
      return null;
    },
    getLatestOtp(email) {
      return this.getLatestFor(email, 'CANDIDATE_EMAIL_VERIFICATION')?.otp || null;
    },
    getLatestResetToken(email) {
      return this.getLatestFor(email, 'CANDIDATE_PASSWORD_RESET')?.resetToken || null;
    },
    clear() {
      messages.length = 0;
    }
  };
}

async function registerAndVerifyCandidate(request, app, { fullName, email, password, capture: externalCapture = null }) {
  const capture = externalCapture || createEmailCaptureHarness();
  const normalized = String(email).trim().toLowerCase();

  const registerRes = await request(app)
    .post('/api/v1/auth/candidate/register')
    .send({ fullName, email, password });

  if (registerRes.status !== 201) {
    throw new Error(`Expected 201 from register, got ${registerRes.status}: ${JSON.stringify(registerRes.body)}`);
  }

  const otp = capture.getLatestOtp(normalized);
  if (!otp) {
    throw new Error(`No verification OTP captured for ${normalized}`);
  }

  const verifyRes = await request(app)
    .post('/api/v1/auth/candidate/verify-email')
    .send({ email, otp });

  if (verifyRes.status !== 200) {
    throw new Error(`Expected 200 from verify-email, got ${verifyRes.status}: ${JSON.stringify(verifyRes.body)}`);
  }

  const loginRes = await request(app)
    .post('/api/v1/auth/candidate/login')
    .send({ email, password });

  if (loginRes.status !== 200 || !loginRes.body?.data?.token) {
    throw new Error(`Expected 200 + token from candidate login, got ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
  }

  return {
    registerRes,
    verifyRes,
    loginRes,
    otp,
    token: loginRes.body.data.token,
    user: loginRes.body.data.user,
    capture
  };
}

module.exports = {
  createEmailCaptureHarness,
  registerAndVerifyCandidate
};
