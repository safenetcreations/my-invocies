/**
 * WhatsApp Business API Service
 * Integration with Meta WhatsApp Business Cloud API
 * Supports invoice delivery, notifications, and two-way communication
 */

import axios from 'axios';
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { db, Collections, Invoice, Tenant } from './multiTenantFirestore';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface WhatsAppConfig {
  enabled: boolean;
  phoneNumberId: string; // WhatsApp Business Phone Number ID
  accessToken: string; // Meta Graph API Access Token
  businessAccountId: string;
  webhookVerifyToken: string;
}

export interface WhatsAppMessage {
  to: string; // Phone number in international format (e.g., +94771234567)
  type: 'text' | 'template' | 'document';
  content: WhatsAppMessageContent;
}

export interface WhatsAppMessageContent {
  // For text messages
  text?: string;

  // For template messages
  templateName?: string;
  templateLanguage?: string;
  templateParameters?: string[];

  // For document messages (PDF invoices)
  documentUrl?: string;
  documentFilename?: string;
  documentCaption?: string;
}

export interface WhatsAppMessageResponse {
  messageId: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: {
            body: string;
          };
        }>;
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
          errors?: any[];
        }>;
      };
      field: string;
    }>;
  }>;
}

// ============================================================================
// WHATSAPP BUSINESS API SERVICE
// ============================================================================

export class WhatsAppService {
  private readonly baseUrl = 'https://graph.facebook.com/v18.0';

  /**
   * Get WhatsApp configuration for tenant
   */
  private async getWhatsAppConfig(tenantId: string): Promise<WhatsAppConfig | null> {
    const integrationDoc = await db
      .collection(Collections.INTEGRATIONS)
      .doc(`${tenantId}_whatsapp`)
      .get();

    if (!integrationDoc.exists) {
      return null;
    }

    const data = integrationDoc.data();
    return {
      enabled: data?.enabled || false,
      phoneNumberId: data?.phoneNumberId || '',
      accessToken: data?.accessToken || '',
      businessAccountId: data?.businessAccountId || '',
      webhookVerifyToken: data?.webhookVerifyToken || '',
    };
  }

  /**
   * Format phone number to international format
   */
  private formatPhoneNumber(phone: string, countryCode: string = '94'): string {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');

    // Remove leading zero if present
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }

    // Add country code if not present
    if (!cleaned.startsWith(countryCode)) {
      cleaned = countryCode + cleaned;
    }

