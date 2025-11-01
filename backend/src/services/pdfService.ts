import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

export interface InvoiceData {
  id: string;
  invoiceNumber: string;
  type: string;
  dateIssued: string;
  dateOfSupply?: string;
  dueDate?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerVatNumber?: string;
  customerAddress?: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  notes?: string;
  business: {
    name: string;
    legalName: string;
    address: string;
    vatNumber?: string;
    tinNumber?: string;
    phone?: string;
    email?: string;
    logoUrl?: string;
    primaryColor: string;
    defaultPaymentTerms: string;
  };
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
  }>;
}

export const generateInvoicePDF = async (invoiceData: InvoiceData): Promise<string> => {
  const outputDir = process.env.PDF_OUTPUT_DIR || './pdfs';
  await fs.mkdir(outputDir, { recursive: true });
  
  const filename = `invoice-${invoiceData.invoiceNumber}.pdf`;
  const outputPath = path.join(outputDir, filename);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    
    // Generate HTML content
    const html = generateInvoiceHTML(invoiceData);
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Generate PDF
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '1cm',
        right: '1cm',
        bottom: '2cm',
        left: '1cm',
      },
    });

    console.log(`📄 Generated PDF: ${outputPath}`);
    return `/pdfs/${filename}`;
  } finally {
    await browser.close();
  }
};

