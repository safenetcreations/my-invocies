"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const router = (0, express_1.Router)();
router.post('/email', async (req, res) => {
    try {
        const events = req.body;
        for (const event of events) {
            const { event: eventType, email, sg_message_id } = event;
            const trackingEvent = await index_1.prisma.trackingEvent.findFirst({
                where: {
                    kind: 'EMAIL_SENT',
                    metadata: {
                        path: ['messageId'],
                        equals: sg_message_id,
                    },
                },
            });
            if (trackingEvent) {
                let kind = null;
                switch (eventType) {
                    case 'bounce':
                    case 'blocked':
                    case 'dropped':
                        kind = 'EMAIL_BOUNCE';
                        break;
                    case 'delivered':
                        continue;
                    case 'open':
                        kind = 'EMAIL_OPEN';
                        break;
                    case 'click':
                        kind = 'LINK_CLICK';
                        break;
                }
                if (kind) {
                    await index_1.prisma.trackingEvent.create({
                        data: {
                            invoiceId: trackingEvent.invoiceId,
                            kind,
                            metadata: {
                                email,
                                messageId: sg_message_id,
                                webhookEvent: event,
                            },
                        },
                    });
                }
            }
        }
        res.status(200).json({ message: 'Webhook processed' });
    }
    catch (error) {
        console.error('Email webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
router.post('/whatsapp', async (req, res) => {
    try {
        const { entry } = req.body;
        for (const entryItem of entry) {
            const { changes } = entryItem;
            for (const change of changes) {
                const { value } = change;
                const { statuses, messages } = value;
                if (statuses) {
                    for (const status of statuses) {
                        const { id: messageId, status: messageStatus } = status;
                        const trackingEvent = await index_1.prisma.trackingEvent.findFirst({
                            where: {
                                kind: 'WHATSAPP_SENT',
                                metadata: {
                                    path: ['messageId'],
                                    equals: messageId,
                                },
                            },
                        });
                        if (trackingEvent) {
                            let kind = null;
                            switch (messageStatus) {
                                case 'delivered':
                                    kind = 'WHATSAPP_DELIVERED';
                                    break;
                                case 'read':
                                    kind = 'WHATSAPP_READ';
                                    break;
                                case 'failed':
                                    kind = 'WHATSAPP_FAILED';
                                    break;
                            }
                            if (kind) {
                                await index_1.prisma.trackingEvent.create({
                                    data: {
                                        invoiceId: trackingEvent.invoiceId,
                                        kind,
                                        metadata: {
                                            messageId,
                                            status: messageStatus,
                                            timestamp: status.timestamp,
                                        },
                                    },
                                });
                            }
                        }
                    }
                }
            }
        }
        res.status(200).json({ message: 'Webhook processed' });
    }
    catch (error) {
        console.error('WhatsApp webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
router.post('/stripe', async (req, res) => {
    try {
        const sig = req.headers['stripe-signature'];
        const event = req.body;
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            const { metadata } = paymentIntent;
            if (metadata.invoiceId) {
                await index_1.prisma.payment.create({
                    data: {
                        invoiceId: metadata.invoiceId,
                        amount: paymentIntent.amount / 100,
                        currency: paymentIntent.currency.toUpperCase(),
                        paymentMethod: 'ONLINE',
                        dateReceived: new Date(),
                        gatewayReference: paymentIntent.id,
                    },
                });
                const invoice = await index_1.prisma.invoice.findUnique({
                    where: { id: metadata.invoiceId },
                });
                if (invoice) {
                    const totalPaid = invoice.amountPaid + (paymentIntent.amount / 100);
                    const status = totalPaid >= invoice.total ? 'PAID' : 'PARTIAL_PAID';
                    await index_1.prisma.invoice.update({
                        where: { id: metadata.invoiceId },
                        data: {
                            amountPaid: totalPaid,
                            status,
                        },
                    });
                    await index_1.prisma.trackingEvent.create({
                        data: {
                            invoiceId: metadata.invoiceId,
                            kind: 'PAYMENT_RECEIVED',
                            metadata: {
                                amount: paymentIntent.amount / 100,
                                paymentMethod: 'ONLINE',
                                gatewayReference: paymentIntent.id,
                                gateway: 'stripe',
                            },
                        },
                    });
                }
            }
        }
        res.status(200).json({ message: 'Webhook processed' });
    }
    catch (error) {
        console.error('Stripe webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
router.get('/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        res.status(200).send(challenge);
    }
    else {
        res.status(403).json({ error: 'Verification failed' });
    }
});
exports.default = router;
