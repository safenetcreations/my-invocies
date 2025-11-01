import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { authenticate, requireBusinessAccess, AuthRequest } from '../middleware/auth';
import { validateInvoice } from '../utils/validation';
import { generateInvoicePDF } from '../services/pdfService';
import { sendInvoiceEmail } from '../services/emailService';
import { sendInvoiceWhatsApp } from '../services/whatsappService';

const router = Router();

// Get invoices for a business
router.get('/:businessId', authenticate, requireBusinessAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    
    const where: any = {
      businessId: req.businessId,
    };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          contact: true,
          lineItems: {
            include: {
              product: true,
            },
          },
          payments: true,
          trackingEvents: {
            orderBy: { timestamp: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json({
      invoices,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single invoice
router.get('/:businessId/:invoiceId', authenticate, requireBusinessAccess, async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: req.params.invoiceId,
        businessId: req.businessId,
      },
      include: {
        business: true,
        contact: true,
        lineItems: {
          include: {
            product: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
        payments: {
          orderBy: { dateReceived: 'desc' },
        },
        trackingEvents: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create invoice
router.post('/:businessId', authenticate, requireBusinessAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { error } = validateInvoice(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Get business to determine next invoice number
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Calculate totals
    const { lineItems, ...invoiceData } = req.body;
    let subtotal = 0;
    let taxTotal = 0;

    const processedLineItems = lineItems.map((item: any, index: number) => {
      const lineTotal = item.quantity * item.unitPrice;
      const taxAmount = lineTotal * item.taxRate;
      
      subtotal += lineTotal;
      taxTotal += taxAmount;

      return {
        ...item,
        taxAmount,
        lineTotal: lineTotal + taxAmount,
        sortOrder: index,
      };
    });

    const total = subtotal + taxTotal;

    // Generate next invoice number
    const nextSequence = business.invoiceSequence + 1;
    const invoiceNumber = `${business.invoicePrefix}-${String(nextSequence).padStart(6, '0')}`;

    // Create invoice in transaction
    const invoice = await prisma.$transaction(async (tx) => {
      // Update business sequence
      await tx.business.update({
        where: { id: req.businessId },
        data: { invoiceSequence: nextSequence },
      });

      // Create invoice
      return tx.invoice.create({
        data: {
          ...invoiceData,
          businessId: req.businessId,
          invoiceNumber,
          invoiceSequence: nextSequence,
          subtotal,
          taxTotal,
          total,
          lineItems: {
            create: processedLineItems,
          },
        },
        include: {
          lineItems: true,
        },
      });
    });

    res.status(201).json(invoice);
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send invoice
router.post('/:businessId/:invoiceId/send', authenticate, requireBusinessAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { channels = ['email'], generatePdf = true } = req.body;
    const invoiceId = req.params.invoiceId;

    // Get full invoice data
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        businessId: req.businessId,
      },
      include: {
        business: true,
        lineItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status === 'DRAFT') {
      // Generate PDF if requested
      if (generatePdf) {
        // Convert invoice data to match InvoiceData interface
        const invoiceData = {
          ...invoice,
          dateIssued: invoice.dateIssued.toISOString().split('T')[0], // Convert Date to string
          dueDate: invoice.dueDate?.toISOString().split('T')[0],
          dateOfSupply: invoice.dateOfSupply?.toISOString().split('T')[0],
        };
        const pdfPath = await generateInvoicePDF(invoiceData as any);
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: { pdfUrl: pdfPath },
        });
        invoice.pdfUrl = pdfPath;
      }

      // Send via requested channels
      const promises = [];
      
      if (channels.includes('email') && invoice.customerEmail) {
        promises.push(sendInvoiceEmail(invoice));
      }
      
      if (channels.includes('whatsapp') && invoice.customerPhone) {
        promises.push(sendInvoiceWhatsApp(invoice));
      }

      await Promise.all(promises);

      // Update invoice status
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          sentVia: channels,
        },
      });
    }

    res.json({ message: 'Invoice sent successfully', channels });
  } catch (error) {
    console.error('Send invoice error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record payment
router.post('/:businessId/:invoiceId/payments', authenticate, requireBusinessAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { amount, paymentMethod, dateReceived, notes } = req.body;
    const invoiceId = req.params.invoiceId;

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        businessId: req.businessId,
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        invoiceId,
        amount: Number(amount),
        paymentMethod,
        dateReceived: dateReceived ? new Date(dateReceived) : new Date(),
        notes,
      },
    });

    // Update invoice status based on payment
    const totalPaid = invoice.amountPaid + Number(amount);
    let status = invoice.status;

    if (totalPaid >= invoice.total) {
      status = 'PAID';
    } else if (totalPaid > 0) {
      status = 'PARTIAL_PAID';
    }

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: totalPaid,
        status,
      },
    });

    // Record tracking event
    await prisma.trackingEvent.create({
      data: {
        invoiceId,
        kind: 'PAYMENT_RECEIVED',
        metadata: {
          amount: Number(amount),
          paymentMethod,
          totalPaid,
        },
      },
    });

    res.status(201).json(payment);
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;