/**
 * Tax Calculation Tests - Sri Lankan Tax Scenarios
 * Tests VAT, SVAT, SSCL calculations with real-world scenarios
 */

import { taxService, TaxCalculationInput } from '../services/taxService';
import { Tenant, Client } from '../services/multiTenantFirestore';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const VAT_TENANT: Partial<Tenant> = {
  id: 'test-vat-tenant',
  name: 'Test VAT Company',
  legalName: 'Test VAT Company (Pvt) Ltd',
  tin: '123456789',
  taxConfig: {
    vatRegistered: true,
    vatNumber: '123456789V',
    svatRegistered: false,
    ssclApplicable: true,
    defaultVatRate: 0.15,
    fiscalYearStart: '04-01',
  },
};

const SVAT_TENANT: Partial<Tenant> = {
  id: 'test-svat-tenant',
  name: 'Test SVAT Company',
  legalName: 'Test SVAT Company',
  tin: '987654321',
  taxConfig: {
    vatRegistered: false,
    svatRegistered: true,
    ssclApplicable: false,
    defaultVatRate: 0.15,
    fiscalYearStart: '01-01',
  },
};

const VAT_REGISTERED_CLIENT: Partial<Client> = {
  id: 'client-vat',
  name: 'VAT Registered Client Ltd',
  tin: '111222333',
  vatNumber: '111222333V',
  registrationType: 'vat',
};

const INDIVIDUAL_CLIENT: Partial<Client> = {
  id: 'client-individual',
  name: 'John Doe',
  registrationType: 'none',
};

// ============================================================================
// SCENARIO 1: STANDARD VAT + SSCL (Most Common)
// ============================================================================

