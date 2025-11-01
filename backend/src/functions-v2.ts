/**
 * Firebase Cloud Functions V2
 * Multi-Tenant Invoice Management System
 */

import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import multer from 'multer';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

// Import services
import {
  tenantService,
  invoiceService,
  clientService,
  productService,
  Collections,
  db,
  Tenant,
  Client,
  Product,
  Invoice,
  Payment,
} from './services/multiTenantFirestore';
import { authService } from './services/authService';
import { brandingService } from './services/brandingService';
import { taxService } from './services/taxService';
import { pdfGenerationService } from './services/pdfGenerationService';
import { taxReportingService } from './services/taxReportingService';
import {
  uploadLogo,
  updateBrandingColors,
  getBranding,
  reExtractColors,
} from './functions-branding';
import {
  sendInvoiceEmail,
  sendInvoiceWhatsApp,
  sendPaymentReminder,
  getCommunicationHistory,
  configureWhatsApp,
  testWhatsAppConnection,
  verifyWhatsAppWebhook,
  handleWhatsAppWebhook,
  configureEmail,
  getGmailAuthUrl,
  handleGmailCallback,
  testEmailConnection,
  trackEmailOpen,
  trackEmailClick,
} from './functions-communication';
import {
  generateInvoiceNumber,
  reserveInvoiceNumber,
  applyLateFee,
  updateInvoiceStatus,
  bulkDeleteInvoices,
  bulkUpdateInvoiceStatus,
} from './functions-invoicing';
import {
  configurePayHere,
  createPaymentLink,
  handlePayHereNotify,
  recordPayment,
  getPaymentHistory,
  testPayHereConnection,
} from './functions-payment';

// Import middleware
import {
  authenticate,
  requireAuth,
  requireTenantAccess,
  requirePermission,
  requireOwner,
  requireAdmin,
  validateTenantId,
  protectedRoute,
  adminRoute,
  ownerRoute,
  AuthRequest,
} from './middleware/rbac';

// ============================================================================
// EXPRESS APP SETUP
// ============================================================================

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({ origin: true, credentials: true }));

app.use(compression());
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Multi-Tenant Invoice SaaS API v2',
  });
});

// ============================================================================
// AUTH ROUTES
// ============================================================================

