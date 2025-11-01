export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
}

export interface Business {
  id: string;
  name: string;
  legalName: string;
  address: string;
  vatNumber?: string;
  tinNumber?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  primaryColor: string;
  defaultCurrency: string;
  invoicePrefix: string;
  invoiceSequence: number;
  defaultTaxRate: number;
  taxInclusive: boolean;
  defaultPaymentTerms: string;
  settings?: any;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  businessId: string;
  sku?: string;
  name: string;
  description?: string;
  unitPrice: number;
  taxRate?: number;
  taxInclusive: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  businessId: string;
  name: string;
  email?: string;
  phone?: string;
  vatNumber?: string;
  billingAddress?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LineItem {
  id: string;
  invoiceId: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  sortOrder: number;
  product?: Product;
}

export interface Invoice {
  id: string;
  businessId: string;
  contactId?: string;
  invoiceNumber: string;
  invoiceSequence: number;
  type: 'TAX_INVOICE' | 'INVOICE' | 'QUOTE' | 'RECEIPT';
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIAL_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  dateIssued: string;
  dateOfSupply?: string;
  dueDate?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerVatNumber?: string;
  customerAddress?: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  sentAt?: string;
  sentVia: string[];
  pdfUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  business?: Business;
  contact?: Contact;
  lineItems: LineItem[];
  payments: Payment[];
  trackingEvents: TrackingEvent[];
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  currency: string;
  dateReceived: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'ONLINE' | 'CHEQUE' | 'OTHER';
  gatewayReference?: string;
  notes?: string;
  createdAt: string;
}

export interface TrackingEvent {
  id: string;
  invoiceId: string;
  kind: 'EMAIL_SENT' | 'EMAIL_BOUNCE' | 'EMAIL_OPEN' | 'LINK_CLICK' | 'WHATSAPP_SENT' | 'WHATSAPP_DELIVERED' | 'WHATSAPP_READ' | 'WHATSAPP_FAILED' | 'PAYMENT_RECEIVED' | 'INVOICE_VIEWED';
  timestamp: string;
  metadata?: any;
}

export interface IntegrationCredential {
  id: string;
  businessId: string;
  kind: 'GMAIL_OAUTH' | 'SMTP' | 'SENDGRID' | 'WHATSAPP_CLOUD' | 'WHATSAPP_TWILIO' | 'STRIPE' | 'LOCAL_PAYMENT_GATEWAY';
  isActive: boolean;
  lastRefresh?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ApiError {
  message: string;
  statusCode: number;
  stack?: string;
}