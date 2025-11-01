import request from 'supertest';
import app from '../../index';
import { prisma } from '../setup';

describe('Tracking Routes', () => {
  let testInvoice: any;

  beforeEach(async () => {
    // Create test business and invoice
    const business = await prisma.business.create({
      data: {
        name: 'Test Business',
        legalName: 'Test Business Ltd',
        address: '123 Test St, Colombo',
        vatNumber: 'VAT123456',
      },
    });

    testInvoice = await prisma.invoice.create({
      data: {
        businessId: business.id,
        invoiceNumber: 'INV-001',
        invoiceSequence: 1,
        customerName: 'Test Customer',
        customerEmail: 'test@example.com',
        dateIssued: new Date(),
        currency: 'LKR',
        subtotal: 1000,
        taxTotal: 150,
        total: 1150,
      },
    });
  });

  describe('GET /track/open/:trackingId.png', () => {
    it('should return tracking pixel and log open event', async () => {
      // Generate a tracking ID (simplified for test)
      const trackingId = Buffer.from(JSON.stringify({ 
        id: testInvoice.id, 
        sig: 'test-signature' 
      })).toString('base64url');

      const response = await request(app)
        .get(`/track/open/${trackingId}.png`)
        .expect(200);

      // Check that content type is image/png
      expect(response.headers['content-type']).toBe('image/png');

      // Check that tracking event was created
      const trackingEvent = await prisma.trackingEvent.findFirst({
        where: {
          invoiceId: testInvoice.id,
          kind: 'EMAIL_OPEN',
        },
      });

      expect(trackingEvent).toBeTruthy();
      expect(trackingEvent?.metadata).toHaveProperty('timestamp');
    });

    it('should still return pixel even with invalid tracking ID', async () => {
      const response = await request(app)
        .get('/track/open/invalid-tracking-id.png')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/png');
    });
  });

  describe('GET /track/click/:trackingId', () => {
    it('should log click event and redirect', async () => {
      const trackingId = Buffer.from(JSON.stringify({ 
        id: testInvoice.id, 
        sig: 'test-signature' 
      })).toString('base64url');

      const redirectUrl = 'http://localhost:3000/invoice/123';

      const response = await request(app)
        .get(`/track/click/${trackingId}?r=${encodeURIComponent(redirectUrl)}`)
        .expect(302);

      // Check redirect location
      expect(response.headers.location).toBe(redirectUrl);

      // Check that tracking event was created
      const trackingEvent = await prisma.trackingEvent.findFirst({
        where: {
          invoiceId: testInvoice.id,
          kind: 'LINK_CLICK',
        },
      });

      expect(trackingEvent).toBeTruthy();
      expect(trackingEvent?.metadata).toHaveProperty('redirectUrl', redirectUrl);
    });

    it('should redirect to default URL with invalid tracking ID', async () => {
      const response = await request(app)
        .get('/track/click/invalid-tracking-id')
        .expect(302);

      expect(response.headers.location).toBe('http://localhost:3000');
    });
  });
});