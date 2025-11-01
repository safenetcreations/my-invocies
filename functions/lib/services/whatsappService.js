"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendInvoiceWhatsAppText = exports.sendInvoiceWhatsApp = void 0;
const axios_1 = __importDefault(require("axios"));
const index_1 = require("../index");
const tracking_1 = require("../routes/tracking");
const sendInvoiceWhatsApp = async (invoice) => {
    try {
        const credentials = await index_1.prisma.integrationCredential.findFirst({
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
        const trackingId = (0, tracking_1.generateTrackingId)(invoice.id);
        const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
        const invoiceViewUrl = `${process.env.FRONTEND_URL}/invoice/${invoice.id}`;
        const trackedViewUrl = `${baseUrl}/track/click/${trackingId}?r=${encodeURIComponent(invoiceViewUrl)}`;
        const phoneNumber = formatPhoneNumber(invoice.customerPhone);
        const message = {
            messaging_product: 'whatsapp',
            to: phoneNumber,
            type: 'template',
            template: {
                name: 'invoice_notification',
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
        const response = await axios_1.default.post(`https://graph.facebook.com/v18.0/${whatsappConfig.phoneNumberId}/messages`, message, {
            headers: {
                'Authorization': `Bearer ${whatsappConfig.accessToken}`,
                'Content-Type': 'application/json',
            },
        });
        await index_1.prisma.trackingEvent.create({
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
    }
    catch (error) {
        console.error('WhatsApp sending error:', error);
        throw error;
    }
};
exports.sendInvoiceWhatsApp = sendInvoiceWhatsApp;
const sendInvoiceWhatsAppText = async (invoice) => {
    try {
        const credentials = await index_1.prisma.integrationCredential.findFirst({
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
        const trackingId = (0, tracking_1.generateTrackingId)(invoice.id);
        const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
        const invoiceViewUrl = `${process.env.FRONTEND_URL}/invoice/${invoice.id}`;
        const trackedViewUrl = `${baseUrl}/track/click/${trackingId}?r=${encodeURIComponent(invoiceViewUrl)}`;
        const phoneNumber = formatPhoneNumber(invoice.customerPhone);
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
        const response = await axios_1.default.post(`https://graph.facebook.com/v18.0/${whatsappConfig.phoneNumberId}/messages`, message, {
            headers: {
                'Authorization': `Bearer ${whatsappConfig.accessToken}`,
                'Content-Type': 'application/json',
            },
        });
        await index_1.prisma.trackingEvent.create({
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
    }
    catch (error) {
        console.error('WhatsApp text sending error:', error);
        throw error;
    }
};
exports.sendInvoiceWhatsAppText = sendInvoiceWhatsAppText;
const formatPhoneNumber = (phone) => {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '94' + cleaned.substring(1);
    }
    if (!cleaned.startsWith('94')) {
        cleaned = '94' + cleaned;
    }
    return cleaned;
};
const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('en-LK', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
    }).format(amount);
};
