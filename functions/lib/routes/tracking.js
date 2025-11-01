"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTrackingId = void 0;
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const index_1 = require("../index");
const router = (0, express_1.Router)();
router.get('/open/:trackingId.png', async (req, res) => {
    try {
        const { trackingId } = req.params;
        const invoiceId = decodeTrackingId(trackingId);
        if (invoiceId) {
            await index_1.prisma.trackingEvent.create({
                data: {
                    invoiceId,
                    kind: 'EMAIL_OPEN',
                    metadata: {
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        referer: req.get('Referer'),
                        timestamp: new Date().toISOString(),
                    },
                },
            });
            console.log(`📧 Email opened for invoice: ${invoiceId}`);
        }
        const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
        res.set({
            'Content-Type': 'image/png',
            'Content-Length': pixel.length,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        res.send(pixel);
    }
    catch (error) {
        console.error('Tracking pixel error:', error);
        const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
        res.set('Content-Type', 'image/png');
        res.send(pixel);
    }
});
router.get('/click/:trackingId', async (req, res) => {
    try {
        const { trackingId } = req.params;
        const { r: redirectUrl } = req.query;
        const invoiceId = decodeTrackingId(trackingId);
        if (invoiceId) {
            await index_1.prisma.trackingEvent.create({
                data: {
                    invoiceId,
                    kind: 'LINK_CLICK',
                    metadata: {
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        referer: req.get('Referer'),
                        redirectUrl,
                        timestamp: new Date().toISOString(),
                    },
                },
            });
            console.log(`🔗 Link clicked for invoice: ${invoiceId}`);
        }
        if (redirectUrl && typeof redirectUrl === 'string') {
            const validatedUrl = validateRedirectUrl(redirectUrl);
            if (validatedUrl) {
                return res.redirect(302, validatedUrl);
            }
        }
        res.redirect(302, process.env.FRONTEND_URL || 'http://localhost:3000');
    }
    catch (error) {
        console.error('Click tracking error:', error);
        res.redirect(302, process.env.FRONTEND_URL || 'http://localhost:3000');
    }
});
const generateTrackingId = (invoiceId) => {
    const secret = process.env.TRACKING_SECRET || 'default-secret';
    const hmac = crypto_1.default.createHmac('sha256', secret);
    hmac.update(invoiceId);
    const signature = hmac.digest('hex').substring(0, 16);
    const payload = Buffer.from(JSON.stringify({ id: invoiceId, sig: signature })).toString('base64url');
    return payload;
};
exports.generateTrackingId = generateTrackingId;
const decodeTrackingId = (trackingId) => {
    try {
        const decoded = JSON.parse(Buffer.from(trackingId, 'base64url').toString());
        const { id: invoiceId, sig: signature } = decoded;
        const secret = process.env.TRACKING_SECRET || 'default-secret';
        const hmac = crypto_1.default.createHmac('sha256', secret);
        hmac.update(invoiceId);
        const expectedSignature = hmac.digest('hex').substring(0, 16);
        if (signature === expectedSignature) {
            return invoiceId;
        }
        return null;
    }
    catch {
        return null;
    }
};
const validateRedirectUrl = (url) => {
    try {
        const parsedUrl = new URL(url);
        const allowedDomains = [
            'localhost',
            '127.0.0.1',
            process.env.FRONTEND_DOMAIN,
            process.env.INVOICE_DOMAIN,
        ].filter(Boolean);
        if (url.startsWith('/')) {
            return url;
        }
        if (allowedDomains.some(domain => parsedUrl.hostname.endsWith(domain))) {
            return url;
        }
        return null;
    }
    catch {
        return null;
    }
};
exports.default = router;
