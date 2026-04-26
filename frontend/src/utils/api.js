import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach token if present
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('cc_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle global errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || 'Something went wrong. Please try again.';

    if (error.response?.status === 401) {
      localStorage.removeItem('cc_token');
      delete api.defaults.headers.common['Authorization'];
      // Don't redirect here — let the ProtectedRoute handle it
    }

    // Don't show toast for 401 on /auth/me (silent check)
    const isAuthCheck = error.config?.url?.includes('/auth/me');
    if (!isAuthCheck) {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

// ─── Services ──────────────────────────────────────────────────────────────

export const servicesAPI = {
  getAll: () => api.get('/services'),
  getOne: (id) => api.get(`/services/${id}`),
  create: (data) => api.post('/services', data),
  update: (id, data) => api.put(`/services/${id}`, data),
  delete: (id) => api.delete(`/services/${id}`),
};

export const slotsAPI = {
  getAvailable: (date) => api.get(`/slots?date=${date}`),
};

export const bookingsAPI = {
  create: (data) => api.post('/bookings', data),
  adminCreate: (data) => api.post('/bookings/admin', data),
  getAll: (params) => api.get('/bookings', { params }),
  getOne: (id) => api.get(`/bookings/${id}`),
  update: (id, data) => api.put(`/bookings/${id}`, data),
  getAnalytics: (period) => api.get(`/bookings/analytics?period=${period}`),
  getSchedule: (date) => api.get(`/bookings/schedule?date=${date}`),
  getCustomerHistory: (phone) => api.get(`/bookings/customer?phone=${phone}`),
  getOvertimeAlerts: () => api.get('/bookings/overtime-alerts'),
  clockIn: (id) => api.post(`/bookings/${id}/clock-in`, {}),
  clockOut: (id) => api.post(`/bookings/${id}/clock-out`, {}),
  resendWorkerMessage: (id) => api.post(`/bookings/${id}/resend-worker`, {}),
};

export const staffAPI = {
  getAll: (params) => api.get('/staff', { params }),
  getOne: (id) => api.get(`/staff/${id}`),
  create: (data) => api.post('/staff', data),
  update: (id, data) => api.put(`/staff/${id}`, data),
  delete: (id) => api.delete(`/staff/${id}`),
  getAvailable: (date, serviceType) =>
    api.get('/staff/available', { params: { date, serviceType } }),
  getBySlot: (date, timeSlot) =>
    api.get('/staff/slots', { params: { date, timeSlot } }),
  notifySchedule: (id, date) =>
    api.post(`/staff/${id}/notify-schedule`, {}, { params: { date } }),
  notify: (id, message, bookingId) =>
    api.post(`/staff/${id}/notify`, { message, ...(bookingId && { bookingId }) }),
};

export const paymentsAPI = {
  createOrder: (bookingId) => api.post('/payments/create-order', { bookingId }),
  verify: (data) => api.post('/payments/verify', data),
};

export default api;
