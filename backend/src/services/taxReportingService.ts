/**
 * Tax Reporting Service
 * Generates IRD-compliant tax reports for VAT, SVAT, and SSCL
 */

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { Invoice, Tenant, Collections, db } from './multiTenantFirestore';
import { taxService } from './taxService';
import { pdfGenerationService } from './pdfGenerationService';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface VATReturnPeriod {
  startDate: Date;
  endDate: Date;
  quarter?: number;
  year: number;
}

export interface VATReturn {
  tenantId: string;
  period: VATReturnPeriod;
  outputTax: {
    standardRatedSupplies: number;
    zeroRatedSupplies: number;
    exemptSupplies: number;
    totalOutputTax: number;
  };
  inputTax: {
    standardRatedPurchases: number;
    totalInputTax: number;
  };
  netVATPayable: number;
  ssclPayable: number;
  totalPayable: number;
  invoiceCount: number;
  generatedAt: Timestamp;
}

export interface SVATVoucherSummary {
  tenantId: string;
  period: VATReturnPeriod;
  vouchersUsed: number;
  totalVoucherValue: number;
  totalTaxPaid: number;
  invoiceCount: number;
  generatedAt: Timestamp;
}

export interface SalesRegisterEntry {
  invoiceNumber: string;
  invoiceDate: Date;
  clientName: string;
  clientTIN?: string;
  clientVATNumber?: string;
  subtotal: number;
  vatAmount: number;
  ssclAmount: number;
  total: number;
  invoiceType: string;
}

export interface SalesRegister {
  tenantId: string;
  period: VATReturnPeriod;
  entries: SalesRegisterEntry[];
  summary: {
    totalInvoices: number;
    totalSales: number;
    totalVAT: number;
    totalSSCL: number;
    grandTotal: number;
  };
  generatedAt: Timestamp;
}

// ============================================================================
// TAX REPORTING SERVICE
// ============================================================================

