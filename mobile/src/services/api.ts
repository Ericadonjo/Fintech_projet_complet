import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getApiBase = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    return `http://${hostIp}:8000/api`;
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:8000/api';
  return 'http://localhost:8000/api';
};

const API_BASE = getApiBase();

async function request(endpoint: string, options: RequestInit = {}): Promise<any> {
  const config: RequestInit = {
    headers: { 'Content-Type': 'application/json', ...(options.headers as any) },
    ...options,
  };
  const response = await fetch(`${API_BASE}${endpoint}`, config);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export const api = {
  accounts: {
    list: () => request('/accounts'),
    get: (id: number | string) => request(`/accounts/${id}`),
    create: (data: any) => request('/accounts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number | string, data: any) => request(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number | string) => request(`/accounts/${id}`, { method: 'DELETE' }),
    balance: (id: number | string) => request(`/accounts/${id}/balance`),
  },
  transactions: {
    list: (filters?: Record<string, any>) => {
      const params = filters ? new URLSearchParams(filters).toString() : '';
      return request(`/transactions${params ? `?${params}` : ''}`);
    },
    get: (id: number | string) => request(`/transactions/${id}`),
    create: (data: any) => request('/transactions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number | string, data: any) => request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number | string) => request(`/transactions/${id}`, { method: 'DELETE' }),
    cancel: (id: string | number) => request(`/transactions/${id}/cancel`, { method: 'POST' }),
    uploadAttachment: async (txId: string, uri: string, mimeType: string = 'image/jpeg', type: string = 'IMAGE') => {
      const formData = new FormData();
      const filename = uri.split('/').pop() || 'file';
      formData.append('file', { uri, name: filename, type: mimeType } as any);
      const res = await fetch(`${API_BASE}/transactions/${txId}/attachments?type=${type}`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    },
  },
  categories: {
    list: () => request('/categories'),
    get: (id: number | string) => request(`/categories/${id}`),
    create: (data: any) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number | string, data: any) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number | string) => request(`/categories/${id}`, { method: 'DELETE' }),
  },
  settings: {
    get: (key: string) => request(`/settings/${key}`),
    set: (key: string, value: any) => request(`/settings/${key}`, { method: 'POST', body: JSON.stringify({ value }) }),
  },
  reports: {
    bilan: (startDate?: string, endDate?: string) => request(`/reports/bilan?start=${startDate}&end=${endDate}`),
    cashflow: (startDate?: string, endDate?: string) => request(`/reports/cashflow?start=${startDate}&end=${endDate}`),
  },
  auth: {
    login: (email: string, password: string) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
  },
  dashboard: {
    get: () => request('/dashboard'),
  },
};

export default api;