    return '+' + cleaned;
  }

  /**
   * Send text message via WhatsApp
   */
  async sendTextMessage(
    tenantId: string,
    to: string,
    message: string
  ): Promise<WhatsAppMessageResponse> {
    const config = await this.getWhatsAppConfig(tenantId);
    if (!config || !config.enabled) {
      throw new Error('WhatsApp is not configured for this tenant');
    }

    const formattedPhone = this.formatPhoneNumber(to);

    try {
      const response = await axios.post(
        `${this.baseUrl}/${config.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'text',
          text: {
            preview_url: true,
            body: message,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        messageId: response.data.messages[0].id,
        status: 'queued',
        timestamp: new Date(),
      };
    } catch (error: any) {
      console.error('WhatsApp API Error:', error.response?.data || error.message);
      throw new Error(`Failed to send WhatsApp message: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Send template message via WhatsApp
   * Templates must be pre-approved by Meta
   */
  async sendTemplateMessage(
    tenantId: string,
    to: string,
    templateName: string,
    parameters: string[],
    language: string = 'en'
  ): Promise<WhatsAppMessageResponse> {
    const config = await this.getWhatsAppConfig(tenantId);
    if (!config || !config.enabled) {
      throw new Error('WhatsApp is not configured for this tenant');
    }

    const formattedPhone = this.formatPhoneNumber(to);

    try {
      const response = await axios.post(
        `${this.baseUrl}/${config.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: language,
            },
            components: [
              {
                type: 'body',
                parameters: parameters.map((param) => ({
                  type: 'text',
                  text: param,
                })),
              },
            ],
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        messageId: response.data.messages[0].id,
        status: 'queued',
        timestamp: new Date(),
      };
    } catch (error: any) {
      console.error('WhatsApp Template Error:', error.response?.data || error.message);
      throw new Error(`Failed to send template: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Send document (PDF invoice) via WhatsApp
   */
  async sendDocument(
    tenantId: string,
    to: string,
    documentUrl: string,
    filename: string,
    caption?: string
  ): Promise<WhatsAppMessageResponse> {
    const config = await this.getWhatsAppConfig(tenantId);
    if (!config || !config.enabled) {
      throw new Error('WhatsApp is not configured for this tenant');
    }

    const formattedPhone = this.formatPhoneNumber(to);

    try {
      const response = await axios.post(
        `${this.baseUrl}/${config.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'document',
          document: {
            link: documentUrl,
            filename: filename,
            caption: caption || '',
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        messageId: response.data.messages[0].id,
        status: 'queued',
        timestamp: new Date(),
      };
    } catch (error: any) {
      console.error('WhatsApp Document Error:', error.response?.data || error.message);
      throw new Error(`Failed to send document: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Send invoice via WhatsApp
   */
  async sendInvoice(
    invoice: Invoice,
    tenant: Tenant,
    recipientPhone: string
  ): Promise<WhatsAppMessageResponse> {
    if (!invoice.pdfUrl) {
      throw new Error('Invoice PDF must be generated before sending');
    }

    // Send document with invoice
    const caption = `Invoice ${invoice.invoiceNumber}\nAmount Due: Rs. ${invoice.amountDue.toLocaleString()}\nDue Date: ${invoice.dateDue?.toDate().toLocaleDateString('en-GB')}`;

    const result = await this.sendDocument(
      tenant.id,
      recipientPhone,
      invoice.pdfUrl,
      `${invoice.invoiceNumber}.pdf`,
      caption
    );

    // Log communication
    await this.logCommunication(tenant.id, invoice.id, {
      channel: 'whatsapp',
      recipient: recipientPhone,
      messageId: result.messageId,
      status: result.status,
      messageType: 'invoice_delivery',
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        pdfUrl: invoice.pdfUrl,
      },
    });

    return result;
  }

  /**
   * Send payment reminder via WhatsApp
   */
  async sendPaymentReminder(
    invoice: Invoice,
    tenant: Tenant,
    recipientPhone: string
  ): Promise<WhatsAppMessageResponse> {
    const daysOverdue = invoice.dateDue
      ? Math.floor((Date.now() - invoice.dateDue.toDate().getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const message = `
Hello,

This is a payment reminder for Invoice ${invoice.invoiceNumber}.

Amount Due: Rs. ${invoice.amountDue.toLocaleString()}
Due Date: ${invoice.dateDue?.toDate().toLocaleDateString('en-GB')}
${daysOverdue > 0 ? `Overdue by: ${daysOverdue} days\n` : ''}
Please arrange payment at your earliest convenience.

View Invoice: ${invoice.publicViewUrl || 'Contact us for details'}

Thank you,
${tenant.name}
    `.trim();

    const result = await this.sendTextMessage(tenant.id, recipientPhone, message);

    // Log communication
    await this.logCommunication(tenant.id, invoice.id, {
      channel: 'whatsapp',
      recipient: recipientPhone,
      messageId: result.messageId,
      status: result.status,
      messageType: 'payment_reminder',
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        daysOverdue,
      },
    });

    return result;
  }

  /**
   * Send payment confirmation via WhatsApp
   */
  async sendPaymentConfirmation(
    invoice: Invoice,
    tenant: Tenant,
    recipientPhone: string,
    amountPaid: number
  ): Promise<WhatsAppMessageResponse> {
    const message = `
Hello,

Payment Received! ✓

Invoice: ${invoice.invoiceNumber}
Amount Paid: Rs. ${amountPaid.toLocaleString()}
${invoice.amountDue > 0 ? `Remaining Balance: Rs. ${invoice.amountDue.toLocaleString()}` : 'Status: Fully Paid'}

Thank you for your payment!

${tenant.name}
    `.trim();

    const result = await this.sendTextMessage(tenant.id, recipientPhone, message);

    // Log communication
    await this.logCommunication(tenant.id, invoice.id, {
      channel: 'whatsapp',
      recipient: recipientPhone,
      messageId: result.messageId,
      status: result.status,
      messageType: 'payment_confirmation',
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        amountPaid,
      },
    });

    return result;
  }

  /**
   * Handle webhook from WhatsApp (status updates, incoming messages)
   */
  async handleWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        // Handle status updates (delivered, read, etc.)
        if (change.value.statuses) {
          for (const status of change.value.statuses) {
            await this.updateMessageStatus(status.id, status.status, status.timestamp);
          }
        }

        // Handle incoming messages (replies from clients)
        if (change.value.messages) {
          for (const message of change.value.messages) {
            await this.handleIncomingMessage(
              message.from,
              message.id,
              message.text?.body || '',
              message.timestamp
            );
          }
        }
      }
    }
  }

  /**
   * Update message status in communication log
   */
  private async updateMessageStatus(
    messageId: string,
    status: string,
    timestamp: string
  ): Promise<void> {
    const logsSnapshot = await db
      .collection(Collections.COMMUNICATION_LOGS)
      .where('messageId', '==', messageId)
      .limit(1)
      .get();

    if (!logsSnapshot.empty) {
      const logDoc = logsSnapshot.docs[0];
      await logDoc.ref.update({
        status,
        statusUpdatedAt: Timestamp.fromDate(new Date(parseInt(timestamp) * 1000)),
        updatedAt: Timestamp.now(),
      });

      // Update invoice status if delivered/read
      const logData = logDoc.data();
      if (logData.invoiceId && (status === 'delivered' || status === 'read')) {
        const invoice = await db.collection(Collections.INVOICES).doc(logData.invoiceId).get();

        if (invoice.exists) {
          const currentStatus = invoice.data()?.status;

          // Update invoice status progression
          if (status === 'delivered' && currentStatus === 'sent') {
            await invoice.ref.update({
              status: 'delivered',
              updatedAt: Timestamp.now(),
            });
          } else if (status === 'read' && (currentStatus === 'sent' || currentStatus === 'delivered')) {
            await invoice.ref.update({
              status: 'viewed',
              updatedAt: Timestamp.now(),
            });
          }
        }
      }
    }
  }

  /**
   * Handle incoming message from client
   */
  private async handleIncomingMessage(
    from: string,
    messageId: string,
    text: string,
    timestamp: string
  ): Promise<void> {
    // Log incoming message
    await db.collection(Collections.COMMUNICATION_LOGS).add({
      channel: 'whatsapp',
      direction: 'incoming',
      from,
      messageId,
      messageText: text,
      receivedAt: Timestamp.fromDate(new Date(parseInt(timestamp) * 1000)),
      createdAt: Timestamp.now(),
    });

    // TODO: Implement intelligent response handling
    // - Detect payment confirmations
    // - Answer FAQs
    // - Route to human agent
  }

  /**
   * Log communication event
   */
  private async logCommunication(
    tenantId: string,
    invoiceId: string,
    data: {
      channel: string;
      recipient: string;
      messageId: string;
      status: string;
      messageType: string;
      metadata?: any;
    }
  ): Promise<void> {
    await db.collection(Collections.COMMUNICATION_LOGS).add({
      tenantId,
      invoiceId,
      ...data,
      direction: 'outgoing',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Get communication history for invoice
   */
  async getCommunicationHistory(invoiceId: string): Promise<any[]> {
    const snapshot = await db
      .collection(Collections.COMMUNICATION_LOGS)
      .where('invoiceId', '==', invoiceId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  /**
   * Verify webhook signature (security)
   */
  verifyWebhookSignature(payload: string, signature: string, appSecret: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');

    return signature === `sha256=${expectedSignature}`;
  }

  /**
   * Configure WhatsApp integration for tenant
   */
  async configureWhatsApp(tenantId: string, config: WhatsAppConfig): Promise<void> {
    await db
      .collection(Collections.INTEGRATIONS)
      .doc(`${tenantId}_whatsapp`)
      .set({
        ...config,
        type: 'whatsapp',
        tenantId,
        updatedAt: Timestamp.now(),
      });
  }

  /**
   * Test WhatsApp connection
   */
  async testConnection(tenantId: string, testPhone: string): Promise<boolean> {
    try {
      await this.sendTextMessage(
        tenantId,
        testPhone,
        'WhatsApp Business API integration test successful! ✓'
      );
      return true;
    } catch (error) {
      console.error('WhatsApp test failed:', error);
      return false;
    }
  }

  /**
   * Get message templates (from Meta)
   */
  async getMessageTemplates(tenantId: string): Promise<any[]> {
    const config = await this.getWhatsAppConfig(tenantId);
    if (!config || !config.enabled) {
      throw new Error('WhatsApp is not configured');
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/${config.businessAccountId}/message_templates`,
        {
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
          },
        }
      );

      return response.data.data || [];
    } catch (error: any) {
      console.error('Failed to fetch templates:', error.response?.data || error.message);
      throw new Error('Failed to fetch message templates');
    }
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const whatsappService = new WhatsAppService();