// Register new user and create their first tenant
app.post('/api/auth/register', async (req: AuthRequest, res) => {
  try {
    const { email, password, displayName, tenantData } = req.body;

    // Create user
    const userRecord = await authService.createUser(email, password, displayName);

    // Create tenant with user as owner
    const { tenantId, membershipId } = await authService.createTenantWithOwner(
      userRecord.uid,
      tenantData
    );

    res.status(201).json({
      message: 'User and tenant created successfully',
      userId: userRecord.uid,
      tenantId,
      membershipId,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Switch active tenant
app.post('/api/auth/switch-tenant', ...protectedRoute, async (req: AuthRequest, res) => {
  try {
    const { tenantId } = req.body;

    await authService.switchActiveTenant(req.user!.uid, tenantId);

    res.json({ message: 'Active tenant switched', tenantId });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get user's tenant memberships
app.get('/api/auth/memberships', ...protectedRoute, async (req: AuthRequest, res) => {
  try {
    const memberships = await authService.getUserTenantMemberships(req.user!.uid);

    res.json({ memberships });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TENANT ROUTES
// ============================================================================

// Get current tenant
app.get('/api/tenants/current', ...protectedRoute, async (req: AuthRequest, res) => {
  try {
    const tenant = await tenantService.get<Tenant>(Collections.TENANTS, req.tenantId!);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({ tenant });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update tenant
app.put(
  '/api/tenants/:tenantId',
  ...protectedRoute,
  requirePermission('tenants:update'),
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.params;

      // Ensure user can only update their active tenant
      if (tenantId !== req.tenantId) {
        return res.status(403).json({ error: 'Cannot update other tenants' });
      }

      await tenantService.update<Tenant>(Collections.TENANTS, tenantId, req.body);

      res.json({ message: 'Tenant updated successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Invite user to tenant
app.post(
  '/api/tenants/:tenantId/invite',
  ...adminRoute,
  async (req: AuthRequest, res) => {
    try {
      const { tenantId } = req.params;
      const { email, role } = req.body;

      const result = await authService.inviteUserToTenant(
        email,
        tenantId,
        role,
        req.user!.uid
      );

      res.status(201).json({
        message: 'User invited successfully',
        ...result,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Get tenant members
app.get('/api/tenants/:tenantId/members', ...adminRoute, async (req: AuthRequest, res) => {
  try {
    const { tenantId } = req.params;

    const members = await tenantService.list(Collections.TENANT_USERS, {
      filters: [{ field: 'tenantId', operator: '==', value: tenantId }],
    });

    res.json({ members });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update user role in tenant
app.put(
  '/api/tenants/:tenantId/members/:userId',
  ...adminRoute,
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, userId } = req.params;
      const { role } = req.body;

      await authService.updateUserRole(userId, tenantId, role);

      res.json({ message: 'User role updated successfully' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Remove user from tenant
app.delete(
  '/api/tenants/:tenantId/members/:userId',
  ...adminRoute,
  async (req: AuthRequest, res) => {
    try {
      const { tenantId, userId } = req.params;

      await authService.removeUserFromTenant(userId, tenantId);

      res.json({ message: 'User removed from tenant' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// ============================================================================
// BRANDING ROUTES
// ============================================================================

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, SVG, and WebP are allowed.'));
    }
  },
});

// Upload logo
app.post(
  '/api/tenants/:tenantId/branding/logo',
  ...protectedRoute,
  requirePermission('settings:update'),
  upload.single('logo'),
  uploadLogo
);

// Get branding
app.get(
  '/api/tenants/:tenantId/branding',
  ...protectedRoute,
  getBranding
);

// Update colors manually
app.put(
  '/api/tenants/:tenantId/branding/colors',
  ...protectedRoute,
  requirePermission('settings:update'),
  updateBrandingColors
);

// Re-extract colors from logo
app.post(
  '/api/tenants/:tenantId/branding/re-extract',
  ...protectedRoute,
  requirePermission('settings:update'),
  reExtractColors
);

// ============================================================================
// CLIENT ROUTES
// ============================================================================

// List clients
app.get(
  '/api/clients',
  ...protectedRoute,
  requirePermission('clients:read'),
  async (req: AuthRequest, res) => {
    try {
      const { search, limit = '20' } = req.query;

      let clients;
      if (search) {
        clients = await clientService.search(
          req.tenantId!,
          search as string,
          parseInt(limit as string)
        );
      } else {
        clients = await clientService.list<Client>(Collections.CLIENTS, {
          tenantId: req.tenantId,
          orderBy: { field: 'name', direction: 'asc' },
          limit: parseInt(limit as string),
        });
      }

      res.json({ clients });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get client by ID
app.get(
  '/api/clients/:id',
  ...protectedRoute,
  requirePermission('clients:read'),
  async (req: AuthRequest, res) => {
    try {
      const client = await clientService.get<Client>(Collections.CLIENTS, req.params.id);

      if (!client || client.tenantId !== req.tenantId) {
        return res.status(404).json({ error: 'Client not found' });
      }

      res.json({ client });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Create client
app.post(
  '/api/clients',
  ...protectedRoute,
  requirePermission('clients:create'),
  validateTenantId,
  async (req: AuthRequest, res) => {
    try {
      const client = await clientService.create<Client>(Collections.CLIENTS, req.body);

      res.status(201).json({ client });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Update client
app.put(
  '/api/clients/:id',
  ...protectedRoute,
  requirePermission('clients:update'),
  async (req: AuthRequest, res) => {
    try {
      const client = await clientService.get<Client>(Collections.CLIENTS, req.params.id);

      if (!client || client.tenantId !== req.tenantId) {
        return res.status(404).json({ error: 'Client not found' });
      }

      await clientService.update<Client>(Collections.CLIENTS, req.params.id, req.body);

      res.json({ message: 'Client updated successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete client
app.delete(
  '/api/clients/:id',
  ...protectedRoute,
  requirePermission('clients:delete'),
  async (req: AuthRequest, res) => {
    try {
      const client = await clientService.get<Client>(Collections.CLIENTS, req.params.id);

      if (!client || client.tenantId !== req.tenantId) {
        return res.status(404).json({ error: 'Client not found' });
      }

      await clientService.delete(Collections.CLIENTS, req.params.id);

      res.json({ message: 'Client deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================================================
// PRODUCT ROUTES
// ============================================================================

// List products
app.get(
  '/api/products',
  ...protectedRoute,
  requirePermission('products:read'),
  async (req: AuthRequest, res) => {
    try {
      const { isActive, limit = '50' } = req.query;

      const filters = isActive
        ? [{ field: 'isActive', operator: '==' as const, value: isActive === 'true' }]
        : undefined;

      const products = await productService.list<Product>(Collections.PRODUCTS, {
        tenantId: req.tenantId,
        filters,
        orderBy: { field: 'name', direction: 'asc' },
        limit: parseInt(limit as string),
      });

      res.json({ products });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Create product
app.post(
  '/api/products',
  ...protectedRoute,
  requirePermission('products:create'),
  validateTenantId,
  async (req: AuthRequest, res) => {
    try {
      const product = await productService.create<Product>(Collections.PRODUCTS, req.body);

      res.status(201).json({ product });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Update product
app.put(
  '/api/products/:id',
  ...protectedRoute,
  requirePermission('products:update'),
  async (req: AuthRequest, res) => {
    try {
      const product = await productService.get<Product>(Collections.PRODUCTS, req.params.id);

      if (!product || product.tenantId !== req.tenantId) {
        return res.status(404).json({ error: 'Product not found' });
      }

      await productService.update<Product>(Collections.PRODUCTS, req.params.id, req.body);

      res.json({ message: 'Product updated successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================================================
// INVOICE ROUTES
// ============================================================================

// List invoices
app.get(
  '/api/invoices',
  ...protectedRoute,
  requirePermission('invoices:read'),
  async (req: AuthRequest, res) => {
    try {
      const { status, clientId, limit = '20', startAfter } = req.query;

      const filters = [];
      if (status) filters.push({ field: 'status', operator: '==' as const, value: status });
      if (clientId) filters.push({ field: 'clientId', operator: '==' as const, value: clientId });

      const invoices = await invoiceService.list<Invoice>(Collections.INVOICES, {
        tenantId: req.tenantId,
        filters: filters.length > 0 ? filters : undefined,
        orderBy: { field: 'dateIssued', direction: 'desc' },
        limit: parseInt(limit as string),
        startAfter: startAfter ? JSON.parse(startAfter as string) : undefined,
      });

      res.json({ invoices });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get invoice by ID
app.get(
  '/api/invoices/:id',
  ...protectedRoute,
  requirePermission('invoices:read'),
  async (req: AuthRequest, res) => {
    try {
      const invoice = await invoiceService.getInvoiceWithDetails(req.params.id);

      if (!invoice || invoice.tenantId !== req.tenantId) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      res.json({ invoice });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Create invoice
app.post(
  '/api/invoices',
  ...protectedRoute,
  requirePermission('invoices:create'),
  validateTenantId,
  async (req: AuthRequest, res) => {
    try {
      const invoiceData = {
        ...req.body,
        createdBy: req.user!.uid,
      };

      const invoice = await invoiceService.createInvoice(invoiceData);

      res.status(201).json({ invoice });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Update invoice
app.put(
  '/api/invoices/:id',
  ...protectedRoute,
  requirePermission('invoices:update'),
  async (req: AuthRequest, res) => {
    try {
      const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, req.params.id);

      if (!invoice || invoice.tenantId !== req.tenantId) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Cannot edit paid or cancelled invoices
      if (invoice.status === 'paid' || invoice.status === 'cancelled') {
        return res.status(400).json({ error: 'Cannot edit paid or cancelled invoices' });
      }

      await invoiceService.update<Invoice>(Collections.INVOICES, req.params.id, req.body);

      res.json({ message: 'Invoice updated successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Update invoice status
app.patch(
  '/api/invoices/:id/status',
  ...protectedRoute,
  requirePermission('invoices:update'),
  async (req: AuthRequest, res) => {
    try {
      const { status } = req.body;

      await invoiceService.updateStatus(req.params.id, status, req.user!.uid);

      res.json({ message: 'Invoice status updated successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================================================
// INVOICING OPERATIONS
// ============================================================================

// Generate next invoice number
app.post(
  '/api/invoices/generate-number',
  ...protectedRoute,
  requirePermission('invoices:create'),
  generateInvoiceNumber
);

// Reserve invoice number (validate availability)
app.post(
  '/api/invoices/reserve-number',
  ...protectedRoute,
  requirePermission('invoices:create'),
  reserveInvoiceNumber
);

// Apply late fee to invoice
app.post(
  '/api/invoices/:invoiceId/late-fee',
  ...protectedRoute,
  requirePermission('invoices:update'),
  applyLateFee
);

// Update invoice status based on due date
app.post(
  '/api/invoices/:invoiceId/update-status',
  ...protectedRoute,
  requirePermission('invoices:update'),
  updateInvoiceStatus
);

// Bulk delete invoices
app.post(
  '/api/invoices/bulk-delete',
  ...protectedRoute,
  requirePermission('invoices:delete'),
  bulkDeleteInvoices
);

// Bulk update invoice status
app.post(
  '/api/invoices/bulk-update-status',
  ...protectedRoute,
  requirePermission('invoices:update'),
  bulkUpdateInvoiceStatus
);

// ============================================================================
// TAX CALCULATION & PDF ROUTES
// ============================================================================

// Calculate taxes for invoice
app.post(
  '/api/invoices/calculate-taxes',
  ...protectedRoute,
  async (req: AuthRequest, res) => {
    try {
      const { lineItems, clientId, dateOfSupply, invoiceType } = req.body;

      const tenant = await tenantService.get<Tenant>(Collections.TENANTS, req.tenantId!);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      let client;
      if (clientId) {
        client = await clientService.get<Client>(Collections.CLIENTS, clientId);
      }

      const taxCalculation = taxService.calculateInvoiceTaxes({
        tenant,
        client,
        lineItems,
        dateOfSupply: dateOfSupply ? new Date(dateOfSupply) : new Date(),
        invoiceType: invoiceType || 'tax_invoice',
      });

      res.json(taxCalculation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Validate invoice for tax compliance
app.post(
  '/api/invoices/validate',
  ...protectedRoute,
  async (req: AuthRequest, res) => {
    try {
      const { invoice, clientId } = req.body;

      const tenant = await tenantService.get<Tenant>(Collections.TENANTS, req.tenantId!);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      let client;
      if (clientId) {
        client = await clientService.get<Client>(Collections.CLIENTS, clientId);
      }

      const validation = taxService.validateTaxInvoice(invoice, tenant, client);

      res.json(validation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Generate PDF for invoice
app.post(
  '/api/invoices/:id/generate-pdf',
  ...protectedRoute,
  requirePermission('invoices:read'),
  async (req: AuthRequest, res) => {
    try {
      const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, req.params.id);

      if (!invoice || invoice.tenantId !== req.tenantId) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const tenant = await tenantService.get<Tenant>(Collections.TENANTS, req.tenantId!);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const pdfUrl = await pdfGenerationService.generateInvoicePDF(invoice, tenant);

      // Update invoice with PDF URL
      await invoiceService.update<Invoice>(Collections.INVOICES, invoice.id, {
        pdfUrl,
      } as any);

      res.json({ pdfUrl });
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Get invoice preview HTML
app.get(
  '/api/invoices/:id/preview',
  ...protectedRoute,
  requirePermission('invoices:read'),
  async (req: AuthRequest, res) => {
    try {
      const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, req.params.id);

      if (!invoice || invoice.tenantId !== req.tenantId) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const tenant = await tenantService.get<Tenant>(Collections.TENANTS, req.tenantId!);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const html = pdfGenerationService.generateInvoicePreview(invoice, tenant);

      res.set('Content-Type', 'text/html');
      res.send(html);
    } catch (error: any) {
      console.error('Error generating preview:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================================================
// PAYMENT ROUTES
// ============================================================================

// Record payment (legacy route - keeping for compatibility)
app.post(
  '/api/payments',
  ...protectedRoute,
  requirePermission('payments:create'),
  async (req: AuthRequest, res) => {
    try {
      const paymentData = {
        ...req.body,
        recordedBy: req.user!.uid,
      };

      const payment = await invoiceService.recordPayment(paymentData);

      res.status(201).json({ payment });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Record manual payment (new route with more features)
app.post(
  '/api/invoices/:invoiceId/payments',
  ...protectedRoute,
  requirePermission('payments:create'),
  recordPayment
);

// Get payments for invoice
app.get(
  '/api/invoices/:invoiceId/payments',
  ...protectedRoute,
  requirePermission('payments:read'),
  getPaymentHistory
);

// ============================================================================
// PAYHERE PAYMENT GATEWAY ROUTES
// ============================================================================

// Configure PayHere
app.post(
  '/api/integrations/payhere/configure',
  ...protectedRoute,
  requirePermission('settings:update'),
  configurePayHere
);

// Test PayHere connection
app.post(
  '/api/integrations/payhere/test',
  ...protectedRoute,
  requirePermission('settings:update'),
  testPayHereConnection
);

// Create payment link for invoice
app.post(
  '/api/invoices/:invoiceId/payment-link',
  ...protectedRoute,
  requirePermission('invoices:read'),
  createPaymentLink
);

// PayHere payment notification webhook (public - no auth)
app.post('/api/webhooks/payhere', handlePayHereNotify);

// ============================================================================
// TAX REPORTING ROUTES
// ============================================================================

// Generate VAT Return
app.post(
  '/api/tax-reports/vat-return',
  ...protectedRoute,
  requirePermission('reports:read'),
  async (req: AuthRequest, res) => {
    try {
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const vatReturn = await taxReportingService.generateVATReturn(
        req.tenantId!,
        new Date(startDate),
        new Date(endDate)
      );

      res.json({ vatReturn });
    } catch (error: any) {
      console.error('Error generating VAT return:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Generate VAT Return PDF
app.post(
  '/api/tax-reports/vat-return/pdf',
  ...protectedRoute,
  requirePermission('reports:read'),
  async (req: AuthRequest, res) => {
    try {
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const tenant = await tenantService.get<Tenant>(Collections.TENANTS, req.tenantId!);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const vatReturn = await taxReportingService.generateVATReturn(
        req.tenantId!,
        new Date(startDate),
        new Date(endDate)
      );

      const pdfUrl = await taxReportingService.generateVATReturnPDF(vatReturn, tenant);

      res.json({ pdfUrl, vatReturn });
    } catch (error: any) {
      console.error('Error generating VAT return PDF:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Generate SVAT Summary
app.post(
  '/api/tax-reports/svat-summary',
  ...protectedRoute,
  requirePermission('reports:read'),
  async (req: AuthRequest, res) => {
    try {
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const svatSummary = await taxReportingService.generateSVATSummary(
        req.tenantId!,
        new Date(startDate),
        new Date(endDate)
      );

      res.json({ svatSummary });
    } catch (error: any) {
      console.error('Error generating SVAT summary:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Generate Sales Register
app.post(
  '/api/tax-reports/sales-register',
  ...protectedRoute,
  requirePermission('reports:read'),
  async (req: AuthRequest, res) => {
    try {
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const salesRegister = await taxReportingService.generateSalesRegister(
        req.tenantId!,
        new Date(startDate),
        new Date(endDate)
      );

      res.json({ salesRegister });
    } catch (error: any) {
      console.error('Error generating sales register:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Export Sales Register to CSV
app.post(
  '/api/tax-reports/sales-register/export',
  ...protectedRoute,
  requirePermission('reports:read'),
  async (req: AuthRequest, res) => {
    try {
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const salesRegister = await taxReportingService.generateSalesRegister(
        req.tenantId!,
        new Date(startDate),
        new Date(endDate)
      );

      const csv = await taxReportingService.exportSalesRegisterToCSV(salesRegister);

      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="sales-register-${startDate}-${endDate}.csv"`);
      res.send(csv);
    } catch (error: any) {
      console.error('Error exporting sales register:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Generate Comprehensive Tax Report
app.post(
  '/api/tax-reports/comprehensive',
  ...protectedRoute,
  requirePermission('reports:read'),
  async (req: AuthRequest, res) => {
    try {
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const report = await taxReportingService.generateComprehensiveTaxReport(
        req.tenantId!,
        new Date(startDate),
        new Date(endDate)
      );

      res.json(report);
    } catch (error: any) {
      console.error('Error generating comprehensive report:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Get VAT filing period (helper endpoint)
app.get(
  '/api/tax-reports/vat-period/:year/:quarter',
  ...protectedRoute,
  requirePermission('reports:read'),
  async (req: AuthRequest, res) => {
    try {
      const year = parseInt(req.params.year);
      const quarter = parseInt(req.params.quarter);

      if (isNaN(year) || isNaN(quarter) || quarter < 1 || quarter > 4) {
        return res.status(400).json({ error: 'Invalid year or quarter' });
      }

      const period = taxReportingService.getVATFilingPeriod(year, quarter);

      res.json(period);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Check if VAT return is due
app.get(
  '/api/tax-reports/vat-due-check',
  ...protectedRoute,
  requirePermission('reports:read'),
  async (req: AuthRequest, res) => {
    try {
      const tenant = await tenantService.get<Tenant>(Collections.TENANTS, req.tenantId!);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const isDue = taxReportingService.isVATReturnDue(tenant);

      res.json({ isDue });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================================================
// COMMUNICATION ROUTES
// ============================================================================

// Send invoice via email
app.post(
  '/api/communication/send/email',
  ...protectedRoute,
  requirePermission('invoices:update'),
  sendInvoiceEmail
);

// Send invoice via WhatsApp
app.post(
  '/api/communication/send/whatsapp',
  ...protectedRoute,
  requirePermission('invoices:update'),
  sendInvoiceWhatsApp
);

// Send payment reminder
app.post(
  '/api/communication/reminder',
  ...protectedRoute,
  requirePermission('invoices:update'),
  sendPaymentReminder
);

// Get communication history for invoice
app.get(
  '/api/communication/history/:invoiceId',
  ...protectedRoute,
  requirePermission('invoices:read'),
  getCommunicationHistory
);

// ============================================================================
// WHATSAPP INTEGRATION ROUTES
// ============================================================================

// Configure WhatsApp
app.post(
  '/api/integrations/whatsapp/configure',
  ...protectedRoute,
  requirePermission('settings:update'),
  configureWhatsApp
);

// Test WhatsApp connection
app.post(
  '/api/integrations/whatsapp/test',
  ...protectedRoute,
  requirePermission('settings:update'),
  testWhatsAppConnection
);

// WhatsApp webhook verification (GET)
app.get('/api/webhooks/whatsapp', verifyWhatsAppWebhook);

// WhatsApp webhook handler (POST)
app.post('/api/webhooks/whatsapp', handleWhatsAppWebhook);

// ============================================================================
// EMAIL INTEGRATION ROUTES
// ============================================================================

// Configure email (SMTP)
app.post(
  '/api/integrations/email/configure',
  ...protectedRoute,
  requirePermission('settings:update'),
  configureEmail
);

// Get Gmail OAuth URL
app.get(
  '/api/integrations/gmail/auth-url',
  ...protectedRoute,
  requirePermission('settings:update'),
  getGmailAuthUrl
);

// Gmail OAuth callback (no auth required - handled by Google)
app.get('/api/integrations/gmail/callback', handleGmailCallback);

// Test email connection
app.post(
  '/api/integrations/email/test',
  ...protectedRoute,
  requirePermission('settings:update'),
  testEmailConnection
);

// ============================================================================
// TRACKING ROUTES (Public - no auth required)
// ============================================================================

// Track email open
app.get('/api/track/open/:communicationLogId.png', trackEmailOpen);

// Track email link click
app.get('/api/track/click/:communicationLogId', trackEmailClick);

// ============================================================================
// EXPORT API AS CLOUD FUNCTION
// ============================================================================

export const api = functions.https.onRequest(
  {
    timeoutSeconds: 60,
    memory: '512MiB',
    cors: true,
  },
  app
);

// ============================================================================
// FIRESTORE TRIGGERS
// ============================================================================

// Track invoice creation
export const onInvoiceCreated = functions.firestore.onDocumentCreated(
  'invoices/{invoiceId}',
  async (event) => {
    const invoiceData = event.data?.data();
    if (!invoiceData) return;

    console.log('Invoice created:', event.params.invoiceId);
  }
);

// Track invoice updates
export const onInvoiceUpdated = functions.firestore.onDocumentUpdated(
  'invoices/{invoiceId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) return;

    // Check for status changes
    if (before.status !== after.status) {
      console.log(
        `Invoice ${event.params.invoiceId} status changed: ${before.status} → ${after.status}`
      );
    }
  }
);

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

// Send invoice reminders daily
export const sendInvoiceReminders = functions.scheduler.onSchedule(
  {
    schedule: 'every day 10:00',
    timeZone: 'Asia/Colombo',
  },
  async (event) => {
    console.log('Running daily invoice reminder job');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find overdue invoices
    const overdueInvoices = await db
      .collection(Collections.INVOICES)
      .where('status', 'in', ['sent', 'delivered', 'viewed', 'partial_paid'])
      .where('dateDue', '<', admin.firestore.Timestamp.fromDate(today))
      .get();

    console.log(`Found ${overdueInvoices.size} overdue invoices`);

    // Update to overdue status
    const batch = db.batch();
    overdueInvoices.docs.forEach(doc => {
      if (doc.data().status !== 'overdue') {
        batch.update(doc.ref, {
          status: 'overdue',
          updatedAt: admin.firestore.Timestamp.now(),
        });
      }
    });

    await batch.commit();

    console.log('Invoice reminder job completed');
  }
);

// ============================================================================
// BRANDING FUNCTIONS (Storage Trigger)
// ============================================================================

// Export branding functions
export { onLogoUploaded } from './functions-branding';

// ============================================================================
// COMMUNICATION FUNCTIONS (Scheduled)
// ============================================================================

// Export communication scheduled functions
export { sendAutomatedReminders } from './functions-communication';

// ============================================================================
// INVOICING FUNCTIONS (Scheduled)
// ============================================================================

// Export invoicing scheduled functions
export { applyLateFees, updateAllInvoiceStatuses } from './functions-invoicing';