export class TaxReportingService {
  /**
   * Generate VAT Return (Form 200) for a period
   */
  async generateVATReturn(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<VATReturn> {
    const tenant = await db.collection(Collections.TENANTS).doc(tenantId).get();
    if (!tenant.exists) {
      throw new Error('Tenant not found');
    }

    const tenantData = tenant.data() as Tenant;
    if (!tenantData.taxConfig.vatRegistered) {
      throw new Error('Tenant is not VAT registered');
    }

    // Fetch all invoices for the period
    const invoices = await db
      .collection(Collections.INVOICES)
      .where('tenantId', '==', tenantId)
      .where('invoiceType', '==', 'tax_invoice')
      .where('status', '!=', 'cancelled')
      .where('dateIssued', '>=', Timestamp.fromDate(startDate))
      .where('dateIssued', '<=', Timestamp.fromDate(endDate))
      .get();

    let standardRatedSupplies = 0;
    let zeroRatedSupplies = 0;
    let exemptSupplies = 0;
    let totalOutputTax = 0;
    let totalSSCL = 0;

    invoices.forEach((doc) => {
      const invoice = doc.data() as Invoice;

      // Aggregate by tax category
      invoice.lineItems.forEach((item) => {
        const itemSubtotal = item.quantity * item.unitPrice * (1 - item.discount);

        switch (item.taxCategory) {
          case 'standard':
            standardRatedSupplies += itemSubtotal;
            break;
          case 'zero-rated':
            zeroRatedSupplies += itemSubtotal;
            break;
          case 'exempt':
            exemptSupplies += itemSubtotal;
            break;
        }
      });

      totalOutputTax += invoice.taxBreakdown.vatAmount;
      totalSSCL += invoice.taxBreakdown.ssclAmount;
    });

    // For simplicity, we're not handling input tax (purchases)
    // In a full implementation, you'd track purchases and input VAT
    const inputTax = {
      standardRatedPurchases: 0,
      totalInputTax: 0,
    };

    const netVATPayable = totalOutputTax - inputTax.totalInputTax;
    const totalPayable = netVATPayable + totalSSCL;

    const vatReturn: VATReturn = {
      tenantId,
      period: {
        startDate,
        endDate,
        quarter: this.getQuarter(startDate),
        year: startDate.getFullYear(),
      },
      outputTax: {
        standardRatedSupplies,
        zeroRatedSupplies,
        exemptSupplies,
        totalOutputTax,
      },
      inputTax,
      netVATPayable,
      ssclPayable: totalSSCL,
      totalPayable,
      invoiceCount: invoices.size,
      generatedAt: Timestamp.now(),
    };

    return vatReturn;
  }

  /**
   * Generate SVAT voucher summary for a period
   */
  async generateSVATSummary(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<SVATVoucherSummary> {
    const tenant = await db.collection(Collections.TENANTS).doc(tenantId).get();
    if (!tenant.exists) {
      throw new Error('Tenant not found');
    }

    const tenantData = tenant.data() as Tenant;
    if (!tenantData.taxConfig.svatRegistered) {
      throw new Error('Tenant is not SVAT registered');
    }

    // Fetch SVAT vouchers for the period
    const vouchers = await db
      .collection(Collections.SVAT_VOUCHERS)
      .where('tenantId', '==', tenantId)
      .where('usedDate', '>=', Timestamp.fromDate(startDate))
      .where('usedDate', '<=', Timestamp.fromDate(endDate))
      .get();

    let totalVoucherValue = 0;
    let totalTaxPaid = 0;

    vouchers.forEach((doc) => {
      const voucher = doc.data();
      totalVoucherValue += voucher.voucherValue;
      totalTaxPaid += voucher.taxAmount;
    });

    // Count invoices using SVAT
    const invoices = await db
      .collection(Collections.INVOICES)
      .where('tenantId', '==', tenantId)
      .where('dateIssued', '>=', Timestamp.fromDate(startDate))
      .where('dateIssued', '<=', Timestamp.fromDate(endDate))
      .get();

    const summary: SVATVoucherSummary = {
      tenantId,
      period: {
        startDate,
        endDate,
        quarter: this.getQuarter(startDate),
        year: startDate.getFullYear(),
      },
      vouchersUsed: vouchers.size,
      totalVoucherValue,
      totalTaxPaid,
      invoiceCount: invoices.size,
      generatedAt: Timestamp.now(),
    };

    return summary;
  }

  /**
   * Generate Sales Register (mandatory for VAT registered businesses)
   */
  async generateSalesRegister(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<SalesRegister> {
    const invoices = await db
      .collection(Collections.INVOICES)
      .where('tenantId', '==', tenantId)
      .where('status', '!=', 'cancelled')
      .where('dateIssued', '>=', Timestamp.fromDate(startDate))
      .where('dateIssued', '<=', Timestamp.fromDate(endDate))
      .orderBy('dateIssued', 'asc')
      .get();

    const entries: SalesRegisterEntry[] = [];
    let totalSales = 0;
    let totalVAT = 0;
    let totalSSCL = 0;
    let grandTotal = 0;

    invoices.forEach((doc) => {
      const invoice = doc.data() as Invoice;

      entries.push({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.dateIssued.toDate(),
        clientName: invoice.clientSnapshot.name || 'Unknown',
        clientTIN: invoice.clientSnapshot.tin,
        clientVATNumber: invoice.clientSnapshot.vatNumber,
        subtotal: invoice.subtotal,
        vatAmount: invoice.taxBreakdown.vatAmount,
        ssclAmount: invoice.taxBreakdown.ssclAmount,
        total: invoice.total,
        invoiceType: invoice.invoiceType,
      });

      totalSales += invoice.subtotal;
      totalVAT += invoice.taxBreakdown.vatAmount;
      totalSSCL += invoice.taxBreakdown.ssclAmount;
      grandTotal += invoice.total;
    });

    const salesRegister: SalesRegister = {
      tenantId,
      period: {
        startDate,
        endDate,
        quarter: this.getQuarter(startDate),
        year: startDate.getFullYear(),
      },
      entries,
      summary: {
        totalInvoices: entries.length,
        totalSales,
        totalVAT,
        totalSSCL,
        grandTotal,
      },
      generatedAt: Timestamp.now(),
    };

    return salesRegister;
  }

  /**
   * Generate comprehensive tax report for a period
   */
  async generateComprehensiveTaxReport(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    vatReturn?: VATReturn;
    svatSummary?: SVATVoucherSummary;
    salesRegister: SalesRegister;
  }> {
    const tenant = await db.collection(Collections.TENANTS).doc(tenantId).get();
    if (!tenant.exists) {
      throw new Error('Tenant not found');
    }

    const tenantData = tenant.data() as Tenant;

    const report: any = {
      salesRegister: await this.generateSalesRegister(tenantId, startDate, endDate),
    };

    if (tenantData.taxConfig.vatRegistered) {
      report.vatReturn = await this.generateVATReturn(tenantId, startDate, endDate);
    }

    if (tenantData.taxConfig.svatRegistered) {
      report.svatSummary = await this.generateSVATSummary(tenantId, startDate, endDate);
    }

    return report;
  }

  /**
   * Generate Excel export of sales register
   */
  async exportSalesRegisterToCSV(salesRegister: SalesRegister): Promise<string> {
    const headers = [
      'Invoice Number',
      'Invoice Date',
      'Client Name',
      'Client TIN',
      'Client VAT Number',
      'Subtotal (LKR)',
      'VAT (LKR)',
      'SSCL (LKR)',
      'Total (LKR)',
      'Invoice Type',
    ];

    const rows = salesRegister.entries.map((entry) => [
      entry.invoiceNumber,
      entry.invoiceDate.toLocaleDateString('en-GB'),
      entry.clientName,
      entry.clientTIN || 'N/A',
      entry.clientVATNumber || 'N/A',
      entry.subtotal.toFixed(2),
      entry.vatAmount.toFixed(2),
      entry.ssclAmount.toFixed(2),
      entry.total.toFixed(2),
      entry.invoiceType,
    ]);

    // Add summary row
    rows.push([
      '',
      '',
      'TOTAL',
      '',
      '',
      salesRegister.summary.totalSales.toFixed(2),
      salesRegister.summary.totalVAT.toFixed(2),
      salesRegister.summary.totalSSCL.toFixed(2),
      salesRegister.summary.grandTotal.toFixed(2),
      '',
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');

    return csv;
  }

  /**
   * Generate VAT Return PDF (Form 200 format)
   */
  async generateVATReturnPDF(vatReturn: VATReturn, tenant: Tenant): Promise<string> {
    // This would generate an IRD Form 200 compliant PDF
    // For now, we'll create a simple summary

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>VAT Return - ${tenant.legalName}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 40px;
      color: #333;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      color: #2563eb;
    }
    .header h2 {
      margin: 5px 0;
      font-weight: normal;
      color: #666;
    }
    .section {
      margin: 30px 0;
      page-break-inside: avoid;
    }
    .section-title {
      background: #2563eb;
      color: white;
      padding: 10px 15px;
      font-size: 14pt;
      font-weight: bold;
      margin-bottom: 15px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 20px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 15px;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-label {
      font-weight: 600;
      color: #666;
    }
    .info-value {
      color: #333;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th {
      background: #f5f5f5;
      padding: 12px;
      text-align: left;
      border: 1px solid #ddd;
      font-weight: 600;
    }
    td {
      padding: 10px 12px;
      border: 1px solid #ddd;
    }
    .amount {
      text-align: right;
      font-family: 'Courier New', monospace;
    }
    .total-row {
      background: #f0f9ff;
      font-weight: bold;
    }
    .payable-row {
      background: #fee2e2;
      font-weight: bold;
      font-size: 12pt;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #2563eb;
      font-size: 9pt;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>VALUE ADDED TAX RETURN</h1>
    <h2>Form 200 - Inland Revenue Department</h2>
    <h2>${tenant.legalName}</h2>
  </div>

  <!-- Company Details -->
  <div class="section">
    <div class="section-title">Taxpayer Information</div>
    <div class="info-grid">
      <div>
        <div class="info-row">
          <span class="info-label">Legal Name:</span>
          <span class="info-value">${tenant.legalName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">TIN:</span>
          <span class="info-value">${tenant.tin || 'N/A'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">VAT Reg. No:</span>
          <span class="info-value">${tenant.taxConfig.vatNumber || 'N/A'}</span>
        </div>
      </div>
      <div>
        <div class="info-row">
          <span class="info-label">Period Start:</span>
          <span class="info-value">${vatReturn.period.startDate.toLocaleDateString('en-GB')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Period End:</span>
          <span class="info-value">${vatReturn.period.endDate.toLocaleDateString('en-GB')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Quarter:</span>
          <span class="info-value">Q${vatReturn.period.quarter} ${vatReturn.period.year}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Output Tax Section -->
  <div class="section">
    <div class="section-title">Part A - Output Tax (Sales)</div>
    <table>
      <tr>
        <th>Description</th>
        <th class="amount">Value (LKR)</th>
        <th class="amount">VAT (LKR)</th>
      </tr>
      <tr>
        <td>1. Standard-Rated Supplies (15%)</td>
        <td class="amount">${taxService.formatLKR(vatReturn.outputTax.standardRatedSupplies)}</td>
        <td class="amount">${taxService.formatLKR(vatReturn.outputTax.totalOutputTax)}</td>
      </tr>
      <tr>
        <td>2. Zero-Rated Supplies (0%)</td>
        <td class="amount">${taxService.formatLKR(vatReturn.outputTax.zeroRatedSupplies)}</td>
        <td class="amount">${taxService.formatLKR(0)}</td>
      </tr>
      <tr>
        <td>3. Exempt Supplies</td>
        <td class="amount">${taxService.formatLKR(vatReturn.outputTax.exemptSupplies)}</td>
        <td class="amount">-</td>
      </tr>
      <tr class="total-row">
        <td><strong>Total Output Tax</strong></td>
        <td class="amount"></td>
        <td class="amount"><strong>${taxService.formatLKR(vatReturn.outputTax.totalOutputTax)}</strong></td>
      </tr>
    </table>
  </div>

  <!-- Input Tax Section -->
  <div class="section">
    <div class="section-title">Part B - Input Tax (Purchases)</div>
    <table>
      <tr>
        <th>Description</th>
        <th class="amount">Value (LKR)</th>
        <th class="amount">VAT (LKR)</th>
      </tr>
      <tr>
        <td>1. Standard-Rated Purchases</td>
        <td class="amount">${taxService.formatLKR(vatReturn.inputTax.standardRatedPurchases)}</td>
        <td class="amount">${taxService.formatLKR(vatReturn.inputTax.totalInputTax)}</td>
      </tr>
      <tr class="total-row">
        <td><strong>Total Input Tax</strong></td>
        <td class="amount"></td>
        <td class="amount"><strong>${taxService.formatLKR(vatReturn.inputTax.totalInputTax)}</strong></td>
      </tr>
    </table>
  </div>

  <!-- Net VAT Calculation -->
  <div class="section">
    <div class="section-title">Part C - Net VAT Payable</div>
    <table>
      <tr>
        <td>Total Output Tax (Part A)</td>
        <td class="amount">${taxService.formatLKR(vatReturn.outputTax.totalOutputTax)}</td>
      </tr>
      <tr>
        <td>Less: Total Input Tax (Part B)</td>
        <td class="amount">(${taxService.formatLKR(vatReturn.inputTax.totalInputTax)})</td>
      </tr>
      <tr class="total-row">
        <td><strong>Net VAT Payable / (Refundable)</strong></td>
        <td class="amount"><strong>${taxService.formatLKR(vatReturn.netVATPayable)}</strong></td>
      </tr>
    </table>
  </div>

  <!-- SSCL Calculation -->
  <div class="section">
    <div class="section-title">Part D - Social Security Contribution Levy (SSCL)</div>
    <table>
      <tr>
        <td>SSCL on Taxable Supplies (2.5%)</td>
        <td class="amount">${taxService.formatLKR(vatReturn.ssclPayable)}</td>
      </tr>
    </table>
  </div>

  <!-- Total Payable -->
  <div class="section">
    <div class="section-title">Summary - Total Amount Payable</div>
    <table>
      <tr>
        <td>Net VAT Payable</td>
        <td class="amount">${taxService.formatLKR(vatReturn.netVATPayable)}</td>
      </tr>
      <tr>
        <td>SSCL Payable</td>
        <td class="amount">${taxService.formatLKR(vatReturn.ssclPayable)}</td>
      </tr>
      <tr class="payable-row">
        <td><strong>TOTAL AMOUNT PAYABLE TO IRD</strong></td>
        <td class="amount"><strong>${taxService.formatLKR(vatReturn.totalPayable)}</strong></td>
      </tr>
    </table>
  </div>

  <!-- Statistics -->
  <div class="section">
    <div class="info-row">
      <span class="info-label">Total Invoices Issued:</span>
      <span class="info-value">${vatReturn.invoiceCount}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Report Generated:</span>
      <span class="info-value">${new Date().toLocaleString('en-GB')}</span>
    </div>
  </div>

  <div class="footer">
    <p>This is a computer-generated report for internal use and tax filing purposes.</p>
    <p><strong>${tenant.legalName}</strong> | TIN: ${tenant.tin} | VAT Reg: ${tenant.taxConfig.vatNumber}</p>
    <p>Generated by Multi-Tenant Invoicing System</p>
  </div>
</body>
</html>
    `;

    // Generate PDF using Puppeteer
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
      printBackground: true,
    });

    await browser.close();

    // Upload to Firebase Storage
    const storage = admin.storage();
    const filename = `tax-reports/${tenant.id}/vat-return-${vatReturn.period.year}-Q${vatReturn.period.quarter}.pdf`;
    const bucket = storage.bucket();
    const file = bucket.file(filename);

    await file.save(pdfBuffer, {
      metadata: {
        contentType: 'application/pdf',
        metadata: {
          tenantId: tenant.id,
          reportType: 'vat-return',
          period: `${vatReturn.period.year}-Q${vatReturn.period.quarter}`,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    await file.makePublic();

    const pdfUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
    return pdfUrl;
  }

  /**
   * Get quarter from date
   */
  private getQuarter(date: Date): number {
    const month = date.getMonth() + 1;
    return Math.ceil(month / 3);
  }

  /**
   * Get default VAT filing period (quarterly)
   */
  getVATFilingPeriod(year: number, quarter: number): { startDate: Date; endDate: Date } {
    const startMonth = (quarter - 1) * 3;
    const startDate = new Date(year, startMonth, 1);
    const endDate = new Date(year, startMonth + 3, 0); // Last day of the quarter

    return { startDate, endDate };
  }

  /**
   * Check if VAT return is due
   */
  isVATReturnDue(tenant: Tenant): boolean {
    if (!tenant.taxConfig.vatRegistered) return false;

    const today = new Date();
    const currentQuarter = this.getQuarter(today);
    const currentYear = today.getFullYear();

    // VAT return is due by the 20th of the month following the quarter end
    const quarterEndDate = new Date(currentYear, currentQuarter * 3, 0);
    const dueDate = new Date(quarterEndDate.getFullYear(), quarterEndDate.getMonth() + 1, 20);

    return today >= dueDate;
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const taxReportingService = new TaxReportingService();
