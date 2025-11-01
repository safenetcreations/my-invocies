import Joi from 'joi';

export const validateRegistration = (data: any) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).required(),
  });
  return schema.validate(data);
};

export const validateLogin = (data: any) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  });
  return schema.validate(data);
};

export const validateBusiness = (data: any) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    legalName: Joi.string().required(),
    address: Joi.string().required(),
    vatNumber: Joi.string().optional(),
    tinNumber: Joi.string().optional(),
    phone: Joi.string().optional(),
    email: Joi.string().email().optional(),
    website: Joi.string().uri().optional(),
    primaryColor: Joi.string().pattern(/^#[0-9A-F]{6}$/i).optional(),
    defaultCurrency: Joi.string().length(3).optional(),
    defaultTaxRate: Joi.number().min(0).max(1).optional(),
    taxInclusive: Joi.boolean().optional(),
    defaultPaymentTerms: Joi.string().optional(),
  });
  return schema.validate(data);
};

export const validateInvoice = (data: any) => {
  const schema = Joi.object({
    contactId: Joi.string().optional(),
    customerName: Joi.string().required(),
    customerEmail: Joi.string().email().optional(),
    customerPhone: Joi.string().optional(),
    customerVatNumber: Joi.string().optional(),
    customerAddress: Joi.string().optional(),
    dateIssued: Joi.date().required(),
    dateOfSupply: Joi.date().optional(),
    dueDate: Joi.date().optional(),
    currency: Joi.string().length(3).optional(),
    notes: Joi.string().optional(),
    lineItems: Joi.array().items(
      Joi.object({
        productId: Joi.string().optional(),
        description: Joi.string().required(),
        quantity: Joi.number().positive().required(),
        unitPrice: Joi.number().min(0).required(),
        taxRate: Joi.number().min(0).max(1).required(),
      })
    ).min(1).required(),
  });
  return schema.validate(data);
};