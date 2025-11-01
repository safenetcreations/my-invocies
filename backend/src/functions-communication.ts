/**
 * Firebase Cloud Functions - Communication Module
 * Handles WhatsApp, Email, and Communication Tracking
 */

import * as functions from 'firebase-functions/v2';
import express, { Request, Response } from 'express';
import { whatsappService } from './services/whatsappService';
import { emailService } from './services/emailService';
import {
  invoiceService,
  tenantService,
  Collections,
  Tenant,
  Invoice,
  db,
} from './services/multiTenantFirestore';
import { AuthRequest } from './middleware/rbac';

// ============================================================================
// INVOICE DELIVERY HANDLERS
// ============================================================================

/**
 * Send invoice via email
 */
export const sendInvoiceEmail = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId, recipientEmail } = req.body;

    if (!invoiceId || !recipientEmail) {
      return res.status(400).json({ error: 'invoiceId and recipientEmail are required' });
    }

    const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, invoiceId);
    if (!invoice || invoice.tenantId !== req.tenantId) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const tenant = await tenantService.get<Tenant>(Collections.TENANTS, req.tenantId!);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const result = await emailService.sendInvoice(invoice, tenant, recipientEmail);

    // Update invoice status if it was draft
    if (invoice.status === 'draft') {
      await invoiceService.update<Invoice>(Collections.INVOICES, invoiceId, {
        status: 'sent',
      } as any);
    }

    res.json({
      success: true,
      messageId: result.messageId,
      status: result.status,
    });
  } catch (error: any) {
    console.error('Error sending invoice email:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Send invoice via WhatsApp
 */
export const sendInvoiceWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId, recipientPhone } = req.body;

    if (!invoiceId || !recipientPhone) {
      return res.status(400).json({ error: 'invoiceId and recipientPhone are required' });
    }

    const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, invoiceId);
    if (!invoice || invoice.tenantId !== req.tenantId) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const tenant = await tenantService.get<Tenant>(Collections.TENANTS, req.tenantId!);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const result = await whatsappService.sendInvoice(invoice, tenant, recipientPhone);

    // Update invoice status if it was draft
    if (invoice.status === 'draft') {
      await invoiceService.update<Invoice>(Collections.INVOICES, invoiceId, {
        status: 'sent',
      } as any);
    }

    res.json({
      success: true,
      messageId: result.messageId,
      status: result.status,
    });
  } catch (error: any) {
    console.error('Error sending invoice WhatsApp:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Send payment reminder
 */
export const sendPaymentReminder = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId, channel, recipient } = req.body;

    if (!invoiceId || !channel || !recipient) {
      return res.status(400).json({ error: 'invoiceId, channel, and recipient are required' });
    }

    const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, invoiceId);
    if (!invoice || invoice.tenantId !== req.tenantId) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const tenant = await tenantService.get<Tenant>(Collections.TENANTS, req.tenantId!);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    let result;

    if (channel === 'email') {
      result = await emailService.sendPaymentReminder(invoice, tenant, recipient);
    } else if (channel === 'whatsapp') {
      result = await whatsappService.sendPaymentReminder(invoice, tenant, recipient);
    } else {
      return res.status(400).json({ error: 'Invalid channel. Must be "email" or "whatsapp"' });
    }

    res.json({
      success: true,
      messageId: result.messageId,
      status: result.status,
      channel,
    });
  } catch (error: any) {
    console.error('Error sending payment reminder:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get communication history for invoice
 */
export const getCommunicationHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await invoiceService.get<Invoice>(Collections.INVOICES, invoiceId);
    if (!invoice || invoice.tenantId !== req.tenantId) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const history = await whatsappService.getCommunicationHistory(invoiceId);

    res.json({ history });
  } catch (error: any) {
    console.error('Error fetching communication history:', error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================================================
// WHATSAPP INTEGRATION
// ============================================================================

/**
 * Configure WhatsApp integration
 */
export const configureWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const { phoneNumberId, accessToken, businessAccountId, webhookVerifyToken } = req.body;

    if (!phoneNumberId || !accessToken || !businessAccountId) {
      return res.status(400).json({
        error: 'phoneNumberId, accessToken, and businessAccountId are required',
      });
    }

    await whatsappService.configureWhatsApp(req.tenantId!, {
      enabled: true,
      phoneNumberId,
      accessToken,
      businessAccountId,
      webhookVerifyToken: webhookVerifyToken || '',
    });

    res.json({ success: true, message: 'WhatsApp configured successfully' });
  } catch (error: any) {
    console.error('Error configuring WhatsApp:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Test WhatsApp connection
 */
export const testWhatsAppConnection = async (req: AuthRequest, res: Response) => {
  try {
    const { testPhone } = req.body;

    if (!testPhone) {
      return res.status(400).json({ error: 'testPhone is required' });
    }

    const success = await whatsappService.testConnection(req.tenantId!, testPhone);

    res.json({ success, message: success ? 'Test message sent successfully' : 'Test failed' });
  } catch (error: any) {
    console.error('Error testing WhatsApp:', error);
    res.status(500).json({ error: error.message, success: false });
  }
};

/**
 * WhatsApp webhook verification (GET)
 */
export const verifyWhatsAppWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'my_verify_token';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    console.error('WhatsApp webhook verification failed');
    res.sendStatus(403);
  }
};

/**
 * WhatsApp webhook handler (POST)
 */
export const handleWhatsAppWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    // Verify webhook signature (optional but recommended)
    const signature = req.headers['x-hub-signature-256'] as string;
    const appSecret = process.env.WHATSAPP_APP_SECRET || '';

    if (signature && appSecret) {
      const rawBody = JSON.stringify(payload);
      const isValid = whatsappService.verifyWebhookSignature(rawBody, signature, appSecret);

      if (!isValid) {
        console.error('Invalid webhook signature');
        return res.sendStatus(403);
      }
    }

    // Process webhook asynchronously
    whatsappService.handleWebhook(payload).catch((error) => {
      console.error('Error processing WhatsApp webhook:', error);
    });

    // Respond immediately to WhatsApp
    res.sendStatus(200);
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.sendStatus(500);
  }
};

