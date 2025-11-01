/**
 * Sri Lankan Tax Calculation Service
 * Implements VAT, SVAT, and SSCL calculations according to IRD regulations
 */

import { Timestamp } from 'firebase-admin/firestore';
import { LineItem, Tenant, Client, Invoice } from './multiTenantFirestore';

// ============================================================================
// SRI LANKAN TAX RATES (as of 2024)
// ============================================================================

export const TAX_RATES = {
  VAT: {
    STANDARD: 0.15, // 15% standard rate
    ZERO_RATED: 0.0, // 0% for exports, etc.
    EXEMPT: 0.0, // VAT exempt supplies
  },
  SSCL: {
    STANDARD: 0.025, // 2.5% Social Security Contribution Levy
  },
  SVAT: {
    // Simplified VAT - flat rate on turnover
    RATE: 0.03, // 3% on turnover
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface TaxCalculationInput {
  tenant: Tenant;
  client?: Client;
  lineItems: LineItem[];
  dateOfSupply: Date;
  invoiceType: 'proforma' | 'tax_invoice' | 'credit_note' | 'debit_note';
}

export interface TaxCalculationResult {
  lineItems: LineItem[]; // Updated with tax amounts
  subtotal: number;
  totalDiscount: number;
  taxBreakdown: {
    vatStandardAmount: number;
    vatZeroRatedAmount: number;
    vatExemptAmount: number;
    vatTotal: number;
    ssclAmount: number;
    totalTax: number;
  };
  total: number;
  taxSummary: {
    taxableSupplies: number;
    zeroRatedSupplies: number;
    exemptSupplies: number;
  };
}

export interface TaxValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SVATVoucher {
  id: string;
  tenantId: string;
  supplierId: string;
  supplierName: string;
  voucherNumber: string;
  dateIssued: Timestamp;
  amount: number;
  taxAmount: number;
  status: 'unused' | 'used' | 'cancelled';
  linkedInvoiceId?: string;
  linkedDate?: Timestamp;
  notes?: string;
  createdAt: Timestamp;
}

// ============================================================================
// TAX CALCULATION SERVICE
// ============================================================================

export class TaxService {
  /**
   * Calculate all taxes for an invoice
   */
  calculateInvoiceTaxes(input: TaxCalculationInput): TaxCalculationResult {
    let subtotal = 0;
    let totalDiscount = 0;

    // Tax accumulation
    let vatStandardAmount = 0;
    let vatZeroRatedAmount = 0;
    let vatExemptAmount = 0;
    let ssclAmount = 0;

    // Supply categorization
    let taxableSupplies = 0;
    let zeroRatedSupplies = 0;
    let exemptSupplies = 0;

    // Process each line item
    const processedLineItems: LineItem[] = input.lineItems.map((item) => {
      // Calculate line subtotal
      const lineSubtotal = item.quantity * item.unitPrice;
      const discountAmount = lineSubtotal * item.discount;
      const lineNetAmount = lineSubtotal - discountAmount;

      subtotal += lineSubtotal;
      totalDiscount += discountAmount;

      let lineTaxAmount = 0;
      let lineTotal = lineNetAmount;

      // Only calculate tax if tenant is VAT registered and item is taxable
      if (input.tenant.taxConfig.vatRegistered && item.taxable) {
        const taxRate = this.getTaxRate(item.taxCategory, input.tenant);

        // Calculate VAT based on category
        switch (item.taxCategory) {
          case 'standard':
            lineTaxAmount = lineNetAmount * taxRate;
            vatStandardAmount += lineTaxAmount;
            taxableSupplies += lineNetAmount;
            break;

          case 'zero-rated':
            lineTaxAmount = 0;
            vatZeroRatedAmount += 0;
            zeroRatedSupplies += lineNetAmount;
            break;

          case 'exempt':
            lineTaxAmount = 0;
            vatExemptAmount += 0;
            exemptSupplies += lineNetAmount;
            break;
        }

        // Calculate SSCL if applicable
        if (input.tenant.taxConfig.ssclApplicable && item.ssclApplicable) {
          const ssclForLine = lineNetAmount * TAX_RATES.SSCL.STANDARD;
          lineTaxAmount += ssclForLine;
          ssclAmount += ssclForLine;
        }

        lineTotal = lineNetAmount + lineTaxAmount;
      } else {
        // No tax applicable
        exemptSupplies += lineNetAmount;
      }

      return {
        ...item,
        taxAmount: lineTaxAmount,
        lineTotal: lineTotal,
      };
    });

    const vatTotal = vatStandardAmount + vatZeroRatedAmount + vatExemptAmount;
    const totalTax = vatTotal + ssclAmount;
    const total = subtotal - totalDiscount + totalTax;

    return {
      lineItems: processedLineItems,
      subtotal,
      totalDiscount,
      taxBreakdown: {
        vatStandardAmount,
        vatZeroRatedAmount,
        vatExemptAmount,
        vatTotal,
        ssclAmount,
        totalTax,
      },
      total,
      taxSummary: {
        taxableSupplies,
        zeroRatedSupplies,
        exemptSupplies,
      },
    };
  }

  /**
   * Get applicable tax rate based on category
   */
  private getTaxRate(
    category: 'standard' | 'zero-rated' | 'exempt',
    tenant: Tenant
  ): number {
    switch (category) {
      case 'standard':
        return tenant.taxConfig.defaultVatRate || TAX_RATES.VAT.STANDARD;
      case 'zero-rated':
        return TAX_RATES.VAT.ZERO_RATED;
      case 'exempt':
        return TAX_RATES.VAT.EXEMPT;
      default:
        return 0;
    }
  }

  /**
   * Validate invoice for Sri Lankan tax compliance
   */
  validateTaxInvoice(
    invoice: Partial<Invoice>,
    tenant: Tenant,
    client?: Client
  ): TaxValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if this is a Tax Invoice (required for VAT registered businesses)
    if (tenant.taxConfig.vatRegistered) {
      // Must be a Tax Invoice
      if (invoice.invoiceType !== 'tax_invoice' && invoice.status !== 'draft') {
        errors.push(
          'VAT registered businesses must issue Tax Invoices for taxable supplies'
        );
      }

      // Supplier TIN is required
      if (!tenant.tin) {
        errors.push('Supplier TIN (Taxpayer Identification Number) is required');
      }

      // Supplier VAT number is required
      if (!tenant.taxConfig.vatNumber) {
        errors.push('Supplier VAT Registration Number is required');
      }

      // Customer details for B2B
      if (client?.registrationType === 'vat') {
        if (!client.tin) {
          warnings.push('Customer TIN is recommended for VAT registered customers');
        }
        if (!client.vatNumber) {
          warnings.push('Customer VAT Number is recommended for VAT registered customers');
        }
      }

      // Invoice must have date of supply
      if (!invoice.dateOfSupply) {
        errors.push('Date of Supply is required for Tax Invoices');
      }

      // Tax breakdown must be present
      if (!invoice.taxBreakdown || invoice.taxBreakdown.vatAmount === undefined) {
        errors.push('VAT breakdown is required for Tax Invoices');
      }
    }

    // SVAT validation
    if (tenant.taxConfig.svatRegistered) {
      warnings.push(
        'SVAT registered businesses should track SVAT vouchers from suppliers'
      );
    }

    // SSCL validation
    if (tenant.taxConfig.ssclApplicable) {
      if (!invoice.taxBreakdown || invoice.taxBreakdown.ssclAmount === undefined) {
        warnings.push('SSCL should be calculated and displayed separately');
      }
    }

    // Invoice number format
    if (invoice.invoiceNumber && !invoice.invoiceNumber.match(/^[A-Z0-9-]+$/)) {
      warnings.push(
        'Invoice number should contain only uppercase letters, numbers, and hyphens'
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate reverse charge VAT (for imports/specific services)
   */
  calculateReverseChargeVAT(netAmount: number, vatRate?: number): number {
    const rate = vatRate || TAX_RATES.VAT.STANDARD;
    return netAmount * rate;
  }

  /**
   * Calculate withholding tax (WHT) if applicable
   */
  calculateWithholdingTax(
    netAmount: number,
    whtRate: number,
    whtApplicable: boolean
  ): number {
    if (!whtApplicable) return 0;
    return netAmount * whtRate;
  }

  /**
   * Generate tax invoice number (IRD compliant format)
   */
  generateTaxInvoiceNumber(tenant: Tenant, sequenceNumber: number): string {
    const prefix = tenant.invoiceConfig.prefix || 'INV';
    const paddedNumber = String(sequenceNumber).padStart(6, '0');
    const year = new Date().getFullYear();

    // Format: PREFIX-YYYY-NNNNNN (e.g., INV-2024-000001)
    return `${prefix}-${year}-${paddedNumber}`;
  }

  /**
   * Calculate NBT (Nation Building Tax) if applicable
   */
  calculateNBT(netAmount: number, nbtRate: number, nbtApplicable: boolean): number {
    if (!nbtApplicable) return 0;
    return netAmount * nbtRate;
  }

  /**
   * Format currency for Sri Lankan Rupees
   */
  formatLKR(amount: number): string {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  /**
   * Convert amount in words (for legal compliance)
   */
  amountInWords(amount: number): string {
    const ones = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
    ];
    const tens = [
      '',
      '',
      'Twenty',
      'Thirty',
      'Forty',
      'Fifty',
      'Sixty',
      'Seventy',
      'Eighty',
      'Ninety',
    ];
    const teens = [
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];

    const convertLessThanThousand = (num: number): string => {
      if (num === 0) return '';

      const hundred = Math.floor(num / 100);
      const remainder = num % 100;

      let result = '';

      if (hundred > 0) {
        result += ones[hundred] + ' Hundred ';
      }

      if (remainder >= 10 && remainder < 20) {
        result += teens[remainder - 10] + ' ';
      } else {
        const ten = Math.floor(remainder / 10);
        const one = remainder % 10;

        if (ten > 0) {
          result += tens[ten] + ' ';
        }
        if (one > 0) {
          result += ones[one] + ' ';
        }
      }

      return result.trim();
    };

    if (amount === 0) return 'Zero Rupees Only';

    const rupees = Math.floor(amount);
    const cents = Math.round((amount - rupees) * 100);

    let result = '';

    if (rupees >= 1000000) {
      const millions = Math.floor(rupees / 1000000);
      result += convertLessThanThousand(millions) + ' Million ';
      const remainder = rupees % 1000000;

      if (remainder >= 100000) {
        const hundredThousands = Math.floor(remainder / 100000);
        result += convertLessThanThousand(hundredThousands) + ' Hundred Thousand ';
        const finalRemainder = remainder % 100000;

        if (finalRemainder >= 1000) {
          const thousands = Math.floor(finalRemainder / 1000);
          result += convertLessThanThousand(thousands) + ' Thousand ';
          result += convertLessThanThousand(finalRemainder % 1000);
        } else {
          result += convertLessThanThousand(finalRemainder);
        }
      } else if (remainder >= 1000) {
        const thousands = Math.floor(remainder / 1000);
        result += convertLessThanThousand(thousands) + ' Thousand ';
        result += convertLessThanThousand(remainder % 1000);
      } else {
        result += convertLessThanThousand(remainder);
      }
    } else if (rupees >= 1000) {
      const thousands = Math.floor(rupees / 1000);
      result += convertLessThanThousand(thousands) + ' Thousand ';
      result += convertLessThanThousand(rupees % 1000);
    } else {
      result += convertLessThanThousand(rupees);
    }

    result = result.trim() + ' Rupees';

    if (cents > 0) {
      result += ' and ' + convertLessThanThousand(cents) + ' Cents';
    }

    result += ' Only';

    return result;
  }

  /**
   * Generate tax period string (for reporting)
   */
  getTaxPeriod(date: Date): string {
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();
    return `${month} ${year}`;
  }

  /**
   * Check if transaction is subject to reverse charge
   */
  isReverseChargeApplicable(
    supplier: 'local' | 'foreign',
    service: 'goods' | 'services'
  ): boolean {
    // Reverse charge applies to:
    // 1. Imported services from foreign suppliers
    // 2. Certain specified services
    return supplier === 'foreign' && service === 'services';
  }

  /**
   * Calculate fiscal quarter
   */
  getFiscalQuarter(date: Date, fiscalYearStart: string): number {
    const [startMonth] = fiscalYearStart.split('-').map(Number);
    const month = date.getMonth() + 1;

    let adjustedMonth = month - startMonth + 1;
    if (adjustedMonth <= 0) {
      adjustedMonth += 12;
    }

    return Math.ceil(adjustedMonth / 3);
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const taxService = new TaxService();