describe('Tax Calculation Tests - Sri Lanka', () => {
  describe('Scenario 1: Standard VAT (15%) + SSCL (2.5%)', () => {
    test('should calculate correct VAT and SSCL for standard rated supplies', () => {
      const input: TaxCalculationInput = {
        tenant: VAT_TENANT as any,
        client: VAT_REGISTERED_CLIENT as any,
        lineItems: [
          {
            description: 'Professional Services',
            quantity: 10,
            unitPrice: 10000, // LKR 10,000 per unit
            discount: 0,
            taxable: true,
            taxCategory: 'standard',
          },
        ],
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.calculateInvoiceTaxes(input);

      // Subtotal: 10 x 10,000 = 100,000
      expect(result.subtotal).toBe(100000);

      // VAT: 100,000 x 15% = 15,000
      expect(result.taxBreakdown.vatAmount).toBe(15000);

      // SSCL: 100,000 x 2.5% = 2,500
      expect(result.taxBreakdown.ssclAmount).toBe(2500);

      // Total Tax: 15,000 + 2,500 = 17,500
      expect(result.taxBreakdown.totalTax).toBe(17500);

      // Grand Total: 100,000 + 17,500 = 117,500
      expect(result.total).toBe(117500);
    });

    test('should handle discount correctly', () => {
      const input: TaxCalculationInput = {
        tenant: VAT_TENANT as any,
        client: VAT_REGISTERED_CLIENT as any,
        lineItems: [
          {
            description: 'Software License',
            quantity: 1,
            unitPrice: 100000,
            discount: 0.1, // 10% discount
            taxable: true,
            taxCategory: 'standard',
          },
        ],
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.calculateInvoiceTaxes(input);

      // Subtotal: 100,000
      expect(result.subtotal).toBe(100000);

      // Discount: 10,000
      expect(result.totalDiscount).toBe(10000);

      // Taxable Amount: 90,000
      const taxableAmount = 90000;

      // VAT: 90,000 x 15% = 13,500
      expect(result.taxBreakdown.vatAmount).toBe(13500);

      // SSCL: 90,000 x 2.5% = 2,250
      expect(result.taxBreakdown.ssclAmount).toBe(2250);

      // Total: 90,000 + 13,500 + 2,250 = 105,750
      expect(result.total).toBe(105750);
    });
  });

  // ============================================================================
  // SCENARIO 2: ZERO-RATED SUPPLIES (Export, Essential Goods)
  // ============================================================================

  describe('Scenario 2: Zero-Rated Supplies (0% VAT)', () => {
    test('should calculate zero VAT for zero-rated supplies', () => {
      const input: TaxCalculationInput = {
        tenant: VAT_TENANT as any,
        client: VAT_REGISTERED_CLIENT as any,
        lineItems: [
          {
            description: 'Export Services (Zero-Rated)',
            quantity: 1,
            unitPrice: 500000,
            discount: 0,
            taxable: true,
            taxCategory: 'zero-rated',
          },
        ],
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.calculateInvoiceTaxes(input);

      expect(result.subtotal).toBe(500000);

      // VAT should be 0 for zero-rated
      expect(result.taxBreakdown.vatAmount).toBe(0);

      // SSCL still applies
      expect(result.taxBreakdown.ssclAmount).toBe(12500); // 500,000 x 2.5%

      expect(result.total).toBe(512500);
    });
  });

  // ============================================================================
  // SCENARIO 3: EXEMPT SUPPLIES (Financial Services, Education)
  // ============================================================================

  describe('Scenario 3: Exempt Supplies (No VAT, No SSCL)', () => {
    test('should calculate zero tax for exempt supplies', () => {
      const input: TaxCalculationInput = {
        tenant: VAT_TENANT as any,
        client: INDIVIDUAL_CLIENT as any,
        lineItems: [
          {
            description: 'Educational Services (Exempt)',
            quantity: 1,
            unitPrice: 50000,
            discount: 0,
            taxable: false,
            taxCategory: 'exempt',
          },
        ],
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.calculateInvoiceTaxes(input);

      expect(result.subtotal).toBe(50000);
      expect(result.taxBreakdown.vatAmount).toBe(0);
      expect(result.taxBreakdown.ssclAmount).toBe(0);
      expect(result.total).toBe(50000);
    });
  });

  // ============================================================================
  // SCENARIO 4: MIXED INVOICE (Standard + Zero-Rated + Exempt)
  // ============================================================================

  describe('Scenario 4: Mixed Invoice with Multiple Tax Categories', () => {
    test('should correctly calculate taxes for mixed invoice', () => {
      const input: TaxCalculationInput = {
        tenant: VAT_TENANT as any,
        client: VAT_REGISTERED_CLIENT as any,
        lineItems: [
          {
            description: 'Standard Service',
            quantity: 1,
            unitPrice: 100000,
            discount: 0,
            taxable: true,
            taxCategory: 'standard',
          },
          {
            description: 'Zero-Rated Export',
            quantity: 1,
            unitPrice: 50000,
            discount: 0,
            taxable: true,
            taxCategory: 'zero-rated',
          },
          {
            description: 'Exempt Service',
            quantity: 1,
            unitPrice: 30000,
            discount: 0,
            taxable: false,
            taxCategory: 'exempt',
          },
        ],
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.calculateInvoiceTaxes(input);

      // Subtotal: 100,000 + 50,000 + 30,000 = 180,000
      expect(result.subtotal).toBe(180000);

      // VAT: Only on standard (100,000 x 15%) = 15,000
      expect(result.taxBreakdown.vatAmount).toBe(15000);

      // SSCL: On standard + zero-rated (150,000 x 2.5%) = 3,750
      expect(result.taxBreakdown.ssclAmount).toBe(3750);

      // Total: 180,000 + 15,000 + 3,750 = 198,750
      expect(result.total).toBe(198750);

      // Tax Summary
      expect(result.taxSummary.taxableSupplies).toBe(100000);
      expect(result.taxSummary.zeroRatedSupplies).toBe(50000);
      expect(result.taxSummary.exemptSupplies).toBe(30000);
    });
  });

  // ============================================================================
  // SCENARIO 5: SVAT (3% Simplified VAT)
  // ============================================================================

  describe('Scenario 5: SVAT Registration (3% rate)', () => {
    test('should calculate 3% SVAT for SVAT registered business', () => {
      const input: TaxCalculationInput = {
        tenant: SVAT_TENANT as any,
        client: INDIVIDUAL_CLIENT as any,
        lineItems: [
          {
            description: 'Retail Goods',
            quantity: 10,
            unitPrice: 5000,
            discount: 0,
            taxable: true,
            taxCategory: 'standard',
          },
        ],
        dateOfSupply: new Date('2024-01-15'),
        svatVoucher: {
          voucherId: 'SVAT-001',
          voucherNumber: 'SV2024-001',
          voucherValue: 1500, // Voucher covers LKR 1,500 of tax
          taxAmount: 1500,
        },
      };

      const result = taxService.calculateInvoiceTaxes(input);

      // Subtotal: 10 x 5,000 = 50,000
      expect(result.subtotal).toBe(50000);

      // SVAT: 50,000 x 3% = 1,500
      expect(result.taxBreakdown.vatAmount).toBe(1500);

      // No SSCL for SVAT
      expect(result.taxBreakdown.ssclAmount).toBe(0);

      // Total: 50,000 + 1,500 = 51,500
      expect(result.total).toBe(51500);
    });
  });

  // ============================================================================
  // SCENARIO 6: REAL-WORLD B2B INVOICE
  // ============================================================================

  describe('Scenario 6: Real-World B2B Service Invoice', () => {
    test('should calculate taxes for professional services invoice', () => {
      const input: TaxCalculationInput = {
        tenant: VAT_TENANT as any,
        client: VAT_REGISTERED_CLIENT as any,
        lineItems: [
          {
            description: 'Web Development - Phase 1',
            quantity: 80,
            unitPrice: 5000,
            discount: 0,
            taxable: true,
            taxCategory: 'standard',
          },
          {
            description: 'Hosting Services (Annual)',
            quantity: 1,
            unitPrice: 25000,
            discount: 0,
            taxable: true,
            taxCategory: 'standard',
          },
          {
            description: 'Training Services',
            quantity: 4,
            unitPrice: 15000,
            discount: 0.1, // 10% discount
            taxable: true,
            taxCategory: 'standard',
          },
        ],
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.calculateInvoiceTaxes(input);

      // Subtotal: (80 x 5,000) + 25,000 + (4 x 15,000) = 400,000 + 25,000 + 60,000 = 485,000
      expect(result.subtotal).toBe(485000);

      // Discount: Only on training = 60,000 x 10% = 6,000
      expect(result.totalDiscount).toBe(6000);

      // Taxable Amount: 485,000 - 6,000 = 479,000
      const taxableAmount = 479000;

      // VAT: 479,000 x 15% = 71,850
      expect(result.taxBreakdown.vatAmount).toBe(71850);

      // SSCL: 479,000 x 2.5% = 11,975
      expect(result.taxBreakdown.ssclAmount).toBe(11975);

      // Total: 479,000 + 71,850 + 11,975 = 562,825
      expect(result.total).toBe(562825);
    });
  });

  // ============================================================================
  // SCENARIO 7: AMOUNT IN WORDS
  // ============================================================================

  describe('Scenario 7: Amount in Words Conversion', () => {
    test('should convert amounts to words correctly', () => {
      expect(taxService.amountInWords(11750)).toBe('Eleven Thousand Seven Hundred Fifty Rupees Only');
      expect(taxService.amountInWords(100000)).toBe('One Hundred Thousand Rupees Only');
      expect(taxService.amountInWords(1500000)).toBe('One Million Five Hundred Thousand Rupees Only');
      expect(taxService.amountInWords(25)).toBe('Twenty Five Rupees Only');
      expect(taxService.amountInWords(101)).toBe('One Hundred One Rupees Only');
      expect(taxService.amountInWords(562825)).toBe('Five Hundred Sixty Two Thousand Eight Hundred Twenty Five Rupees Only');
    });

    test('should handle decimal amounts', () => {
      expect(taxService.amountInWords(11750.50)).toBe('Eleven Thousand Seven Hundred Fifty Rupees and Fifty Cents');
      expect(taxService.amountInWords(100.25)).toBe('One Hundred Rupees and Twenty Five Cents');
    });
  });

  // ============================================================================
  // SCENARIO 8: LKR FORMATTING
  // ============================================================================

  describe('Scenario 8: Sri Lankan Rupee Formatting', () => {
    test('should format LKR amounts correctly', () => {
      expect(taxService.formatLKR(11750)).toBe('Rs. 11,750.00');
      expect(taxService.formatLKR(100000)).toBe('Rs. 100,000.00');
      expect(taxService.formatLKR(1500000)).toBe('Rs. 1,500,000.00');
      expect(taxService.formatLKR(562825.50)).toBe('Rs. 562,825.50');
      expect(taxService.formatLKR(25)).toBe('Rs. 25.00');
    });
  });

  // ============================================================================
  // SCENARIO 9: TAX VALIDATION
  // ============================================================================

  describe('Scenario 9: IRD Compliance Validation', () => {
    test('should validate VAT invoice requirements', () => {
      const invoice = {
        invoiceType: 'tax_invoice' as const,
        lineItems: [
          {
            description: 'Service',
            quantity: 1,
            unitPrice: 100000,
            discount: 0,
            taxable: true,
            taxCategory: 'standard' as const,
            taxRate: 0.15,
            taxAmount: 15000,
            lineTotal: 115000,
          },
        ],
        taxBreakdown: {
          vatAmount: 15000,
          ssclAmount: 2500,
          totalTax: 17500,
        },
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.validateTaxInvoice(
        invoice as any,
        VAT_TENANT as any,
        VAT_REGISTERED_CLIENT as any
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('should fail validation if VAT registered tenant issues invoice without VAT number', () => {
      const invalidTenant = {
        ...VAT_TENANT,
        taxConfig: {
          ...VAT_TENANT.taxConfig,
          vatNumber: undefined,
        },
      };

      const invoice = {
        invoiceType: 'tax_invoice' as const,
        lineItems: [],
        taxBreakdown: {
          vatAmount: 0,
          ssclAmount: 0,
          totalTax: 0,
        },
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.validateTaxInvoice(
        invoice as any,
        invalidTenant as any,
        VAT_REGISTERED_CLIENT as any
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('Supplier VAT number is required for tax invoices');
    });

    test('should warn if B2B invoice issued without client TIN', () => {
      const clientWithoutTIN = {
        ...VAT_REGISTERED_CLIENT,
        tin: undefined,
      };

      const invoice = {
        invoiceType: 'tax_invoice' as const,
        lineItems: [
          {
            description: 'Service',
            quantity: 1,
            unitPrice: 100000,
            discount: 0,
            taxable: true,
            taxCategory: 'standard' as const,
            taxRate: 0.15,
            taxAmount: 15000,
            lineTotal: 115000,
          },
        ],
        taxBreakdown: {
          vatAmount: 15000,
          ssclAmount: 2500,
          totalTax: 17500,
        },
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.validateTaxInvoice(
        invoice as any,
        VAT_TENANT as any,
        clientWithoutTIN as any
      );

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w: string) => w.includes('TIN'))).toBe(true);
    });
  });

  // ============================================================================
  // SCENARIO 10: EDGE CASES
  // ============================================================================

  describe('Scenario 10: Edge Cases and Boundary Conditions', () => {
    test('should handle zero amount invoice', () => {
      const input: TaxCalculationInput = {
        tenant: VAT_TENANT as any,
        client: INDIVIDUAL_CLIENT as any,
        lineItems: [
          {
            description: 'Free Service',
            quantity: 1,
            unitPrice: 0,
            discount: 0,
            taxable: true,
            taxCategory: 'standard',
          },
        ],
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.calculateInvoiceTaxes(input);

      expect(result.subtotal).toBe(0);
      expect(result.taxBreakdown.vatAmount).toBe(0);
      expect(result.taxBreakdown.ssclAmount).toBe(0);
      expect(result.total).toBe(0);
    });

    test('should handle 100% discount', () => {
      const input: TaxCalculationInput = {
        tenant: VAT_TENANT as any,
        client: INDIVIDUAL_CLIENT as any,
        lineItems: [
          {
            description: 'Promotional Item',
            quantity: 1,
            unitPrice: 10000,
            discount: 1.0, // 100% discount
            taxable: true,
            taxCategory: 'standard',
          },
        ],
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.calculateInvoiceTaxes(input);

      expect(result.subtotal).toBe(10000);
      expect(result.totalDiscount).toBe(10000);
      expect(result.taxBreakdown.vatAmount).toBe(0);
      expect(result.taxBreakdown.ssclAmount).toBe(0);
      expect(result.total).toBe(0);
    });

    test('should handle very large amounts', () => {
      const input: TaxCalculationInput = {
        tenant: VAT_TENANT as any,
        client: VAT_REGISTERED_CLIENT as any,
        lineItems: [
          {
            description: 'Large Project',
            quantity: 1,
            unitPrice: 10000000, // 10 million
            discount: 0,
            taxable: true,
            taxCategory: 'standard',
          },
        ],
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.calculateInvoiceTaxes(input);

      expect(result.subtotal).toBe(10000000);
      expect(result.taxBreakdown.vatAmount).toBe(1500000); // 15%
      expect(result.taxBreakdown.ssclAmount).toBe(250000); // 2.5%
      expect(result.total).toBe(11750000);
    });

    test('should handle fractional quantities and prices', () => {
      const input: TaxCalculationInput = {
        tenant: VAT_TENANT as any,
        client: INDIVIDUAL_CLIENT as any,
        lineItems: [
          {
            description: 'Hourly Service',
            quantity: 2.5, // 2.5 hours
            unitPrice: 3500.75,
            discount: 0,
            taxable: true,
            taxCategory: 'standard',
          },
        ],
        dateOfSupply: new Date('2024-01-15'),
      };

      const result = taxService.calculateInvoiceTaxes(input);

      // Subtotal: 2.5 x 3,500.75 = 8,751.875 ≈ 8,751.88
      expect(result.subtotal).toBeCloseTo(8751.875, 2);

      // VAT: 8,751.875 x 15% ≈ 1,312.78
      expect(result.taxBreakdown.vatAmount).toBeCloseTo(1312.78, 2);

      // SSCL: 8,751.875 x 2.5% ≈ 218.80
      expect(result.taxBreakdown.ssclAmount).toBeCloseTo(218.80, 2);
    });
  });
});

// ============================================================================
// EXPORT FOR MANUAL TESTING
// ============================================================================

export const runManualTests = () => {
  console.log('='.repeat(80));
  console.log('MANUAL TAX CALCULATION TESTS');
  console.log('='.repeat(80));

  // Test 1: Standard Invoice
  console.log('\nTest 1: Standard B2B Invoice with VAT + SSCL');
  const test1: TaxCalculationInput = {
    tenant: VAT_TENANT as any,
    client: VAT_REGISTERED_CLIENT as any,
    lineItems: [
      {
        description: 'Professional Services',
        quantity: 10,
        unitPrice: 10000,
        discount: 0,
        taxable: true,
        taxCategory: 'standard',
      },
    ],
    dateOfSupply: new Date('2024-01-15'),
  };
  const result1 = taxService.calculateInvoiceTaxes(test1);
  console.log('Subtotal:', taxService.formatLKR(result1.subtotal));
  console.log('VAT:', taxService.formatLKR(result1.taxBreakdown.vatAmount));
  console.log('SSCL:', taxService.formatLKR(result1.taxBreakdown.ssclAmount));
  console.log('Total:', taxService.formatLKR(result1.total));
  console.log('In Words:', taxService.amountInWords(result1.total));

  console.log('\n' + '='.repeat(80));
};
