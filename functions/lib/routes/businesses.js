"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../utils/validation");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const businesses = await index_1.prisma.business.findMany({
            where: {
                businessUsers: {
                    some: {
                        userId: req.user.id,
                    },
                },
            },
            include: {
                businessUsers: {
                    where: {
                        userId: req.user.id,
                    },
                    select: {
                        role: true,
                    },
                },
            },
        });
        res.json(businesses);
    }
    catch (error) {
        console.error('Get businesses error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
router.post('/', auth_1.authenticate, async (req, res) => {
    try {
        const { error } = (0, validation_1.validateBusiness)(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }
        const business = await index_1.prisma.business.create({
            data: {
                ...req.body,
                businessUsers: {
                    create: {
                        userId: req.user.id,
                        role: 'OWNER',
                    },
                },
            },
            include: {
                businessUsers: true,
            },
        });
        res.status(201).json(business);
    }
    catch (error) {
        console.error('Create business error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
router.get('/:businessId', auth_1.authenticate, auth_1.requireBusinessAccess, async (req, res) => {
    try {
        const business = await index_1.prisma.business.findUnique({
            where: { id: req.businessId },
            include: {
                products: {
                    where: { isActive: true },
                    orderBy: { name: 'asc' },
                },
                contacts: {
                    orderBy: { name: 'asc' },
                },
                _count: {
                    select: {
                        invoices: true,
                        products: true,
                        contacts: true,
                    },
                },
            },
        });
        if (!business) {
            return res.status(404).json({ error: 'Business not found' });
        }
        res.json(business);
    }
    catch (error) {
        console.error('Get business error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
router.put('/:businessId', auth_1.authenticate, auth_1.requireBusinessAccess, async (req, res) => {
    try {
        const { error } = (0, validation_1.validateBusiness)(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }
        const business = await index_1.prisma.business.update({
            where: { id: req.businessId },
            data: req.body,
        });
        res.json(business);
    }
    catch (error) {
        console.error('Update business error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
router.get('/:businessId/products', auth_1.authenticate, auth_1.requireBusinessAccess, async (req, res) => {
    try {
        const products = await index_1.prisma.product.findMany({
            where: {
                businessId: req.businessId,
                isActive: true,
            },
            orderBy: { name: 'asc' },
        });
        res.json(products);
    }
    catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
router.post('/:businessId/products', auth_1.authenticate, auth_1.requireBusinessAccess, async (req, res) => {
    try {
        const product = await index_1.prisma.product.create({
            data: {
                ...req.body,
                businessId: req.businessId,
            },
        });
        res.status(201).json(product);
    }
    catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
router.get('/:businessId/contacts', auth_1.authenticate, auth_1.requireBusinessAccess, async (req, res) => {
    try {
        const contacts = await index_1.prisma.contact.findMany({
            where: {
                businessId: req.businessId,
            },
            orderBy: { name: 'asc' },
        });
        res.json(contacts);
    }
    catch (error) {
        console.error('Get contacts error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
router.post('/:businessId/contacts', auth_1.authenticate, auth_1.requireBusinessAccess, async (req, res) => {
    try {
        const contact = await index_1.prisma.contact.create({
            data: {
                ...req.body,
                businessId: req.businessId,
            },
        });
        res.status(201).json(contact);
    }
    catch (error) {
        console.error('Create contact error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
