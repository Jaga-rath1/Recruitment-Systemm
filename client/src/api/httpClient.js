import axios from 'axios';

const USE_GATEWAY = import.meta.env.VITE_USE_GATEWAY === 'true';
const API_BASE_URL = USE_GATEWAY
  ? import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:4000/api/v1'
  : import.meta.env.VITE_API_BASE_URL || '/api/v1';

const httpClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

httpClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('nexnuv_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

httpClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const serverErr = error.response?.data?.error;
    const isNetworkOrTimeout = !error.response && (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK');
    const status = error.response?.status || (isNetworkOrTimeout ? 503 : 500);
    const fallbackMsg = isNetworkOrTimeout
      ? 'Recruitment service or gateway is unreachable. Please verify services are running.'
      : error.message || 'Request failed';
    const message =
      serverErr?.message ||
      error.response?.data?.message ||
      fallbackMsg;

    const err = new Error(message);
    err.code = serverErr?.code || error.response?.data?.code || (status === 503 ? 'SERVICE_UNAVAILABLE' : 'REQUEST_ERROR');
    err.status = status;
    err.isServiceUnavailable = status === 503;
    err.details = serverErr?.details || null;

    const requestUrl = String(error.config?.url || '');
    const isCredentialPost =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/candidate/login') ||
      requestUrl.includes('/auth/candidate/register') ||
      requestUrl.includes('/auth/candidate/verify-email') ||
      requestUrl.includes('/auth/candidate/resend-verification') ||
      requestUrl.includes('/auth/candidate/forgot-password') ||
      requestUrl.includes('/auth/candidate/reset-password');
    if (status === 401 && !isCredentialPost && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nexnuv:unauthorized'));
    }

    return Promise.reject(err);
  }
);

export function resolveDownloadUrl(downloadPath) {
  if (!downloadPath) return '#';
  if (/^https?:\/\//i.test(downloadPath)) return downloadPath;
  if (/^https?:\/\//i.test(API_BASE_URL)) {
    const origin = new URL(API_BASE_URL).origin;
    return `${origin}${downloadPath}`;
  }
  return downloadPath;
}

export async function downloadAuthenticatedFile(downloadPath, fallbackFileName = 'document') {
  if (!downloadPath || downloadPath === '#') {
    throw new Error('Secure download link is unavailable.');
  }
  const url = resolveDownloadUrl(downloadPath);
  const blob = await httpClient.get(url, {
    baseURL: '',
    responseType: 'blob'
  });
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('Downloaded file was empty or invalid.');
  }

  const cleanFileName = String(fallbackFileName || 'document')
    .replace(/[/\\]/g, '_')
    .trim() || 'document';
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = blobUrl;
    link.download = cleanFileName;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
  } finally {
    if (link.parentNode) {
      link.remove();
    }
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
  }
}

export default httpClient;
