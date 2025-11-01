"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../utils/validation");
const pdfService_1 = require("../services/pdfService");
const emailService_1 = require("../services/emailService");
const whatsappService_1 = require("../services/whatsappService");
const router = (0, express_1.Router)();
router.get('/:businessId', auth_1.authenticate, auth_1.requireBusinessAccess, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search } = req.query;
        const where = {
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
            index_1.prisma.invoice.findMany({
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
            index_1.prisma.invoice.count({ where }),
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
    }
    catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
router.get('/:businessId/:invoiceId', auth_1.authenticate, auth_1.requireBusinessAccess, async (req, res) => {
    try {
        const invoice = await index_1.prisma.invoice.findFirst({
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
    }
    catch (error) {
        console.error('Get invoice error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
router.post('/:businessId', auth_1.authenticate, auth_1.requireBusinessAccess, async (req, res) => {
    try {
        const { error } = (0, validation_1.validateInvoice)(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }
        const business = await index_1.prisma.business.findUnique({
            where: { id: req.businessId },
        });
        if (!business) {
            return res.status(404).json({ error: 'Business not found' });
        }
        const { lineItems, ...invoiceData } = req.body;
        let subtotal = 0;
        let taxTotal = 0;
        const processedLineItems = lineItems.map((item, index) => {
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
        const nextSequence = business.invoiceSequence + 1;
        const invoiceNumber = `${business.invoicePrefix}-${String(nextSequence).padStart(6, '0')}`;
        const invoice = await index_1.prisma.$transaction(async (tx) => {
            await tx.business.update({
                where: { id: req.businessId },
                data: { invoiceSequence: nextSequence },
            });
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
    }
    catch (error) {
        console.error('Create invoice error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
router.post('/:businessId/:invoiceId/send', auth_1.authenticate, auth_1.requireBusinessAccess, async (req, res) => {
    try {
        const { channels = ['email'], generatePdf = true } = req.body;
        const invoiceId = req.params.invoiceId;
        const invoice = await index_1.prisma.invoice.findFirst({
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
            if (generatePdf) {
                const pdfPath = await (0, pdfService_1.generateInvoicePDF)(invoice);
                await index_1.prisma.invoice.update({
                    where: { id: invoiceId },
                    data: { pdfUrl: pdfPath },
                });
                invoice.pdfUrl = pdfPath;
            }
            const promises = [];
            if (channels.includes('email') && invoice.customerEmail) {
                promises.push((0, emailService_1.sendInvoiceEmail)(invoice));
            }
            if (channels.includes('whatsapp') && invoice.customerPhone) {
                promises.push((0, whatsappService_1.sendInvoiceWhatsApp)(invoice));
            }
            await Promise.all(promises);
            await index_1.prisma.invoice.update({
                where: { id: invoiceId },
                data: {
                    status: 'SENT',
                    sentAt: new Date(),
                    sentVia: channels,
                },
            });
        }
        res.json({ message: 'Invoice sent successfully', channels });
    }
    catch (error) {
        console.error('Send invoice error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
router.post('/:businessId/:invoiceId/payments', auth_1.authenticate, auth_1.requireBusinessAccess, async (req, res) => {
    try {
        const { amount, paymentMethod, dateReceived, notes } = req.body;
        const invoiceId = req.params.invoiceId;
        const invoice = await index_1.prisma.invoice.findFirst({
            where: {
                id: invoiceId,
                businessId: req.businessId,
            },
        });
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        const payment = await index_1.prisma.payment.create({
            data: {
                invoiceId,
                amount: Number(amount),
                paymentMethod,
                dateReceived: dateReceived ? new Date(dateReceived) : new Date(),
                notes,
            },
        });
        const totalPaid = invoice.amountPaid + Number(amount);
        let status = invoice.status;
        if (totalPaid >= invoice.total) {
            status = 'PAID';
        }
        else if (totalPaid > 0) {
            status = 'PARTIAL_PAID';
        }
        await index_1.prisma.invoice.update({
            where: { id: invoiceId },
            data: {
                amountPaid: totalPaid,
                status,
            },
        });
        await index_1.prisma.trackingEvent.create({
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
    }
    catch (error) {
        console.error('Record payment error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
