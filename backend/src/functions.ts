import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import {
  FirestoreService,
  InvoiceService,
  BusinessService,
  TrackingService,
  collections,
  db
} from './services/firestoreService';

// Initialize Firebase Admin
admin.initializeApp();

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
app.use(cors({
  origin: true, // Allow all origins for Firebase Functions
  credentials: true,
}));

app.use(compression());
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    service: 'Invoice Builder API'
  });
});

// API Routes

// Get businesses
app.get('/api/businesses', async (req, res) => {
  try {
    const businesses = await FirestoreService.list(collections.businesses);
    res.json({ businesses });
  } catch (error) {
    console.error('Get businesses error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get business by ID
app.get('/api/businesses/:id', async (req, res) => {
  try {
    const business = await FirestoreService.get(collections.businesses, req.params.id);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    return res.json(business);
  } catch (error) {
    console.error('Get business error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Create business
app.post('/api/businesses', async (req, res) => {
  try {
    const business = await FirestoreService.create(collections.businesses, req.body);
    res.status(201).json(business);
  } catch (error) {
    console.error('Create business error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get invoices for a business
app.get('/api/invoices', async (req, res) => {
  try {
    const { businessId, status, limit = 20 } = req.query;

    const filters: { field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }[] = [];
    if (businessId && typeof businessId === 'string') {
      filters.push({ field: 'businessId', operator: '==', value: businessId });
    }
    if (status && typeof status === 'string') {
      filters.push({ field: 'status', operator: '==', value: status });
    }

    const invoices = await FirestoreService.list(
      collections.invoices,
      filters.length > 0 ? filters : undefined,
      { field: 'dateIssued', direction: 'desc' },
      Number(limit)
    );

    res.json({ invoices });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get invoice by ID with details
app.get('/api/invoices/:id', async (req, res) => {
  try {
    const invoice = await InvoiceService.getInvoiceWithDetails(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    return res.json(invoice);
  } catch (error) {
    console.error('Get invoice error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Create invoice
app.post('/api/invoices', async (req, res) => {
  try {
    const invoice = await InvoiceService.createInvoice(req.body);
    res.status(201).json(invoice);
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get tracking events for an invoice
app.get('/api/invoices/:id/tracking', async (req, res) => {
  try {
    const events = await TrackingService.getInvoiceTrackingEvents(req.params.id);
    res.json({ events });
  } catch (error) {
    console.error('Get tracking events error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get products for a business
app.get('/api/products', async (req, res) => {
  try {
    const { businessId } = req.query;

    const filters = (businessId && typeof businessId === 'string')
      ? [{ field: 'businessId', operator: '==' as FirebaseFirestore.WhereFilterOp, value: businessId }]
      : undefined;

    const products = await FirestoreService.list(
      collections.products,
      filters,
      { field: 'name', direction: 'asc' }
    );

    res.json({ products });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get contacts for a business
app.get('/api/contacts', async (req, res) => {
  try {
    const { businessId } = req.query;

    const filters = (businessId && typeof businessId === 'string')
      ? [{ field: 'businessId', operator: '==' as FirebaseFirestore.WhereFilterOp, value: businessId }]
      : undefined;

    const contacts = await FirestoreService.list(
      collections.contacts,
      filters,
      { field: 'name', direction: 'asc' }
    );

    res.json({ contacts });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Export the API as a Firebase Function (Gen2)
export const api = functions.https.onRequest({
  timeoutSeconds: 60,
  memory: '256MiB',
  cors: true
}, app);

// Additional Firebase Functions

// Auto-track invoice creation
export const onInvoiceCreated = functions.firestore.onDocumentCreated(
  'invoices/{invoiceId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const invoiceData = snap.data();
    const invoiceId = event.params.invoiceId;

    console.log('📄 Invoice created:', invoiceId);

    // Record creation event
    await TrackingService.recordEvent(invoiceId, 'INVOICE_CREATED', {
      invoiceNumber: invoiceData.invoiceNumber,
      businessId: invoiceData.businessId,
      total: invoiceData.total,
      timestamp: new Date().toISOString(),
    });

    return null;
  }
);

// Track invoice status changes
export const onInvoiceUpdated = functions.firestore.onDocumentUpdated(
  'invoices/{invoiceId}',
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

    const invoiceId = event.params.invoiceId;

    // Track status changes
    if (beforeData.status !== afterData.status) {
      console.log(`📊 Invoice ${invoiceId} status changed: ${beforeData.status} → ${afterData.status}`);

      await TrackingService.recordEvent(invoiceId, 'STATUS_CHANGE', {
        from: beforeData.status,
        to: afterData.status,
        timestamp: new Date().toISOString(),
      });
    }

    return null;
  }
);

// Send invoice reminders for overdue invoices
export const sendInvoiceReminders = functions.scheduler.onSchedule(
  {
    schedule: 'every day 10:00',
    timeZone: 'Asia/Colombo'
  },
  async (event) => {
    console.log('🔔 Running daily invoice reminder job');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Query overdue invoices
    const overdueInvoices = await db.collection(collections.invoices)
      .where('status', 'in', ['SENT', 'VIEWED', 'PARTIAL_PAID'])
      .where('dueDate', '<', today)
      .get();

    console.log(`Found ${overdueInvoices.size} overdue invoices`);

    // Update status to OVERDUE
    const batch = db.batch();
    overdueInvoices.docs.forEach(doc => {
      if (doc.data().status !== 'OVERDUE') {
        batch.update(doc.ref, { status: 'OVERDUE' });
      }
    });

    await batch.commit();

    console.log('✅ Invoice reminder job completed');
  }
);