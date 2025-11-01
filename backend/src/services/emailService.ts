/**
 * Email Service with Gmail OAuth Integration
 * Supports invoice delivery, notifications, and tracking
 */

import nodemailer, { Transporter } from 'nodemailer';
import { google } from 'googleapis';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { db, Collections, Invoice, Tenant } from './multiTenantFirestore';
import axios from 'axios';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface EmailConfig {
  enabled: boolean;
  type: 'gmail_oauth' | 'smtp';

  // Gmail OAuth fields
  email?: string;
  refreshToken?: string;

  // SMTP fields
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  password?: string;

  // Common fields
  senderName?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  messageId: string;
  status: 'sent' | 'failed';
  timestamp: Date;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// ============================================================================
// EMAIL SERVICE
// ============================================================================

export class EmailService {
  private transporterCache: Map<string, Transporter> = new Map();

  /**
   * Get email configuration for tenant
   */
  private async getEmailConfig(tenantId: string): Promise<EmailConfig | null> {
    const integrationDoc = await db
      .collection(Collections.INTEGRATIONS)
      .doc(`${tenantId}_email`)
      .get();

    if (!integrationDoc.exists) {
      return null;
    }

    const data = integrationDoc.data();
    return {
      enabled: data?.enabled || false,
      type: data?.type || 'smtp',
      email: data?.email,
      refreshToken: data?.refreshToken,
      host: data?.host,
      port: data?.port,
      secure: data?.secure,
      username: data?.username,
      password: data?.password,
      senderName: data?.senderName,
      replyTo: data?.replyTo,
    };
  }

  /**
   * Create email transporter (Gmail OAuth or SMTP)
   */
  private async createTransporter(tenantId: string): Promise<Transporter> {
    // Check cache first
    if (this.transporterCache.has(tenantId)) {
      return this.transporterCache.get(tenantId)!;
    }

    const config = await this.getEmailConfig(tenantId);
    if (!config || !config.enabled) {
      throw new Error('Email is not configured for this tenant');
    }

    let transporter: Transporter;

    if (config.type === 'gmail_oauth') {
      // Gmail OAuth setup
      const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        refresh_token: config.refreshToken,
      });

      const accessToken = await oauth2Client.getAccessToken();

      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: config.email!,
          clientId: process.env.GMAIL_CLIENT_ID,
          clientSecret: process.env.GMAIL_CLIENT_SECRET,
          refreshToken: config.refreshToken,
          accessToken: accessToken.token || undefined,
        },
      } as any);
    } else if (config.type === 'smtp') {
      // SMTP setup
      transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure || false,
        auth: {
          user: config.username,
          pass: config.password,
        },
      });
    } else {
      throw new Error('Unsupported email configuration type');
    }

    // Cache the transporter
    this.transporterCache.set(tenantId, transporter);

    return transporter;
  }

  /**
   * Generate tracking pixel URL
   */
  private generateTrackingPixelUrl(communicationLogId: string): string {
    const baseUrl = process.env.FRONTEND_URL || 'https://app.example.com';
    return `${baseUrl}/api/track/open/${communicationLogId}.png`;
  }

  /**
   * Generate tracked link URL
   */
  private generateTrackedLinkUrl(communicationLogId: string, targetUrl: string): string {
    const baseUrl = process.env.FRONTEND_URL || 'https://app.example.com';
    return `${baseUrl}/api/track/click/${communicationLogId}?url=${encodeURIComponent(targetUrl)}`;
  }

  /**
   * Generate invoice email HTML template
   */
  private generateInvoiceEmailHTML(
    invoice: Invoice,
    tenant: Tenant,
    trackingPixelUrl: string,
    invoiceViewUrl: string
  ): string {
    const primaryColor = tenant.branding?.primaryColor || '#2563eb';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice ${invoice.invoiceNumber}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .email-container {
            background-color: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
            background-color: ${primaryColor};
            color: white;
            padding: 30px 20px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .header p {
            margin: 10px 0 0;
            font-size: 16px;
            opacity: 0.9;
        }
        .content {
            padding: 30px 20px;
        }
        .greeting {
            font-size: 18px;
            margin-bottom: 20px;
        }
        .invoice-details {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 6px;
            margin: 20px 0;
            border-left: 4px solid ${primaryColor};
        }
        .invoice-details p {
            margin: 10px 0;
        }
        .invoice-details strong {
            color: #555;
            display: inline-block;
            min-width: 120px;
        }
        .button {
            display: inline-block;
            background-color: ${primaryColor};
            color: white;
            padding: 14px 28px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin: 20px 0;
            text-align: center;
        }
        .button:hover {
            opacity: 0.9;
        }
        .amount-highlight {
            font-size: 24px;
            color: ${primaryColor};
            font-weight: bold;
        }
        .footer {
            text-align: center;
            color: #666;
            font-size: 14px;
            padding: 20px;
            background-color: #f8f9fa;
            border-top: 1px solid #e0e0e0;
        }
        .footer p {
            margin: 5px 0;
        }
        @media only screen and (max-width: 600px) {
            body {
                padding: 10px;
            }
            .content {
                padding: 20px 15px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>${tenant.legalName}</h1>
            <p>Invoice ${invoice.invoiceNumber}</p>
        </div>

        <div class="content">
            <p class="greeting">Hello ${invoice.clientSnapshot.name},</p>

            <p>Thank you for your business! Please find your invoice details below:</p>

            <div class="invoice-details">
                <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
                <p><strong>Date Issued:</strong> ${invoice.dateIssued.toDate().toLocaleDateString('en-GB')}</p>
                ${invoice.dateDue ? `<p><strong>Due Date:</strong> ${invoice.dateDue.toDate().toLocaleDateString('en-GB')}</p>` : ''}
                ${invoice.dateOfSupply ? `<p><strong>Date of Supply:</strong> ${invoice.dateOfSupply.toDate().toLocaleDateString('en-GB')}</p>` : ''}
                <p><strong>Amount Due:</strong> <span class="amount-highlight">Rs. ${invoice.amountDue.toLocaleString()}</span></p>
                ${invoice.amountPaid > 0 ? `<p><strong>Amount Paid:</strong> Rs. ${invoice.amountPaid.toLocaleString()}</p>` : ''}
            </div>

            <div style="text-align: center;">
                <a href="${invoiceViewUrl}" class="button">View Invoice Online</a>
            </div>

            <p>The invoice PDF is attached to this email for your convenience.</p>

            ${invoice.notes ? `<p><strong>Notes:</strong><br>${invoice.notes}</p>` : ''}

            <p>If you have any questions about this invoice, please don't hesitate to contact us.</p>

            <p>Best regards,<br>
            <strong>${tenant.name}</strong></p>
        </div>

        <div class="footer">
            <p><strong>${tenant.legalName}</strong></p>
            <p>${tenant.address.line1}, ${tenant.address.city}</p>
            ${tenant.tin ? `<p>TIN: ${tenant.tin}</p>` : ''}
            ${tenant.taxConfig?.vatNumber ? `<p>VAT Reg: ${tenant.taxConfig.vatNumber}</p>` : ''}
        </div>
    </div>

    <!-- Tracking pixel -->
    <img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="">
</body>
</html>
    `.trim();
  }

  /**
   * Generate invoice email plain text version
   */
  private generateInvoiceEmailText(
    invoice: Invoice,
    tenant: Tenant,
    invoiceViewUrl: string
  ): string {
    return `
Hello ${invoice.clientSnapshot.name},

Thank you for your business! Please find your invoice details below:

Invoice Number: ${invoice.invoiceNumber}
Date Issued: ${invoice.dateIssued.toDate().toLocaleDateString('en-GB')}
${invoice.dateDue ? `Due Date: ${invoice.dateDue.toDate().toLocaleDateString('en-GB')}\n` : ''}${invoice.dateOfSupply ? `Date of Supply: ${invoice.dateOfSupply.toDate().toLocaleDateString('en-GB')}\n` : ''}Amount Due: Rs. ${invoice.amountDue.toLocaleString()}
${invoice.amountPaid > 0 ? `Amount Paid: Rs. ${invoice.amountPaid.toLocaleString()}\n` : ''}
You can view your invoice online at: ${invoiceViewUrl}

${invoice.notes ? `Notes: ${invoice.notes}\n\n` : ''}If you have any questions about this invoice, please don't hesitate to contact us.

Best regards,
${tenant.name}

---
${tenant.legalName}
${tenant.address.line1}, ${tenant.address.city}
${tenant.tin ? `TIN: ${tenant.tin}` : ''}
${tenant.taxConfig?.vatNumber ? `VAT Reg: ${tenant.taxConfig.vatNumber}` : ''}
    `.trim();
  }

  /**
   * Send invoice via email
   */
  async sendInvoice(
    invoice: Invoice,
    tenant: Tenant,
    recipientEmail: string
  ): Promise<EmailSendResult> {
    if (!invoice.pdfUrl) {
      throw new Error('Invoice PDF must be generated before sending');
    }

    const config = await this.getEmailConfig(tenant.id);
    if (!config) {
      throw new Error('Email not configured');
    }

    // Create communication log first to get tracking ID
    const logRef = await db.collection(Collections.COMMUNICATION_LOGS).add({
      tenantId: tenant.id,
      invoiceId: invoice.id,
      channel: 'email',
      recipient: recipientEmail,
      direction: 'outgoing',
      messageType: 'invoice_delivery',
      status: 'queued',
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        pdfUrl: invoice.pdfUrl,
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const trackingPixelUrl = this.generateTrackingPixelUrl(logRef.id);
    const invoiceViewUrl = invoice.publicViewUrl || `${process.env.FRONTEND_URL}/invoices/${invoice.id}/view`;

    const html = this.generateInvoiceEmailHTML(invoice, tenant, trackingPixelUrl, invoiceViewUrl);
    const text = this.generateInvoiceEmailText(invoice, tenant, invoiceViewUrl);

    const transporter = await this.createTransporter(tenant.id);

    try {
      // Download PDF from Firebase Storage
      let pdfBuffer: Buffer | undefined;
      if (invoice.pdfUrl) {
        const response = await axios.get(invoice.pdfUrl, { responseType: 'arraybuffer' });
        pdfBuffer = Buffer.from(response.data);
      }

      const mailOptions = {
        from: `${config.senderName || tenant.name} <${config.email || config.username}>`,
        replyTo: config.replyTo || config.email || config.username,
        to: recipientEmail,
        subject: `Invoice ${invoice.invoiceNumber} from ${tenant.name}`,
        text,
        html,
        attachments: pdfBuffer ? [
          {
            filename: `${invoice.invoiceNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ] : [],
      };

      const result = await transporter.sendMail(mailOptions);

      // Update communication log
      await logRef.update({
        messageId: result.messageId,
        status: 'sent',
        sentAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      return {
        messageId: result.messageId,
        status: 'sent',
        timestamp: new Date(),
      };
    } catch (error: any) {
      console.error('Email send error:', error);

      // Update communication log with error
      await logRef.update({
        status: 'failed',
        errorMessage: error.message,
        updatedAt: Timestamp.now(),
      });

      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Send payment reminder via email
   */
  async sendPaymentReminder(
    invoice: Invoice,
    tenant: Tenant,
    recipientEmail: string
  ): Promise<EmailSendResult> {
    const config = await this.getEmailConfig(tenant.id);
    if (!config) {
      throw new Error('Email not configured');
    }

    const daysOverdue = invoice.dateDue
      ? Math.floor((Date.now() - invoice.dateDue.toDate().getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const primaryColor = tenant.branding?.primaryColor || '#dc2626';

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Payment Reminder</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .warning-box {
            background-color: #fef2f2;
            border-left: 4px solid ${primaryColor};
            padding: 20px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .amount {
            font-size: 24px;
            color: ${primaryColor};
            font-weight: bold;
        }
        .button {
            display: inline-block;
            background-color: ${primaryColor};
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <h2>Payment Reminder</h2>

    <p>Hello ${invoice.clientSnapshot.name},</p>

    <p>This is a friendly reminder that payment for the following invoice is ${daysOverdue > 0 ? 'overdue' : 'due soon'}:</p>

    <div class="warning-box">
        <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
        <p><strong>Due Date:</strong> ${invoice.dateDue?.toDate().toLocaleDateString('en-GB')}</p>
        ${daysOverdue > 0 ? `<p><strong>Days Overdue:</strong> ${daysOverdue}</p>` : ''}
        <p><strong>Amount Due:</strong> <span class="amount">Rs. ${invoice.amountDue.toLocaleString()}</span></p>
    </div>

    <p>Please arrange payment at your earliest convenience.</p>

    <a href="${invoice.publicViewUrl || ''}" class="button">View Invoice</a>

    <p>If you have already made this payment, please disregard this reminder.</p>

    <p>Thank you,<br>${tenant.name}</p>
</body>
</html>
    `.trim();

    const text = `
Payment Reminder

Hello ${invoice.clientSnapshot.name},

This is a friendly reminder that payment for the following invoice is ${daysOverdue > 0 ? 'overdue' : 'due soon'}:

Invoice Number: ${invoice.invoiceNumber}
Due Date: ${invoice.dateDue?.toDate().toLocaleDateString('en-GB')}
${daysOverdue > 0 ? `Days Overdue: ${daysOverdue}\n` : ''}Amount Due: Rs. ${invoice.amountDue.toLocaleString()}

Please arrange payment at your earliest convenience.

View Invoice: ${invoice.publicViewUrl || 'Contact us for details'}

If you have already made this payment, please disregard this reminder.

Thank you,
${tenant.name}
    `.trim();

    const transporter = await this.createTransporter(tenant.id);

    try {
      const mailOptions = {
        from: `${config.senderName || tenant.name} <${config.email || config.username}>`,
        to: recipientEmail,
        subject: `Payment Reminder - Invoice ${invoice.invoiceNumber}`,
        text,
        html,
      };

      const result = await transporter.sendMail(mailOptions);

      // Log communication
      await db.collection(Collections.COMMUNICATION_LOGS).add({
        tenantId: tenant.id,
        invoiceId: invoice.id,
        channel: 'email',
        recipient: recipientEmail,
        messageId: result.messageId,
        direction: 'outgoing',
        messageType: 'payment_reminder',
        status: 'sent',
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          daysOverdue,
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      return {
        messageId: result.messageId,
        status: 'sent',
        timestamp: new Date(),
      };
    } catch (error: any) {
      throw new Error(`Failed to send reminder: ${error.message}`);
    }
  }

  /**
   * Configure email integration
   */
  async configureEmail(tenantId: string, config: EmailConfig): Promise<void> {
    await db
      .collection(Collections.INTEGRATIONS)
      .doc(`${tenantId}_email`)
      .set({
        ...config,
        type: config.type,
        tenantId,
        updatedAt: Timestamp.now(),
      });

    // Clear cache
    this.transporterCache.delete(tenantId);
  }

  /**
   * Test email connection
   */
  async testConnection(tenantId: string, testEmail: string): Promise<boolean> {
    try {
      const transporter = await this.createTransporter(tenantId);

      const result = await transporter.sendMail({
        to: testEmail,
        subject: 'Email Integration Test',
        text: 'Your email integration is working correctly!',
        html: '<p><strong>Success!</strong> Your email integration is working correctly.</p>',
      });

      return !!result.messageId;
    } catch (error) {
      console.error('Email test failed:', error);
      return false;
    }
  }

  /**
   * Get Gmail OAuth URL for authorization
   */
  getGmailAuthUrl(tenantId: string): string {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );

    const scopes = [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: tenantId, // Pass tenant ID in state
      prompt: 'consent',
    });
  }

  /**
   * Exchange Gmail OAuth code for tokens
   */
  async handleGmailCallback(code: string, tenantId: string): Promise<{ email: string; refreshToken: string }> {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user email
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    return {
      email: profile.data.emailAddress!,
      refreshToken: tokens.refresh_token!,
    };
  }

  /**
   * Track email open (when tracking pixel is loaded)
   */
  async trackEmailOpen(communicationLogId: string): Promise<void> {
    const logDoc = await db.collection(Collections.COMMUNICATION_LOGS).doc(communicationLogId).get();

    if (logDoc.exists) {
      const data = logDoc.data();

      await logDoc.ref.update({
        status: 'opened',
        openedAt: Timestamp.now(),
        openCount: (data?.openCount || 0) + 1,
        updatedAt: Timestamp.now(),
      });

      // Update invoice status if applicable
      if (data?.invoiceId) {
        const invoice = await db.collection(Collections.INVOICES).doc(data.invoiceId).get();

        if (invoice.exists && invoice.data()?.status === 'sent') {
          await invoice.ref.update({
            status: 'viewed',
            updatedAt: Timestamp.now(),
          });
        }
      }
    }
  }

  /**
   * Track email link click
   */
  async trackEmailClick(communicationLogId: string, targetUrl: string): Promise<string> {
    const logDoc = await db.collection(Collections.COMMUNICATION_LOGS).doc(communicationLogId).get();

    if (logDoc.exists) {
      const data = logDoc.data();

      await logDoc.ref.update({
        clickCount: (data?.clickCount || 0) + 1,
        lastClickedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }

    return targetUrl;
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const emailService = new EmailService();
