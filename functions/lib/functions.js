"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInvoiceReminders = exports.onInvoiceUpdated = exports.onInvoiceCreated = exports.api = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const firestoreService_1 = require("./services/firestoreService");
admin.initializeApp();
const app = (0, express_1.default)();
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));
app.use((0, cors_1.default)({
    origin: true,
    credentials: true,
}));
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)('combined'));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        service: 'Invoice Builder API'
    });
});
app.get('/api/businesses', async (req, res) => {
    try {
        const businesses = await firestoreService_1.FirestoreService.list(firestoreService_1.collections.businesses);
        res.json({ businesses });
    }
    catch (error) {
        console.error('Get businesses error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/businesses/:id', async (req, res) => {
    try {
        const business = await firestoreService_1.FirestoreService.get(firestoreService_1.collections.businesses, req.params.id);
        if (!business) {
            return res.status(404).json({ error: 'Business not found' });
        }
        return res.json(business);
    }
    catch (error) {
        console.error('Get business error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
app.post('/api/businesses', async (req, res) => {
    try {
        const business = await firestoreService_1.FirestoreService.create(firestoreService_1.collections.businesses, req.body);
        res.status(201).json(business);
    }
    catch (error) {
        console.error('Create business error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/invoices', async (req, res) => {
    try {
        const { businessId, status, limit = 20 } = req.query;
        const filters = [];
        if (businessId && typeof businessId === 'string') {
            filters.push({ field: 'businessId', operator: '==', value: businessId });
        }
        if (status && typeof status === 'string') {
            filters.push({ field: 'status', operator: '==', value: status });
        }
        const invoices = await firestoreService_1.FirestoreService.list(firestoreService_1.collections.invoices, filters.length > 0 ? filters : undefined, { field: 'dateIssued', direction: 'desc' }, Number(limit));
        res.json({ invoices });
    }
    catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/invoices/:id', async (req, res) => {
    try {
        const invoice = await firestoreService_1.InvoiceService.getInvoiceWithDetails(req.params.id);
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        return res.json(invoice);
    }
    catch (error) {
        console.error('Get invoice error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});
app.post('/api/invoices', async (req, res) => {
    try {
        const invoice = await firestoreService_1.InvoiceService.createInvoice(req.body);
        res.status(201).json(invoice);
    }
    catch (error) {
        console.error('Create invoice error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/invoices/:id/tracking', async (req, res) => {
    try {
        const events = await firestoreService_1.TrackingService.getInvoiceTrackingEvents(req.params.id);
        res.json({ events });
    }
    catch (error) {
        console.error('Get tracking events error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/products', async (req, res) => {
    try {
        const { businessId } = req.query;
        const filters = (businessId && typeof businessId === 'string')
            ? [{ field: 'businessId', operator: '==', value: businessId }]
            : undefined;
        const products = await firestoreService_1.FirestoreService.list(firestoreService_1.collections.products, filters, { field: 'name', direction: 'asc' });
        res.json({ products });
    }
    catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/contacts', async (req, res) => {
    try {
        const { businessId } = req.query;
        const filters = (businessId && typeof businessId === 'string')
            ? [{ field: 'businessId', operator: '==', value: businessId }]
            : undefined;
        const contacts = await firestoreService_1.FirestoreService.list(firestoreService_1.collections.contacts, filters, { field: 'name', direction: 'asc' });
        res.json({ contacts });
    }
    catch (error) {
        console.error('Get contacts error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
exports.api = functions.https.onRequest({
    timeoutSeconds: 60,
    memory: '256MiB',
    cors: true
}, app);
exports.onInvoiceCreated = functions.firestore.onDocumentCreated('invoices/{invoiceId}', async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const invoiceData = snap.data();
    const invoiceId = event.params.invoiceId;
    console.log('📄 Invoice created:', invoiceId);
    await firestoreService_1.TrackingService.recordEvent(invoiceId, 'INVOICE_CREATED', {
        invoiceNumber: invoiceData.invoiceNumber,
        businessId: invoiceData.businessId,
        total: invoiceData.total,
        timestamp: new Date().toISOString(),
    });
    return null;
});
exports.onInvoiceUpdated = functions.firestore.onDocumentUpdated('invoices/{invoiceId}', async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData)
        return;
    const invoiceId = event.params.invoiceId;
    if (beforeData.status !== afterData.status) {
        console.log(`📊 Invoice ${invoiceId} status changed: ${beforeData.status} → ${afterData.status}`);
        await firestoreService_1.TrackingService.recordEvent(invoiceId, 'STATUS_CHANGE', {
            from: beforeData.status,
            to: afterData.status,
            timestamp: new Date().toISOString(),
        });
    }
    return null;
});
exports.sendInvoiceReminders = functions.scheduler.onSchedule({
    schedule: 'every day 10:00',
    timeZone: 'Asia/Colombo'
}, async (event) => {
    console.log('🔔 Running daily invoice reminder job');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueInvoices = await firestoreService_1.db.collection(firestoreService_1.collections.invoices)
        .where('status', 'in', ['SENT', 'VIEWED', 'PARTIAL_PAID'])
        .where('dueDate', '<', today)
        .get();
    console.log(`Found ${overdueInvoices.size} overdue invoices`);
    const batch = firestoreService_1.db.batch();
    overdueInvoices.docs.forEach(doc => {
        if (doc.data().status !== 'OVERDUE') {
            batch.update(doc.ref, { status: 'OVERDUE' });
        }
    });
    await batch.commit();
    console.log('✅ Invoice reminder job completed');
});