// ============================================================================
// EMAIL / GMAIL INTEGRATION
// ============================================================================

/**
 * Configure email integration (SMTP)
 */
export const configureEmail = async (req: AuthRequest, res: Response) => {
  try {
    const { type, host, port, secure, username, password, senderName, replyTo } = req.body;

    if (type === 'smtp') {
      if (!host || !port || !username || !password) {
        return res.status(400).json({
          error: 'host, port, username, and password are required for SMTP',
        });
      }

      await emailService.configureEmail(req.tenantId!, {
        enabled: true,
        type: 'smtp',
        host,
        port,
        secure: secure || false,
        username,
        password,
        senderName,
        replyTo,
      });

      res.json({ success: true, message: 'SMTP configured successfully' });
    } else {
      return res.status(400).json({ error: 'Use Gmail OAuth flow for Gmail setup' });
    }
  } catch (error: any) {
    console.error('Error configuring email:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get Gmail OAuth authorization URL
 */
export const getGmailAuthUrl = (req: AuthRequest, res: Response) => {
  try {
    const authUrl = emailService.getGmailAuthUrl(req.tenantId!);
    res.json({ authUrl });
  } catch (error: any) {
    console.error('Error getting Gmail auth URL:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Handle Gmail OAuth callback
 */
export const handleGmailCallback = async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;
    const tenantId = state as string;

    if (!code || !tenantId) {
      return res.status(400).json({ error: 'code and state (tenantId) are required' });
    }

    const { email, refreshToken } = await emailService.handleGmailCallback(
      code as string,
      tenantId
    );

    // Save to Firestore
    await emailService.configureEmail(tenantId, {
      enabled: true,
      type: 'gmail_oauth',
      email,
      refreshToken,
      senderName: email,
      replyTo: email,
    });

    res.send(`
      <html>
        <body>
          <h1>✓ Gmail Connected Successfully!</h1>
          <p>Email: ${email}</p>
          <p>You can close this window and return to the app.</p>
          <script>
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('Error handling Gmail callback:', error);
    res.status(500).send(`
      <html>
        <body>
          <h1>✗ Gmail Connection Failed</h1>
          <p>Error: ${error.message}</p>
          <p>Please try again.</p>
        </body>
      </html>
    `);
  }
};

/**
 * Test email connection
 */
export const testEmailConnection = async (req: AuthRequest, res: Response) => {
  try {
    const { testEmail } = req.body;

    if (!testEmail) {
      return res.status(400).json({ error: 'testEmail is required' });
    }

    const success = await emailService.testConnection(req.tenantId!, testEmail);

    res.json({ success, message: success ? 'Test email sent successfully' : 'Test failed' });
  } catch (error: any) {
    console.error('Error testing email:', error);
    res.status(500).json({ error: error.message, success: false });
  }
};

// ============================================================================
// TRACKING ENDPOINTS
// ============================================================================

/**
 * Track email open (via tracking pixel)
 */
export const trackEmailOpen = async (req: Request, res: Response) => {
  try {
    const { communicationLogId } = req.params;

    // Track asynchronously
    emailService.trackEmailOpen(communicationLogId).catch((error) => {
      console.error('Error tracking email open:', error);
    });

    // Return 1x1 transparent PNG
    const transparentPixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(transparentPixel);
  } catch (error) {
    console.error('Tracking pixel error:', error);
    res.sendStatus(204);
  }
};

/**
 * Track email link click
 */
export const trackEmailClick = async (req: Request, res: Response) => {
  try {
    const { communicationLogId } = req.params;
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'url parameter is required' });
    }

    // Track asynchronously
    emailService.trackEmailClick(communicationLogId, url as string).catch((error) => {
      console.error('Error tracking email click:', error);
    });

    // Redirect to target URL
    res.redirect(url as string);
  } catch (error) {
    console.error('Track click error:', error);
    res.sendStatus(404);
  }
};

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

/**
 * Send automated payment reminders (daily)
 */
export const sendAutomatedReminders = functions.scheduler.onSchedule(
  {
    schedule: 'every day 09:00',
    timeZone: 'Asia/Colombo',
  },
  async (event) => {
    console.log('Running automated payment reminders job');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find invoices that are overdue
      const overdueInvoices = await db
        .collection(Collections.INVOICES)
        .where('status', 'in', ['sent', 'delivered', 'viewed', 'overdue'])
        .where('dateDue', '<', today)
        .where('amountDue', '>', 0)
        .get();

      console.log(`Found ${overdueInvoices.size} overdue invoices`);

      let remindersSent = 0;

      for (const doc of overdueInvoices.docs) {
        const invoice = doc.data() as Invoice;

        // Get tenant
        const tenant = await tenantService.get<Tenant>(Collections.TENANTS, invoice.tenantId);
        if (!tenant) continue;

        // Get client's preferred contact method
        const recipientEmail = invoice.clientSnapshot.email;
        const recipientPhone = invoice.clientSnapshot.whatsappNumber || invoice.clientSnapshot.phone;

        try {
          // Try email first
          if (recipientEmail) {
            await emailService.sendPaymentReminder(invoice, tenant, recipientEmail);
            remindersSent++;
          }
          // Fallback to WhatsApp if email not available
          else if (recipientPhone) {
            await whatsappService.sendPaymentReminder(invoice, tenant, recipientPhone);
            remindersSent++;
          }

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Failed to send reminder for invoice ${invoice.id}:`, error);
        }
      }

      console.log(`Automated reminders job completed. Sent ${remindersSent} reminders.`);
    } catch (error) {
      console.error('Automated reminders job error:', error);
    }
  }
);

// ============================================================================
// ALL FUNCTIONS EXPORTED INLINE ABOVE
// ============================================================================
