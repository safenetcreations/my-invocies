/**
 * PDF Generation Service
 * Uses Puppeteer and Handlebars for branded, compliant invoice PDFs
 */

import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import * as admin from 'firebase-admin';
import { Invoice, Tenant } from './multiTenantFirestore';
import { taxService } from './taxService';
import { taxInvoiceTemplate } from '../templates/taxInvoiceTemplate';

const storage = admin.storage();

// ============================================================================
// HANDLEBARS HELPERS
// ============================================================================

// Register custom Handlebars helpers
Handlebars.registerHelper('formatDate', (date: any) => {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
});

Handlebars.registerHelper('formatCurrency', (amount: number, currency: string) => {
  if (currency === 'LKR') {
    return taxService.formatLKR(amount);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(amount);
});

Handlebars.registerHelper('percentage', (value: number) => {
  return (value * 100).toFixed(2) + '%';
});

Handlebars.registerHelper('multiply', (a: number, b: number) => {
  return (a * b).toFixed(2);
});

Handlebars.registerHelper('add', (a: number, b: number) => {
  return a + b;
});

Handlebars.registerHelper('capitalize', (str: string) => {
  if (!str) return '';
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
});

// ============================================================================
// PDF GENERATION SERVICE
// ============================================================================

export class PDFGenerationService {
  /**
   * Generate branded PDF for invoice
   */
  async generateInvoicePDF(invoice: Invoice, tenant: Tenant): Promise<string> {
    try {
      // Prepare template data
      const templateData = {
        ...invoice,
        ...tenant,
        companyName: tenant.name,
        isVatRegistered: tenant.taxConfig.vatRegistered,
        formatDate: Handlebars.helpers.formatDate,
        formatCurrency: Handlebars.helpers.formatCurrency,
        amountInWords: taxService.amountInWords(invoice.total),
        branding: {
          primaryColor: tenant.branding?.primaryColor || '#2563eb',
          secondaryColor: tenant.branding?.secondaryColor || '#10b981',
          accentColor: tenant.branding?.accentColor || '#f59e0b',
          textOnPrimary: tenant.branding?.textOnPrimary || '#ffffff',
          textOnSecondary: tenant.branding?.textOnSecondary || '#ffffff',
          logoUrl: tenant.branding?.logoUrl || '',
        },
      };

      // Compile template
      const template = Handlebars.compile(taxInvoiceTemplate);
      const html = template(templateData);

      // Generate PDF with Puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();

      // Set content with proper encoding
      await page.setContent(html, {
        waitUntil: 'networkidle0',
      });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '10mm',
          bottom: '10mm',
          left: '10mm',
          right: '10mm',
        },
        printBackground: true,
        preferCSSPageSize: true,
      });

      await browser.close();

      // Upload to Firebase Storage
      const filename = `invoices/${tenant.id}/${invoice.id}.pdf`;
      const bucket = storage.bucket();
      const file = bucket.file(filename);

      await file.save(pdfBuffer, {
        metadata: {
          contentType: 'application/pdf',
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            tenantId: tenant.id,
            generatedAt: new Date().toISOString(),
          },
        },
      });

      // Make file publicly readable
      await file.makePublic();

      // Get public URL
      const pdfUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

      return pdfUrl;
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw new Error(`PDF generation failed: ${error}`);
    }
  }

  /**
   * Generate preview HTML (for web preview)
   */
  generateInvoicePreview(invoice: Invoice, tenant: Tenant): string {
    const templateData = {
      ...invoice,
      ...tenant,
      companyName: tenant.name,
      isVatRegistered: tenant.taxConfig.vatRegistered,
      formatDate: Handlebars.helpers.formatDate,
      formatCurrency: Handlebars.helpers.formatCurrency,
      amountInWords: taxService.amountInWords(invoice.total),
      branding: {
        primaryColor: tenant.branding?.primaryColor || '#2563eb',
        secondaryColor: tenant.branding?.secondaryColor || '#10b981',
        accentColor: tenant.branding?.accentColor || '#f59e0b',
        textOnPrimary: tenant.branding?.textOnPrimary || '#ffffff',
        textOnSecondary: tenant.branding?.textOnSecondary || '#ffffff',
        logoUrl: tenant.branding?.logoUrl || '',
      },
    };

    const template = Handlebars.compile(taxInvoiceTemplate);
    return template(templateData);
  }

  /**
   * Generate public invoice view URL
   */
  async createPublicInvoiceView(invoiceId: string, invoice: Invoice): Promise<string> {
    // This would create a publicly accessible invoice view
    // For now, return a placeholder URL
    const baseUrl = process.env.FRONTEND_URL || 'https://app.example.com';
    return `${baseUrl}/public/invoices/${invoiceId}`;
  }

  /**
   * Generate credit note PDF
   */
  async generateCreditNotePDF(invoice: Invoice, tenant: Tenant): Promise<string> {
    // Similar to tax invoice but with "CREDIT NOTE" stamp
    // For now, use the same template
    return this.generateInvoicePDF(invoice, tenant);
  }

  /**
   * Generate debit note PDF
   */
  async generateDebitNotePDF(invoice: Invoice, tenant: Tenant): Promise<string> {
    // Similar to tax invoice but with "DEBIT NOTE" stamp
    return this.generateInvoicePDF(invoice, tenant);
  }

  /**
   * Generate proforma invoice PDF
   */
  async generateProformaInvoicePDF(invoice: Invoice, tenant: Tenant): Promise<string> {
    // No tax stamp, watermark "PROFORMA"
    return this.generateInvoicePDF(invoice, tenant);
  }

  /**
   * Generate receipt PDF
   */
  async generateReceiptPDF(paymentData: any, tenant: Tenant): Promise<string> {
    // Generate payment receipt
    // Placeholder implementation
    return '';
  }

  /**
   * Delete PDF from storage
   */
  async deletePDF(pdfUrl: string): Promise<void> {
    try {
      // Extract filename from URL
      const urlParts = pdfUrl.split('/');
      const filename = urlParts.slice(-3).join('/'); // tenantId/invoiceId.pdf

      const bucket = storage.bucket();
      const file = bucket.file(filename);

      await file.delete();
    } catch (error) {
      console.error('Error deleting PDF:', error);
      // Don't throw error, just log it
    }
  }

  /**
   * Generate statement of account PDF
   */
  async generateStatementPDF(
    clientId: string,
    invoices: Invoice[],
    tenant: Tenant,
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    // Generate statement showing all invoices and payments for a client
    // Placeholder implementation
    return '';
  }

  /**
   * Batch generate PDFs for multiple invoices
   */
  async batchGeneratePDFs(invoices: Invoice[], tenant: Tenant): Promise<string[]> {
    const pdfUrls: string[] = [];

    for (const invoice of invoices) {
      try {
        const pdfUrl = await this.generateInvoicePDF(invoice, tenant);
        pdfUrls.push(pdfUrl);
      } catch (error) {
        console.error(`Error generating PDF for invoice ${invoice.id}:`, error);
        pdfUrls.push(''); // Push empty string for failed generations
      }
    }

    return pdfUrls;
  }

  /**
   * Get PDF metadata
   */
  async getPDFMetadata(pdfUrl: string): Promise<any> {
    try {
      const urlParts = pdfUrl.split('/');
      const filename = urlParts.slice(-3).join('/');

      const bucket = storage.bucket();
      const file = bucket.file(filename);

      const [metadata] = await file.getMetadata();
      return metadata;
    } catch (error) {
      console.error('Error getting PDF metadata:', error);
      return null;
    }
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const pdfGenerationService = new PDFGenerationService();
