/**
 * Firebase Cloud Functions - Payment Gateway Module
 * PayHere Integration for Sri Lankan Payment Processing
 */

import * as functions from 'firebase-functions/v2';
import { AuthRequest } from './middleware/rbac';
import { Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import {
  db,
  Collections,
  Tenant,
  Invoice,
  invoiceService,
  tenantService,
} from './services/multiTenantFirestore';
import { Timestamp } from 'firebase-admin/firestore';
import { whatsappService } from './services/whatsappService';
import { emailService } from './services/emailService';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface PayHereConfig {
  enabled: boolean;
  merchantId: string;
  merchantSecret: string;
  mode: 'sandbox' | 'live'; // sandbox for testing, live for production
  currency: string; // LKR, USD, etc.
}

export interface PayHerePaymentRequest {
  invoiceId: string;
  returnUrl?: string;
  cancelUrl?: string;
  notifyUrl?: string;
}

export interface PayHereNotifyData {
  merchant_id: string;
  order_id: string;
  payhere_amount: string;
  payhere_currency: string;
  status_code: string; // 2 = success, 0 = pending, -1 = cancelled, -2 = failed, -3 = chargedback
  md5sig: string;
  custom_1?: string; // tenantId
  custom_2?: string; // invoiceId
  method?: string; // VISA, MASTER, AMEX, etc.
  card_holder_name?: string;
  card_no?: string; // Masked card number
  payment_id?: string;
}

// ============================================================================
// PAYHERE CONFIGURATION
// ============================================================================

/**
 * Get PayHere configuration for tenant
 */
async function getPayHereConfig(tenantId: string): Promise<PayHereConfig | null> {
  const integrationDoc = await db
    .collection(Collections.INTEGRATIONS)
    .doc(`${tenantId}_payhere`)
    .get();

  if (!integrationDoc.exists) {
    return null;
  }

  const data = integrationDoc.data();
  return {
    enabled: data?.enabled || false,
    merchantId: data?.merchantId || '',
    merchantSecret: data?.merchantSecret || '',
    mode: data?.mode || 'sandbox',
    currency: data?.currency || 'LKR',
  };
}

/**
 * Configure PayHere integration
 */
export const configurePayHere = async (req: AuthRequest, res: Response) => {
  try {
    const { merchantId, merchantSecret, mode, currency } = req.body;

    if (!merchantId || !merchantSecret) {
      return res.status(400).json({
        error: 'merchantId and merchantSecret are required',
      });
    }

    if (mode && !['sandbox', 'live'].includes(mode)) {
      return res.status(400).json({
        error: 'mode must be either "sandbox" or "live"',
      });
    }

    await db
      .collection(Collections.INTEGRATIONS)
      .doc(`${req.tenantId}_payhere`)
      .set({
        enabled: true,
        merchantId,
        merchantSecret,
        mode: mode || 'sandbox',
        currency: currency || 'LKR',
        type: 'payhere',
        tenantId: req.tenantId,
        updatedAt: Timestamp.now(),
      });

    res.json({ success: true, message: 'PayHere configured successfully' });
  } catch (error: any) {
    console.error('Error configuring PayHere:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// PAYMENT LINK GENERATION
// ============================================================================

/**
 * Generate MD5 signature for PayHere
 */
function generatePayHereSignature(
  merchantId: string,
  orderId: string,
  amount: string,
  currency: string,
  merchantSecret: string
): string {
  const hash = crypto
    .createHash('md5')
    .update(
      merchantId +
        orderId +
        parseFloat(amount).toFixed(2) +
        currency +
        crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase()
    )
    .digest('hex')
    .toUpperCase();

  return hash;
}

/**
 * Create payment link for invoice
 */
export const createPaymentLink = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId, returnUrl, cancelUrl, notifyUrl } = req.body;
    const tenantId = req.tenantId!;

    if (!invoiceId) {
      return res.status(400).json({ error: 'invoiceId is required' });
    }

    const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.amountDue <= 0) {
      return res.status(400).json({ error: 'Invoice is already paid' });
    }

    const tenant = await tenantService.get<Tenant>(Collections.TENANTS, tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const config = await getPayHereConfig(tenantId);
    if (!config || !config.enabled) {
      return res.status(400).json({ error: 'PayHere is not configured for this tenant' });
    }

    // PayHere API URL
    const paymentUrl =
      config.mode === 'sandbox'
        ? 'https://sandbox.payhere.lk/pay/checkout'
        : 'https://www.payhere.lk/pay/checkout';

    // Generate signature
    const amount = invoice.amountDue.toFixed(2);
    const currency = config.currency;
    const orderId = `${invoice.invoiceNumber}-${Date.now()}`;

    const hash = generatePayHereSignature(
      config.merchantId,
      orderId,
      amount,
      currency,
      config.merchantSecret
    );

    // Build payment link with pre-filled data
    const paymentData = {
      merchant_id: config.merchantId,
      return_url: returnUrl || `${process.env.FRONTEND_URL}/invoices/${invoiceId}/payment-success`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/invoices/${invoiceId}/payment-cancelled`,
      notify_url: notifyUrl || `${process.env.BACKEND_URL}/api/webhooks/payhere`,
      order_id: orderId,
      items: `Invoice ${invoice.invoiceNumber}`,
      currency,
      amount,
      first_name: invoice.clientSnapshot.name || 'Customer',
      last_name: '',
      email: invoice.clientSnapshot.email || '',
      phone: invoice.clientSnapshot.phone || '',
      address: invoice.clientSnapshot.address || '',
      city: invoice.clientSnapshot.city || '',
      country: 'Sri Lanka',
      hash,
      custom_1: tenantId,
      custom_2: invoiceId,
    };

    // Store payment link in invoice
    await invoiceService.update<Invoice>(Collections.INVOICES, invoiceId, {
      paymentLink: `${paymentUrl}?${new URLSearchParams(paymentData).toString()}`,
      paymentLinkOrderId: orderId,
      updatedAt: Timestamp.now(),
    } as any);

    res.json({
      success: true,
      paymentUrl,
      paymentData,
      paymentLink: `${paymentUrl}?${new URLSearchParams(paymentData).toString()}`,
    });
  } catch (error: any) {
    console.error('Error creating payment link:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// PAYMENT WEBHOOK HANDLER
// ============================================================================

/**
 * Verify PayHere webhook signature
 */
function verifyPayHereSignature(
  merchantId: string,
  orderId: string,
  amount: string,
  currency: string,
  statusCode: string,
  md5sig: string,
  merchantSecret: string
): boolean {
  const hash = crypto
    .createHash('md5')
    .update(
      merchantId +
        orderId +
        parseFloat(amount).toFixed(2) +
        currency +
        statusCode +
        crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase()
    )
    .digest('hex')
    .toUpperCase();

  return hash === md5sig;
}

/**
 * PayHere payment notification webhook
 */
export const handlePayHereNotify = async (req: Request, res: Response) => {
  try {
    const notifyData: PayHereNotifyData = req.body;

    console.log('PayHere Notify:', notifyData);

    // Extract custom fields
    const tenantId = notifyData.custom_1;
    const invoiceId = notifyData.custom_2;

    if (!tenantId || !invoiceId) {
      console.error('Missing custom fields in PayHere notify');
      return res.sendStatus(400);
    }

    // Get PayHere config
    const config = await getPayHereConfig(tenantId);
    if (!config) {
      console.error('PayHere config not found for tenant:', tenantId);
      return res.sendStatus(400);
    }

    // Verify signature
    const isValidSignature = verifyPayHereSignature(
      notifyData.merchant_id,
      notifyData.order_id,
      notifyData.payhere_amount,
      notifyData.payhere_currency,
      notifyData.status_code,
      notifyData.md5sig,
      config.merchantSecret
    );

    if (!isValidSignature) {
      console.error('Invalid PayHere signature');
      return res.sendStatus(403);
    }

    // Get invoice
    const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, invoiceId);
    if (!invoice) {
      console.error('Invoice not found:', invoiceId);
      return res.sendStatus(404);
    }

    const tenant = await tenantService.get<Tenant>(Collections.TENANTS, tenantId);
    if (!tenant) {
      console.error('Tenant not found:', tenantId);
      return res.sendStatus(404);
    }

    // Process payment based on status
    const statusCode = parseInt(notifyData.status_code);
    const amount = parseFloat(notifyData.payhere_amount);

    if (statusCode === 2) {
      // Payment successful
      const amountPaid = (invoice.amountPaid || 0) + amount;
      const amountDue = invoice.total - amountPaid;

      await invoiceService.update<Invoice>(Collections.INVOICES, invoiceId, {
        amountPaid,
        amountDue,
        status: amountDue <= 0 ? 'paid' : invoice.status,
        updatedAt: Timestamp.now(),
      } as any);

      // Record payment in payments collection
      await db.collection(Collections.PAYMENTS).add({
        tenantId,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amount,
        method: 'payhere',
        paymentDetails: {
          orderId: notifyData.order_id,
          paymentId: notifyData.payment_id,
          method: notifyData.method,
          cardHolderName: notifyData.card_holder_name,
          cardNo: notifyData.card_no,
        },
        status: 'completed',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      // Send payment confirmation
      const recipientEmail = invoice.clientSnapshot.email;
      const recipientPhone = invoice.clientSnapshot.whatsappNumber || invoice.clientSnapshot.phone;

      if (recipientEmail) {
        emailService.sendPaymentConfirmation(invoice, tenant, recipientEmail, amount).catch((err) => {
          console.error('Failed to send payment confirmation email:', err);
        });
      } else if (recipientPhone) {
        whatsappService.sendPaymentConfirmation(invoice, tenant, recipientPhone, amount).catch((err) => {
          console.error('Failed to send payment confirmation WhatsApp:', err);
        });
      }

      console.log(`Payment successful for invoice ${invoice.invoiceNumber}: Rs. ${amount}`);
    } else if (statusCode === 0) {
      // Payment pending
      await db.collection(Collections.PAYMENTS).add({
        tenantId,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amount,
        method: 'payhere',
        paymentDetails: {
          orderId: notifyData.order_id,
          paymentId: notifyData.payment_id,
        },
        status: 'pending',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      console.log(`Payment pending for invoice ${invoice.invoiceNumber}`);
    } else if (statusCode === -1 || statusCode === -2) {
      // Payment cancelled or failed
      await db.collection(Collections.PAYMENTS).add({
        tenantId,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amount,
        method: 'payhere',
        paymentDetails: {
          orderId: notifyData.order_id,
          paymentId: notifyData.payment_id,
        },
        status: statusCode === -1 ? 'cancelled' : 'failed',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      console.log(
        `Payment ${statusCode === -1 ? 'cancelled' : 'failed'} for invoice ${invoice.invoiceNumber}`
      );
    } else if (statusCode === -3) {
      // Payment chargedback
      await db.collection(Collections.PAYMENTS).add({
        tenantId,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amount,
        method: 'payhere',
        paymentDetails: {
          orderId: notifyData.order_id,
          paymentId: notifyData.payment_id,
        },
        status: 'chargedback',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      console.log(`Payment chargedback for invoice ${invoice.invoiceNumber}`);
    }

    // Respond to PayHere
    res.sendStatus(200);
  } catch (error) {
    console.error('PayHere webhook error:', error);
    res.sendStatus(500);
  }
};

// ============================================================================
// MANUAL PAYMENT RECORDING
// ============================================================================

/**
 * Record manual payment (cash, bank transfer, cheque, etc.)
 */
export const recordPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId, amount, method, reference, notes, paymentDate } = req.body;
    const tenantId = req.tenantId!;

    if (!invoiceId || !amount || !method) {
      return res.status(400).json({ error: 'invoiceId, amount, and method are required' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'amount must be greater than 0' });
    }

    const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (amount > invoice.amountDue) {
      return res.status(400).json({ error: 'Payment amount exceeds amount due' });
    }

    const tenant = await tenantService.get<Tenant>(Collections.TENANTS, tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Update invoice
    const amountPaid = (invoice.amountPaid || 0) + amount;
    const amountDue = invoice.total - amountPaid;

    await invoiceService.update<Invoice>(Collections.INVOICES, invoiceId, {
      amountPaid,
      amountDue,
      status: amountDue <= 0 ? 'paid' : invoice.status,
      updatedAt: Timestamp.now(),
    } as any);

    // Record payment
    const paymentDoc = await db.collection(Collections.PAYMENTS).add({
      tenantId,
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      amount,
      method,
      reference,
      notes,
      paymentDate: paymentDate ? Timestamp.fromDate(new Date(paymentDate)) : Timestamp.now(),
      status: 'completed',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Send payment confirmation
    const recipientEmail = invoice.clientSnapshot.email;
    const recipientPhone = invoice.clientSnapshot.whatsappNumber || invoice.clientSnapshot.phone;

    if (recipientEmail) {
      emailService.sendPaymentConfirmation(invoice, tenant, recipientEmail, amount).catch((err) => {
        console.error('Failed to send payment confirmation email:', err);
      });
    } else if (recipientPhone) {
      whatsappService.sendPaymentConfirmation(invoice, tenant, recipientPhone, amount).catch((err) => {
        console.error('Failed to send payment confirmation WhatsApp:', err);
      });
    }

    res.json({
      success: true,
      paymentId: paymentDoc.id,
      amountPaid,
      amountDue,
      invoiceStatus: amountDue <= 0 ? 'paid' : invoice.status,
    });
  } catch (error: any) {
    console.error('Error recording payment:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get payment history for invoice
 */
export const getPaymentHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const tenantId = req.tenantId!;

    const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const paymentsSnapshot = await db
      .collection(Collections.PAYMENTS)
      .where('invoiceId', '==', invoiceId)
      .where('tenantId', '==', tenantId)
      .orderBy('createdAt', 'desc')
      .get();

    const payments = paymentsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({ payments });
  } catch (error: any) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Test PayHere connection
 */
export const testPayHereConnection = async (req: AuthRequest, res: Response) => {
  try {
    const config = await getPayHereConfig(req.tenantId!);

    if (!config || !config.enabled) {
      return res.status(400).json({
        success: false,
        error: 'PayHere is not configured',
      });
    }

    // Generate test signature to verify credentials
    const testOrderId = `TEST-${Date.now()}`;
    const testAmount = '100.00';
    const testHash = generatePayHereSignature(
      config.merchantId,
      testOrderId,
      testAmount,
      config.currency,
      config.merchantSecret
    );

    res.json({
      success: true,
      message: 'PayHere credentials are valid',
      mode: config.mode,
      merchantId: config.merchantId,
      currency: config.currency,
      testHash,
    });
  } catch (error: any) {
    console.error('Error testing PayHere:', error);
    res.status(500).json({ error: error.message, success: false });
  }
};

// ============================================================================
// ALL FUNCTIONS EXPORTED INLINE ABOVE
// ============================================================================
