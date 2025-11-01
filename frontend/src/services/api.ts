import axios, { AxiosResponse } from 'axios';
import { 
  User, 
  Business, 
  Invoice, 
  Product, 
  Contact, 
  Payment,
  AuthResponse, 
  LoginCredentials, 
  RegisterData 
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  register: async (data: RegisterData): Promise<AuthResponse> => {
    const response = await api.post('/auth/register', data);
    return response.data;
  },
};

// Business API
export const businessApi = {
  getAll: async (): Promise<Business[]> => {
    const response = await api.get('/businesses');
    return response.data;
  },

  getById: async (id: string): Promise<Business> => {
    const response = await api.get(`/businesses/${id}`);
    return response.data;
  },

  create: async (data: Partial<Business>): Promise<Business> => {
    const response = await api.post('/businesses', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Business>): Promise<Business> => {
    const response = await api.put(`/businesses/${id}`, data);
    return response.data;
  },

  getProducts: async (businessId: string): Promise<Product[]> => {
    const response = await api.get(`/businesses/${businessId}/products`);
    return response.data;
  },

  createProduct: async (businessId: string, data: Partial<Product>): Promise<Product> => {
    const response = await api.post(`/businesses/${businessId}/products`, data);
    return response.data;
  },

  getContacts: async (businessId: string): Promise<Contact[]> => {
    const response = await api.get(`/businesses/${businessId}/contacts`);
    return response.data;
  },

  createContact: async (businessId: string, data: Partial<Contact>): Promise<Contact> => {
    const response = await api.post(`/businesses/${businessId}/contacts`, data);
    return response.data;
  },
};

// Invoice API
export const invoiceApi = {
  getAll: async (businessId: string, params?: any): Promise<{ invoices: Invoice[], pagination: any }> => {
    const response = await api.get(`/invoices/${businessId}`, { params });
    return response.data;
  },

  getById: async (businessId: string, invoiceId: string): Promise<Invoice> => {
    const response = await api.get(`/invoices/${businessId}/${invoiceId}`);
    return response.data;
  },

  create: async (businessId: string, data: Partial<Invoice>): Promise<Invoice> => {
    const response = await api.post(`/invoices/${businessId}`, data);
    return response.data;
  },

  send: async (businessId: string, invoiceId: string, options: { channels: string[], generatePdf?: boolean }): Promise<void> => {
    await api.post(`/invoices/${businessId}/${invoiceId}/send`, options);
  },

  addPayment: async (businessId: string, invoiceId: string, data: Partial<Payment>): Promise<Payment> => {
    const response = await api.post(`/invoices/${businessId}/${invoiceId}/payments`, data);
    return response.data;
  },
};

export default api;