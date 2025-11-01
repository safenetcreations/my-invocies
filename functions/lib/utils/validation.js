"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateInvoice = exports.validateBusiness = exports.validateLogin = exports.validateRegistration = void 0;
const joi_1 = __importDefault(require("joi"));
const validateRegistration = (data) => {
    const schema = joi_1.default.object({
        email: joi_1.default.string().email().required(),
        password: joi_1.default.string().min(6).required(),
        name: joi_1.default.string().min(2).required(),
    });
    return schema.validate(data);
};
exports.validateRegistration = validateRegistration;
const validateLogin = (data) => {
    const schema = joi_1.default.object({
        email: joi_1.default.string().email().required(),
        password: joi_1.default.string().required(),
    });
    return schema.validate(data);
};
exports.validateLogin = validateLogin;
const validateBusiness = (data) => {
    const schema = joi_1.default.object({
        name: joi_1.default.string().required(),
        legalName: joi_1.default.string().required(),
        address: joi_1.default.string().required(),
        vatNumber: joi_1.default.string().optional(),
        tinNumber: joi_1.default.string().optional(),
        phone: joi_1.default.string().optional(),
        email: joi_1.default.string().email().optional(),
        website: joi_1.default.string().uri().optional(),
        primaryColor: joi_1.default.string().pattern(/^#[0-9A-F]{6}$/i).optional(),
        defaultCurrency: joi_1.default.string().length(3).optional(),
        defaultTaxRate: joi_1.default.number().min(0).max(1).optional(),
        taxInclusive: joi_1.default.boolean().optional(),
        defaultPaymentTerms: joi_1.default.string().optional(),
    });
    return schema.validate(data);
};
exports.validateBusiness = validateBusiness;
const validateInvoice = (data) => {
    const schema = joi_1.default.object({
        contactId: joi_1.default.string().optional(),
        customerName: joi_1.default.string().required(),
        customerEmail: joi_1.default.string().email().optional(),
        customerPhone: joi_1.default.string().optional(),
        customerVatNumber: joi_1.default.string().optional(),
        customerAddress: joi_1.default.string().optional(),
        dateIssued: joi_1.default.date().required(),
        dateOfSupply: joi_1.default.date().optional(),
        dueDate: joi_1.default.date().optional(),
        currency: joi_1.default.string().length(3).optional(),
        notes: joi_1.default.string().optional(),
        lineItems: joi_1.default.array().items(joi_1.default.object({
            productId: joi_1.default.string().optional(),
            description: joi_1.default.string().required(),
            quantity: joi_1.default.number().positive().required(),
            unitPrice: joi_1.default.number().min(0).required(),
            taxRate: joi_1.default.number().min(0).max(1).required(),
        })).min(1).required(),
    });
    return schema.validate(data);
};
exports.validateInvoice = validateInvoice;
