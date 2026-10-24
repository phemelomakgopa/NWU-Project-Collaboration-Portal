import axios from 'axios';

const DEFAULT_PRODUCTION_API = 'https://pcp-backend-f4a2.onrender.com';

export const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:8000'
    : DEFAULT_PRODUCTION_API);

const TOKEN_KEY = 'pcp-token';
const USER_KEY = 'pcp-user';

export const session = {
  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  get user() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  saveUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Keys written by the previous version of the app.
    ['access_token', 'refresh_token', 'user', 'username', 'email'].forEach((key) =>
      localStorage.removeItem(key),
    );
  },
};

export const api = axios.create({ baseURL: `${API_BASE_URL}/api` });

api.interceptors.request.use((config) => {
  const token = session.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onSessionExpired = () => {};
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const hadToken = Boolean(error.config?.headers?.Authorization);
    if (error.response?.status === 401 && hadToken) onSessionExpired();
    return Promise.reject(error);
  },
);

/** Turn any request failure into one sentence a person can act on. */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  if (error.response) {
    const data = error.response.data;
    if (data && typeof data === 'object' && typeof data.error === 'string') return data.error;
    if (error.response.status >= 500) return 'The server ran into a problem. Please try again in a moment.';
    return fallback;
  }
  if (error.request) return 'Could not reach the server. Check your connection and try again.';
  return error.message || fallback;
}

/** Download a protected file through the API and save it with its real name. */
export async function downloadDocument(doc) {
  const response = await api.get(`/documents/${doc.id}/`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = doc.title;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
