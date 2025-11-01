/**
 * Multi-Tenant Firestore Service
 * Provides type-safe CRUD operations with automatic tenant scoping and validation
 */

import * as admin from 'firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// Initialize Firestore
export const db = admin.firestore();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Tenant {
  id: string;
  name: string;
  legalName: string;
  brn?: string; // Business Registration Number
  tin?: string; // Taxpayer Identification Number
  address: {
    line1: string;
    line2?: string;
    city: string;
    province: string;
    postalCode?: string;
    country: string;
  };
  branding: {
    logoUrl?: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    autoExtracted: boolean;
  };
  taxConfig: {
    vatRegistered: boolean;
    vatNumber?: string;
    svatRegistered: boolean;
    ssclApplicable: boolean;
    defaultVatRate: number;
    fiscalYearStart: string; // MM-DD format
  };
  invoiceConfig: {
    prefix: string;
    nextNumber: number;
    paymentTerms: string;
    footerText?: string;
  };
  currency: string;
  status: 'active' | 'suspended' | 'trial';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TenantUser {
  id: string;
  tenantId: string;
  userId: string;
  role: 'owner' | 'admin' | 'accountant' | 'sales' | 'viewer';
  permissions: string[];
  invitedBy?: string;
  joinedAt: Timestamp;
  status: 'active' | 'suspended' | 'invited';
}

export interface Client {
  id: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    province: string;
    postalCode?: string;
    country: string;
  };
  tin?: string;
  vatNumber?: string;
  registrationType: 'vat' | 'svat' | 'none';
  currency?: string;
  paymentTerms?: string;
  tags?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Product {
  id: string;
  tenantId: string;
  sku?: string;
  name: string;
  description?: string;
  unitPrice: number;
  taxCategory: 'standard' | 'zero-rated' | 'exempt';
  taxRate?: number;
  ssclApplicable: boolean;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface LineItem {
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxable: boolean;
  taxCategory: 'standard' | 'zero-rated' | 'exempt';
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  invoiceType: 'proforma' | 'tax_invoice' | 'credit_note' | 'debit_note';
  status: 'draft' | 'sent' | 'delivered' | 'viewed' | 'partial_paid' | 'paid' | 'overdue' | 'cancelled';
  clientId: string;
  clientSnapshot: Partial<Client>; // Denormalized for audit trail
  dateIssued: Timestamp;
  dateDue?: Timestamp;
  dateOfSupply?: Timestamp;
  lineItems: LineItem[];
  subtotal: number;
  totalDiscount: number;
  taxBreakdown: {
    vatAmount: number;
    ssclAmount: number;
    totalTax: number;
  };
  total: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  exchangeRate?: number;
  pdfUrl?: string;
  publicViewUrl?: string;
  notes?: string;
  terms?: string;
  footerText?: string;
  branding?: Partial<Tenant['branding']>; // Snapshot for consistency
  recurring?: {
    frequency: 'weekly' | 'monthly' | 'quarterly' | 'annually';
    nextDate: Timestamp;
    endDate?: Timestamp;
  };
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Payment {
  id: string;
  tenantId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  paymentMethod: 'cash' | 'cheque' | 'bank_transfer' | 'online' | 'card';
  paymentDate: Timestamp;
  reference?: string;
  gatewayProvider?: 'payhere' | 'webxpay' | 'hnb' | 'sampath';
  gatewayTransactionId?: string;
  gatewayStatus?: string;
  gatewayResponse?: any;
  notes?: string;
  recordedBy: string;
  createdAt: Timestamp;
}

export interface InvoiceEvent {
  id: string;
  tenantId: string;
  invoiceId: string;
  eventType: 'created' | 'sent' | 'delivered' | 'viewed' | 'paid' | 'cancelled' | 'edited';
  channel?: 'email' | 'whatsapp' | 'manual' | 'system';
  metadata?: any;
  performedBy?: string;
  timestamp: Timestamp;
}

// ============================================================================
// COLLECTION NAMES
// ============================================================================

export const Collections = {
  TENANTS: 'tenants',
  USERS: 'users',
  TENANT_USERS: 'tenantUsers',
  CLIENTS: 'clients',
  PRODUCTS: 'products',
  INVOICES: 'invoices',
  PAYMENTS: 'payments',
  INVOICE_EVENTS: 'invoiceEvents',
  COMMUNICATION_LOGS: 'communicationLogs',
  INTEGRATIONS: 'integrations',
  AUDIT_LOGS: 'auditLogs',
  RECURRING_INVOICES: 'recurringInvoices',
  SVAT_VOUCHERS: 'svatVouchers',
} as const;

// ============================================================================
// BASE FIRESTORE SERVICE
// ============================================================================

export class MultiTenantFirestoreService {
  /**
   * Create a document with automatic timestamp and ID generation
   */
  async create<T extends { tenantId?: string }>(
    collection: string,
    data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<T> {
    const docRef = db.collection(collection).doc();

    const now = Timestamp.now();
    const docData = {
      ...data,
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
    } as T;

    await docRef.set(docData);
    return docData;
  }

  /**
   * Get a document by ID
   */
  async get<T>(collection: string, id: string): Promise<T | null> {
    const doc = await db.collection(collection).doc(id).get();
    return doc.exists ? (doc.data() as T) : null;
  }

  /**
   * Update a document
   */
  async update<T>(
    collection: string,
    id: string,
    data: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    await db
      .collection(collection)
      .doc(id)
      .update({
        ...data,
        updatedAt: Timestamp.now(),
      });
  }

  /**
   * Delete a document
   */
  async delete(collection: string, id: string): Promise<void> {
    await db.collection(collection).doc(id).delete();
  }

  /**
   * List documents with optional filtering, ordering, and pagination
   */
  async list<T>(
    collection: string,
    options?: {
      tenantId?: string;
      filters?: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>;
      orderBy?: { field: string; direction: 'asc' | 'desc' };
      limit?: number;
      startAfter?: any;
    }
  ): Promise<T[]> {
    let query: FirebaseFirestore.Query = db.collection(collection);

    // Apply tenant filter
    if (options?.tenantId) {
      query = query.where('tenantId', '==', options.tenantId);
    }

    // Apply additional filters
    if (options?.filters) {
      for (const filter of options.filters) {
        query = query.where(filter.field, filter.operator, filter.value);
      }
    }

    // Apply ordering
    if (options?.orderBy) {
      query = query.orderBy(options.orderBy.field, options.orderBy.direction);
    }

    // Apply pagination
    if (options?.startAfter) {
      query = query.startAfter(options.startAfter);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as T);
  }

  /**
   * Count documents matching criteria
   */
  async count(
    collection: string,
    options?: {
      tenantId?: string;
      filters?: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>;
    }
  ): Promise<number> {
    let query: FirebaseFirestore.Query = db.collection(collection);

    if (options?.tenantId) {
      query = query.where('tenantId', '==', options.tenantId);
    }

    if (options?.filters) {
      for (const filter of options.filters) {
        query = query.where(filter.field, filter.operator, filter.value);
      }
    }

    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  /**
   * Batch write operations
   */
  async batchWrite(operations: Array<{
    type: 'create' | 'update' | 'delete';
    collection: string;
    id?: string;
    data?: any;
  }>): Promise<void> {
    const batch = db.batch();

    for (const op of operations) {
      const docRef = op.id
        ? db.collection(op.collection).doc(op.id)
        : db.collection(op.collection).doc();

      switch (op.type) {
        case 'create':
          batch.set(docRef, {
            ...op.data,
            id: docRef.id,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
          break;
        case 'update':
          batch.update(docRef, {
            ...op.data,
            updatedAt: Timestamp.now(),
          });
          break;
        case 'delete':
          batch.delete(docRef);
          break;
      }
    }

    await batch.commit();
  }
}

// ============================================================================
// SPECIALIZED SERVICES
// ============================================================================

export class TenantService extends MultiTenantFirestoreService {
  /**
   * Create a new tenant with initial configuration
   */
  async createTenant(data: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<Tenant> {
    const tenant = await this.create<Tenant>(Collections.TENANTS, {
      ...data,
      status: 'active',
    } as any);

    return tenant;
  }

  /**
   * Get next invoice number for a tenant
   */
  async getNextInvoiceNumber(tenantId: string): Promise<string> {
    const tenant = await this.get<Tenant>(Collections.TENANTS, tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const nextNumber = tenant.invoiceConfig.nextNumber;
    const invoiceNumber = `${tenant.invoiceConfig.prefix}${String(nextNumber).padStart(5, '0')}`;

    // Increment the counter
    await db
      .collection(Collections.TENANTS)
      .doc(tenantId)
      .update({
        'invoiceConfig.nextNumber': FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      });

    return invoiceNumber;
  }
}

export class InvoiceService extends MultiTenantFirestoreService {
  /**
   * Create invoice with automatic number generation
   */
  async createInvoice(
    data: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt'>
  ): Promise<Invoice> {
    const tenantService = new TenantService();
    const invoiceNumber = await tenantService.getNextInvoiceNumber(data.tenantId);

    const invoice = await this.create<Invoice>(Collections.INVOICES, {
      ...data,
      invoiceNumber,
    } as any);

    // Create invoice event
    await this.create<InvoiceEvent>(Collections.INVOICE_EVENTS, {
      tenantId: data.tenantId,
      invoiceId: invoice.id,
      eventType: 'created',
      channel: 'system',
      performedBy: data.createdBy,
      timestamp: Timestamp.now(),
    } as any);

    return invoice;
  }

  /**
   * Get invoice with related data
   */
  async getInvoiceWithDetails(invoiceId: string): Promise<Invoice | null> {
    const invoice = await this.get<Invoice>(Collections.INVOICES, invoiceId);
    if (!invoice) return null;

    // Fetch related client data if needed
    // Fetch related events, payments, etc.

    return invoice;
  }

  /**
   * Update invoice status
   */
  async updateStatus(
    invoiceId: string,
    status: Invoice['status'],
    performedBy: string
  ): Promise<void> {
    const invoice = await this.get<Invoice>(Collections.INVOICES, invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    await this.update<Invoice>(Collections.INVOICES, invoiceId, { status } as any);

    // Log event
    await this.create<InvoiceEvent>(Collections.INVOICE_EVENTS, {
      tenantId: invoice.tenantId,
      invoiceId,
      eventType: 'edited',
      metadata: { statusChange: { from: invoice.status, to: status } },
      performedBy,
      timestamp: Timestamp.now(),
    } as any);
  }

  /**
   * Record payment and update invoice
   */
  async recordPayment(paymentData: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> {
    const invoice = await this.get<Invoice>(Collections.INVOICES, paymentData.invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    // Create payment record
    const payment = await this.create<Payment>(Collections.PAYMENTS, paymentData as any);

    // Update invoice amounts
    const newAmountPaid = invoice.amountPaid + paymentData.amount;
    const newAmountDue = invoice.total - newAmountPaid;
    const newStatus = newAmountDue <= 0 ? 'paid' : 'partial_paid';

    await this.update<Invoice>(Collections.INVOICES, invoice.id, {
      amountPaid: newAmountPaid,
      amountDue: newAmountDue,
      status: newStatus,
    } as any);

    // Log event
    await this.create<InvoiceEvent>(Collections.INVOICE_EVENTS, {
      tenantId: invoice.tenantId,
      invoiceId: invoice.id,
      eventType: 'paid',
      metadata: { paymentId: payment.id, amount: paymentData.amount },
      performedBy: paymentData.recordedBy,
      timestamp: Timestamp.now(),
    } as any);

    return payment;
  }
}

export class ClientService extends MultiTenantFirestoreService {
  /**
   * Search clients by name or email
   */
  async search(tenantId: string, searchTerm: string, limit: number = 10): Promise<Client[]> {
    // Firestore doesn't support full-text search natively
    // For production, consider using Algolia or Typesense
    const clients = await this.list<Client>(Collections.CLIENTS, {
      tenantId,
      limit: 50, // Fetch more and filter client-side
    });

    const searchLower = searchTerm.toLowerCase();
    return clients
      .filter(
        client =>
          client.name.toLowerCase().includes(searchLower) ||
          client.email?.toLowerCase().includes(searchLower)
      )
      .slice(0, limit);
  }
}

// ============================================================================
// EXPORT INSTANCES
// ============================================================================

export const tenantService = new TenantService();
export const invoiceService = new InvoiceService();
export const clientService = new ClientService();
export const productService = new MultiTenantFirestoreService();
export const paymentService = new MultiTenantFirestoreService();
