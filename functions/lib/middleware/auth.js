"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireBusinessAccess = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const index_1 = require("../index");
const authenticate = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const user = await index_1.prisma.user.findUnique({
            where: { id: decoded.id },
        });
        if (!user) {
            return res.status(401).json({ error: 'Invalid token.' });
        }
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
        };
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Invalid token.' });
    }
};
exports.authenticate = authenticate;
const requireBusinessAccess = async (req, res, next) => {
    try {
        const businessId = req.params.businessId || req.body.businessId || req.query.businessId;
        if (!businessId) {
            return res.status(400).json({ error: 'Business ID required' });
        }
        const businessUser = await index_1.prisma.businessUser.findFirst({
            where: {
                businessId,
                userId: req.user.id,
            },
        });
        if (!businessUser && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Access denied to this business' });
        }
        req.businessId = businessId;
        next();
    }
    catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};
exports.requireBusinessAccess = requireBusinessAccess;
