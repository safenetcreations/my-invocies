import request from 'supertest';
import app from '../../index';
import { prisma } from '../setup';

describe('Invoice Routes', () => {
  let testUser: any;
  let testBusiness: any;
  let authToken: string;

  beforeEach(async () => {
    // Create test user and business
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        password: 'hashedpassword',
        name: 'Test User',
      },
    });

    testBusiness = await prisma.business.create({
      data: {
        name: 'Test Business',
        legalName: 'Test Business Ltd',
        address: '123 Test St, Colombo',
        vatNumber: 'VAT123456',
        businessUsers: {
          create: {
            userId: testUser.id,
            role: 'OWNER',
          },
        },
      },
    });

    // Mock JWT token
    authToken = 'Bearer mock-jwt-token';
  });

  describe('POST /:businessId', () => {
    it('should create invoice with correct calculations', async () => {
      const invoiceData = {
        customerName: 'Test Customer',
        customerEmail: 'customer@example.com',
        dateIssued: '2025-10-31',
        currency: 'LKR',
        lineItems: [
          {
            description: 'Service A',
            quantity: 2,
            unitPrice: 1000,
            taxRate: 0.15,
          },
          {
            description: 'Service B',
            quantity: 1,
            unitPrice: 500,
            taxRate: 0.15,
          }
        ],
      };

      // Mock auth middleware for this test
      const response = await request(app)
        .post(`/api/invoices/${testBusiness.id}`)
        .set('Authorization', authToken)
        .send(invoiceData)
        .expect(201);

      const invoice = response.body;

      // Verify calculations
      expect(invoice.subtotal).toBe(2500); // (2 * 1000) + (1 * 500)
      expect(invoice.taxTotal).toBe(375);  // 2500 * 0.15
      expect(invoice.total).toBe(2875);    // 2500 + 375
      expect(invoice.lineItems).toHaveLength(2);
      
      // Verify invoice number format
      expect(invoice.invoiceNumber).toMatch(/^INV-\d{6}$/);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        customerName: '', // Empty required field
        lineItems: [], // Empty line items
      };

      const response = await request(app)
        .post(`/api/invoices/${testBusiness.id}`)
        .set('Authorization', authToken)
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /:businessId/:invoiceId/payments', () => {
    let testInvoice: any;

    beforeEach(async () => {
      testInvoice = await prisma.invoice.create({
        data: {
          businessId: testBusiness.id,
          invoiceNumber: 'INV-001',
          invoiceSequence: 1,
          customerName: 'Test Customer',
          dateIssued: new Date(),
          currency: 'LKR',
          subtotal: 1000,
          taxTotal: 150,
          total: 1150,
        },
      });
    });

    it('should record payment and update invoice status', async () => {
      const paymentData = {
        amount: 1150,
        paymentMethod: 'BANK_TRANSFER',
        dateReceived: '2025-10-31',
      };

      const response = await request(app)
        .post(`/api/invoices/${testBusiness.id}/${testInvoice.id}/payments`)
        .set('Authorization', authToken)
        .send(paymentData)
        .expect(201);

      // Verify payment record
      expect(response.body.amount).toBe(1150);
      expect(response.body.paymentMethod).toBe('BANK_TRANSFER');

      // Verify invoice status updated
      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: testInvoice.id },
      });

      expect(updatedInvoice?.status).toBe('PAID');
      expect(updatedInvoice?.amountPaid).toBe(1150);

      // Verify tracking event created
      const trackingEvent = await prisma.trackingEvent.findFirst({
        where: {
          invoiceId: testInvoice.id,
          kind: 'PAYMENT_RECEIVED',
        },
      });

      expect(trackingEvent).toBeTruthy();
    });

    it('should handle partial payments', async () => {
      const partialPayment = {
        amount: 500, // Partial amount
        paymentMethod: 'CASH',
      };

      await request(app)
        .post(`/api/invoices/${testBusiness.id}/${testInvoice.id}/payments`)
        .set('Authorization', authToken)
        .send(partialPayment)
        .expect(201);

      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: testInvoice.id },
      });

      expect(updatedInvoice?.status).toBe('PARTIAL_PAID');
      expect(updatedInvoice?.amountPaid).toBe(500);
    });
  });
});