import axios from 'axios';
import { prisma } from '../index';
import { generateTrackingId } from '../routes/tracking';

export const sendInvoiceWhatsApp = async (invoice: any): Promise<void> => {
  try {
    // Get WhatsApp integration credentials
    const credentials = await prisma.integrationCredential.findFirst({
      where: {
        businessId: invoice.businessId,
        kind: 'WHATSAPP_CLOUD',
        isActive: true,
      },
    });

    if (!credentials) {
      throw new Error('No WhatsApp integration configured for this business');
    }

    // Decrypt credentials
    const whatsappConfig = JSON.parse(credentials.encryptedPayload);
    
    // Generate tracking link
    const trackingId = generateTrackingId(invoice.id);
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const invoiceViewUrl = `${process.env.FRONTEND_URL}/invoice/${invoice.id}`;
    const trackedViewUrl = `${baseUrl}/track/click/${trackingId}?r=${encodeURIComponent(invoiceViewUrl)}`;

    // Format phone number (ensure it includes country code)
    const phoneNumber = formatPhoneNumber(invoice.customerPhone);

    // Message content
    const message = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'template',
      template: {
        name: 'invoice_notification', // Pre-approved template
        language: {
          code: 'en'
        },
        components: [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: invoice.customerName
              },
              {
                type: 'text',
                text: invoice.invoiceNumber
              },
              {
                type: 'text',
                text: formatCurrency(invoice.total, invoice.currency)
              },
              {
                type: 'text',
                text: invoice.business.name
              }
            ]
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
              {
                type: 'text',
                text: trackedViewUrl
              }
            ]
          }
        ]
      }
    };

    // Send message via WhatsApp Cloud API
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${whatsappConfig.phoneNumberId}/messages`,
      message,
      {
        headers: {
          'Authorization': `Bearer ${whatsappConfig.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Record tracking event
    await prisma.trackingEvent.create({
      data: {
        invoiceId: invoice.id,
        kind: 'WHATSAPP_SENT',
        metadata: {
          messageId: response.data.messages[0].id,
          to: phoneNumber,
          trackingId,
        },
      },
    });

    console.log(`📱 WhatsApp sent for invoice ${invoice.invoiceNumber} to ${phoneNumber}`);
  } catch (error) {
    console.error('WhatsApp sending error:', error);
    throw error;
  }
};

// Alternative: Send as simple text message (for non-template scenarios)
export const sendInvoiceWhatsAppText = async (invoice: any): Promise<void> => {
  try {
    const credentials = await prisma.integrationCredential.findFirst({
      where: {
        businessId: invoice.businessId,
        kind: 'WHATSAPP_CLOUD',
        isActive: true,
      },
    });

    if (!credentials) {
      throw new Error('No WhatsApp integration configured for this business');
    }

    const whatsappConfig = JSON.parse(credentials.encryptedPayload);
    
    // Generate tracking link
    const trackingId = generateTrackingId(invoice.id);
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const invoiceViewUrl = `${process.env.FRONTEND_URL}/invoice/${invoice.id}`;
    const trackedViewUrl = `${baseUrl}/track/click/${trackingId}?r=${encodeURIComponent(invoiceViewUrl)}`;

    const phoneNumber = formatPhoneNumber(invoice.customerPhone);

    // Simple text message
    const messageText = `Hello ${invoice.customerName},

Your invoice ${invoice.invoiceNumber} from ${invoice.business.name} is ready.

Amount: ${formatCurrency(invoice.total, invoice.currency)}
${invoice.dueDate ? `Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}` : ''}

View your invoice: ${trackedViewUrl}

Thank you for your business!
${invoice.business.name}`;

    const message = {
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'text',
      text: {
        body: messageText
      }
    };

    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${whatsappConfig.phoneNumberId}/messages`,
      message,
      {
        headers: {
          'Authorization': `Bearer ${whatsappConfig.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Record tracking event
    await prisma.trackingEvent.create({
      data: {
        invoiceId: invoice.id,
        kind: 'WHATSAPP_SENT',
        metadata: {
          messageId: response.data.messages[0].id,
          to: phoneNumber,
          trackingId,
          messageType: 'text',
        },
      },
    });

    console.log(`📱 WhatsApp text sent for invoice ${invoice.invoiceNumber} to ${phoneNumber}`);
  } catch (error) {
    console.error('WhatsApp text sending error:', error);
    throw error;
  }
};

// Helper function to format phone number
const formatPhoneNumber = (phone: string): string => {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // If it starts with 0, replace with Sri Lanka country code
  if (cleaned.startsWith('0')) {
    cleaned = '94' + cleaned.substring(1);
  }
  
  // If it doesn't start with country code, add Sri Lanka's
  if (!cleaned.startsWith('94')) {
    cleaned = '94' + cleaned;
  }
  
  return cleaned;
};

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};