const generateInvoiceHTML = (invoice: InvoiceData): string => {
  const isVATRegistered = !!invoice.business.vatNumber;
  const documentTitle = isVATRegistered ? 'TAX INVOICE' : 'INVOICE';
  
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${documentTitle} - ${invoice.invoiceNumber}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Helvetica', Arial, sans-serif;
            font-size: 12px;
            line-height: 1.4;
            color: #333;
        }
        
        .invoice-container {
            max-width: 210mm;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 30px;
            border-bottom: 2px solid ${invoice.business.primaryColor};
            padding-bottom: 20px;
        }
        
        .company-info {
            flex: 1;
        }
        
        .company-logo {
            max-width: 150px;
            max-height: 80px;
            margin-bottom: 10px;
        }
        
        .document-title {
            text-align: right;
            flex: 1;
        }
        
        .document-title h1 {
            font-size: 32px;
            font-weight: bold;
            color: ${invoice.business.primaryColor};
            margin-bottom: 10px;
        }
        
        .invoice-details {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
        }
        
        .bill-to, .invoice-info {
            flex: 1;
        }
        
        .bill-to {
            margin-right: 40px;
        }
        
        .section-title {
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 10px;
            color: ${invoice.business.primaryColor};
        }
        
        .line-items {
            margin-bottom: 30px;
        }
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        
        .items-table th {
            background-color: ${invoice.business.primaryColor};
            color: white;
            padding: 12px 8px;
            text-align: left;
            font-weight: bold;
        }
        
        .items-table td {
            padding: 10px 8px;
            border-bottom: 1px solid #ddd;
        }
        
        .items-table tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        
        .totals {
            width: 300px;
            margin-left: auto;
            margin-bottom: 30px;
        }
        
        .totals table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .totals td {
            padding: 8px 12px;
            border-bottom: 1px solid #ddd;
        }
        
        .totals .total-row {
            font-weight: bold;
            font-size: 14px;
            background-color: ${invoice.business.primaryColor};
            color: white;
        }
        
        .footer {
            border-top: 1px solid #ddd;
            padding-top: 20px;
            text-align: center;
            color: #666;
            font-size: 11px;
        }
        
        .notes {
            margin-bottom: 20px;
            padding: 15px;
            background-color: #f5f5f5;
            border-left: 4px solid ${invoice.business.primaryColor};
        }
        
        .currency {
            font-weight: bold;
        }
        
        .right-align {
            text-align: right;
        }
        
        .center-align {
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="invoice-container">
        <!-- Header -->
        <div class="header">
            <div class="company-info">
                ${invoice.business.logoUrl ? `<img src="${invoice.business.logoUrl}" alt="Company Logo" class="company-logo">` : ''}
                <h2>${invoice.business.name}</h2>
                <div>${invoice.business.legalName}</div>
                <div>${invoice.business.address}</div>
                ${invoice.business.phone ? `<div>Phone: ${invoice.business.phone}</div>` : ''}
                ${invoice.business.email ? `<div>Email: ${invoice.business.email}</div>` : ''}
                ${isVATRegistered ? `<div><strong>VAT No:</strong> ${invoice.business.vatNumber}</div>` : ''}
                ${invoice.business.tinNumber ? `<div><strong>TIN No:</strong> ${invoice.business.tinNumber}</div>` : ''}
            </div>
            <div class="document-title">
                <h1>${documentTitle}</h1>
                <div><strong>Invoice #:</strong> ${invoice.invoiceNumber}</div>
                <div><strong>Date Issued:</strong> ${formatDate(invoice.dateIssued)}</div>
                ${invoice.dateOfSupply ? `<div><strong>Date of Supply:</strong> ${formatDate(invoice.dateOfSupply)}</div>` : ''}
                ${invoice.dueDate ? `<div><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</div>` : ''}
            </div>
        </div>

        <!-- Invoice Details -->
        <div class="invoice-details">
            <div class="bill-to">
                <div class="section-title">BILL TO:</div>
                <div><strong>${invoice.customerName}</strong></div>
                ${invoice.customerAddress ? `<div>${invoice.customerAddress}</div>` : ''}
                ${invoice.customerEmail ? `<div>Email: ${invoice.customerEmail}</div>` : ''}
                ${invoice.customerPhone ? `<div>Phone: ${invoice.customerPhone}</div>` : ''}
                ${invoice.customerVatNumber ? `<div><strong>VAT No:</strong> ${invoice.customerVatNumber}</div>` : ''}
            </div>
            <div class="invoice-info">
                <div class="section-title">PAYMENT TERMS:</div>
                <div>${invoice.business.defaultPaymentTerms}</div>
                <br>
                <div class="section-title">CURRENCY:</div>
                <div class="currency">${invoice.currency}</div>
            </div>
        </div>

        <!-- Line Items -->
        <div class="line-items">
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th class="center-align">Qty</th>
                        <th class="right-align">Unit Price</th>
                        ${isVATRegistered ? '<th class="right-align">VAT Rate</th>' : ''}
                        ${isVATRegistered ? '<th class="right-align">VAT Amount</th>' : ''}
                        <th class="right-align">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoice.lineItems.map(item => `
                        <tr>
                            <td>${item.description}</td>
                            <td class="center-align">${formatNumber(item.quantity)}</td>
                            <td class="right-align">${formatCurrency(item.unitPrice, invoice.currency)}</td>
                            ${isVATRegistered ? `<td class="right-align">${formatPercentage(item.taxRate)}</td>` : ''}
                            ${isVATRegistered ? `<td class="right-align">${formatCurrency(item.taxAmount, invoice.currency)}</td>` : ''}
                            <td class="right-align">${formatCurrency(item.lineTotal, invoice.currency)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- Totals -->
        <div class="totals">
            <table>
                <tr>
                    <td>Subtotal:</td>
                    <td class="right-align">${formatCurrency(invoice.subtotal, invoice.currency)}</td>
                </tr>
                ${isVATRegistered ? `
                <tr>
                    <td>VAT Total:</td>
                    <td class="right-align">${formatCurrency(invoice.taxTotal, invoice.currency)}</td>
                </tr>
                ` : ''}
                <tr class="total-row">
                    <td><strong>${isVATRegistered ? 'Total Consideration (Including VAT):' : 'Total Amount:'}</strong></td>
                    <td class="right-align"><strong>${formatCurrency(invoice.total, invoice.currency)}</strong></td>
                </tr>
            </table>
        </div>

        <!-- Notes -->
        ${invoice.notes ? `
        <div class="notes">
            <div class="section-title">NOTES:</div>
            <div>${invoice.notes}</div>
        </div>
        ` : ''}

        <!-- Footer -->
        <div class="footer">
            <div>Thank you for your business!</div>
            <div>${invoice.business.name} • ${invoice.business.email} • ${invoice.business.phone}</div>
            ${isVATRegistered ? '<div>This is a computer-generated tax invoice and is valid without signature.</div>' : ''}
        </div>
    </div>
</body>
</html>
  `;
};

// Helper functions
const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatNumber = (num: number): string => {
  return num.toString();
};

const formatPercentage = (rate: number): string => {
  return `${(rate * 100).toFixed(1)}%`;
};