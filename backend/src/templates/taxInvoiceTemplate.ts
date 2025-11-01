/**
 * Sri Lankan Tax Invoice Template
 * Compliant with IRD (Inland Revenue Department) regulations
 * Dynamic branding with Handlebars
 */

export const taxInvoiceTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tax Invoice - {{invoiceNumber}}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --primary-color: {{branding.primaryColor}};
      --secondary-color: {{branding.secondaryColor}};
      --accent-color: {{branding.accentColor}};
      --text-on-primary: {{branding.textOnPrimary}};
      --text-on-secondary: {{branding.textOnSecondary}};
    }

    body {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #333;
      padding: 20mm;
    }

    .header {
      background: var(--primary-color);
      color: var(--text-on-primary);
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-left {
      flex: 1;
    }

    .header-right {
      text-align: right;
    }

    .company-logo {
      max-width: 150px;
      max-height: 80px;
      margin-bottom: 10px;
    }

    .company-name {
      font-size: 22pt;
      font-weight: bold;
      margin-bottom: 5px;
    }

    .company-details {
      font-size: 9pt;
      line-height: 1.6;
      opacity: 0.9;
    }

    .tax-invoice-stamp {
      border: 4px solid var(--accent-color);
      color: var(--accent-color);
      font-size: 26pt;
      font-weight: bold;
      padding: 15px 30px;
      text-align: center;
      margin: 20px 0;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .invoice-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 30px;
    }

    .section-title {
      font-size: 10pt;
      font-weight: bold;
      color: var(--primary-color);
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .info-box {
      background: #f8f9fa;
      padding: 15px;
      border-left: 4px solid var(--secondary-color);
      border-radius: 4px;
    }

    .info-row {
      display: flex;
      margin-bottom: 8px;
      font-size: 10pt;
    }

    .info-label {
      font-weight: 600;
      min-width: 120px;
      color: #666;
    }

    .info-value {
      flex: 1;
      color: #333;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }

    th {
      background: var(--secondary-color);
      color: var(--text-on-secondary);
      padding: 12px 10px;
      text-align: left;
      font-size: 10pt;
      font-weight: 600;
    }

    td {
      padding: 10px;
      border-bottom: 1px solid #e0e0e0;
      font-size: 10pt;
    }

    tr:hover {
      background: #f5f5f5;
    }

    .text-right {
      text-align: right;
    }

    .text-center {
      text-align: center;
    }

    .item-description {
      color: #666;
      font-size: 9pt;
      font-style: italic;
    }

    .tax-breakdown {
      background: #f8f9fa;
      padding: 20px;
      border-left: 4px solid var(--accent-color);
      border-radius: 4px;
      margin: 20px 0;
    }

    .tax-breakdown table {
      margin: 0;
    }

    .tax-breakdown td {
      border: none;
      padding: 8px 0;
    }

    .total-row {
      font-size: 12pt;
      font-weight: bold;
      background: var(--primary-color);
      color: var(--text-on-primary);
    }

    .total-row td {
      padding: 15px 10px;
      border: none;
    }

    .amount-in-words {
      background: #fff3cd;
      border: 2px dashed #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
      text-align: center;
      font-weight: 600;
      font-size: 11pt;
    }

    .payment-terms {
      background: #e7f3ff;
      border-left: 4px solid #0066cc;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }

    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid var(--primary-color);
      font-size: 9pt;
      color: #666;
      text-align: center;
    }

    .footer-notes {
      margin-top: 10px;
      font-size: 8pt;
      line-height: 1.6;
    }

    .page-number {
      position: fixed;
      bottom: 10mm;
      right: 10mm;
      font-size: 9pt;
      color: #999;
    }

    @media print {
      body {
        padding: 0;
      }

      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      {{#if branding.logoUrl}}
      <img src="{{branding.logoUrl}}" alt="{{companyName}}" class="company-logo">
      {{/if}}
      <div class="company-name">{{legalName}}</div>
      <div class="company-details">
        {{address.line1}}<br>
        {{#if address.line2}}{{address.line2}}<br>{{/if}}
        {{address.city}}, {{address.province}} {{address.postalCode}}<br>
        {{#if phone}}Tel: {{phone}} | {{/if}}Email: {{email}}
      </div>
    </div>
    <div class="header-right">
      <div style="font-size: 14pt; margin-bottom: 10px;">Invoice #{{invoiceNumber}}</div>
      <div>Date: {{formatDate dateIssued}}</div>
    </div>
  </div>

  <!-- Tax Invoice Stamp -->
  {{#if isVatRegistered}}
  <div class="tax-invoice-stamp">
    TAX INVOICE
  </div>
  {{/if}}

  <!-- Supplier & Customer Information -->
  <div class="invoice-meta">
    <!-- Supplier Details -->
    <div>
      <div class="section-title">Supplier Details</div>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Legal Name:</span>
          <span class="info-value">{{legalName}}</span>
        </div>
        {{#if tin}}
        <div class="info-row">
          <span class="info-label">TIN:</span>
          <span class="info-value">{{tin}}</span>
        </div>
        {{/if}}
        {{#if vatNumber}}
        <div class="info-row">
          <span class="info-label">VAT Reg. No:</span>
          <span class="info-value">{{vatNumber}}</span>
        </div>
        {{/if}}
        {{#if brn}}
        <div class="info-row">
          <span class="info-label">BRN:</span>
          <span class="info-value">{{brn}}</span>
        </div>
        {{/if}}
      </div>
    </div>

    <!-- Customer Details -->
    <div>
      <div class="section-title">Bill To</div>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Customer:</span>
          <span class="info-value">{{clientSnapshot.name}}</span>
        </div>
        {{#if clientSnapshot.address}}
        <div class="info-row">
          <span class="info-label">Address:</span>
          <span class="info-value">{{clientSnapshot.address.line1}}, {{clientSnapshot.address.city}}</span>
        </div>
        {{/if}}
        {{#if clientSnapshot.tin}}
        <div class="info-row">
          <span class="info-label">TIN:</span>
          <span class="info-value">{{clientSnapshot.tin}}</span>
        </div>
        {{/if}}
        {{#if clientSnapshot.vatNumber}}
        <div class="info-row">
          <span class="info-label">VAT Reg. No:</span>
          <span class="info-value">{{clientSnapshot.vatNumber}}</span>
        </div>
        {{/if}}
      </div>
    </div>
  </div>

  <!-- Invoice Dates -->
  <div style="margin: 20px 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
    <div class="info-box">
      <div class="info-label" style="margin-bottom: 5px;">Invoice Date</div>
      <div class="info-value" style="font-weight: bold;">{{formatDate dateIssued}}</div>
    </div>
    {{#if dateOfSupply}}
    <div class="info-box">
      <div class="info-label" style="margin-bottom: 5px;">Date of Supply</div>
      <div class="info-value" style="font-weight: bold;">{{formatDate dateOfSupply}}</div>
    </div>
    {{/if}}
    {{#if dateDue}}
    <div class="info-box">
      <div class="info-label" style="margin-bottom: 5px;">Due Date</div>
      <div class="info-value" style="font-weight: bold;">{{formatDate dateDue}}</div>
    </div>
    {{/if}}
  </div>

  <!-- Line Items -->
  <table>
    <thead>
      <tr>
        <th style="width: 5%;">#</th>
        <th style="width: 40%;">Description</th>
        <th style="width: 10%;" class="text-center">Qty</th>
        <th style="width: 12%;" class="text-right">Unit Price</th>
        <th style="width: 10%;" class="text-right">Discount</th>
        <th style="width: 10%;" class="text-right">Tax</th>
        <th style="width: 13%;" class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      {{#each lineItems}}
      <tr>
        <td class="text-center">{{add @index 1}}</td>
        <td>
          <strong>{{this.description}}</strong>
          {{#if this.productId}}
          <div class="item-description">SKU: {{this.productId}}</div>
          {{/if}}
          {{#if this.taxCategory}}
          <div class="item-description">Tax: {{capitalize this.taxCategory}}</div>
          {{/if}}
        </td>
        <td class="text-center">{{this.quantity}}</td>
        <td class="text-right">{{formatCurrency this.unitPrice ../currency}}</td>
        <td class="text-right">{{percentage this.discount}}</td>
        <td class="text-right">{{formatCurrency this.taxAmount ../currency}}</td>
        <td class="text-right">{{formatCurrency this.lineTotal ../currency}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <!-- Tax Breakdown -->
  <div class="tax-breakdown">
    <div class="section-title">Tax Breakdown & Summary</div>
    <table>
      <tr>
        <td style="width: 70%;">Subtotal (Before Tax)</td>
        <td class="text-right" style="font-weight: 600;">{{formatCurrency subtotal currency}}</td>
      </tr>
      {{#if totalDiscount}}
      <tr>
        <td>Total Discount</td>
        <td class="text-right" style="color: #d32f2f;">- {{formatCurrency totalDiscount currency}}</td>
      </tr>
      {{/if}}

      {{#if taxBreakdown.vatAmount}}
      <tr style="background: #e3f2fd;">
        <td>
          <strong>VAT ({{multiply taxConfig.defaultVatRate 100}}%)</strong>
          <div style="font-size: 9pt; color: #666; margin-top: 3px;">
            Taxable: {{formatCurrency taxSummary.taxableSupplies currency}}
          </div>
        </td>
        <td class="text-right"><strong>{{formatCurrency taxBreakdown.vatAmount currency}}</strong></td>
      </tr>
      {{/if}}

      {{#if taxBreakdown.ssclAmount}}
      <tr style="background: #fff3e0;">
        <td>
          <strong>SSCL (2.5%)</strong>
          <div style="font-size: 9pt; color: #666; margin-top: 3px;">Social Security Contribution Levy</div>
        </td>
        <td class="text-right"><strong>{{formatCurrency taxBreakdown.ssclAmount currency}}</strong></td>
      </tr>
      {{/if}}

      {{#if taxSummary.zeroRatedSupplies}}
      <tr>
        <td style="font-size: 9pt; color: #666; padding-left: 20px;">
          Zero-Rated Supplies
        </td>
        <td class="text-right" style="font-size: 9pt; color: #666;">{{formatCurrency taxSummary.zeroRatedSupplies currency}}</td>
      </tr>
      {{/if}}

      {{#if taxSummary.exemptSupplies}}
      <tr>
        <td style="font-size: 9pt; color: #666; padding-left: 20px;">
          Exempt Supplies
        </td>
        <td class="text-right" style="font-size: 9pt; color: #666;">{{formatCurrency taxSummary.exemptSupplies currency}}</td>
      </tr>
      {{/if}}
    </table>
  </div>

  <!-- Grand Total -->
  <table>
    <tr class="total-row">
      <td style="width: 70%; font-size: 14pt;">TOTAL AMOUNT DUE</td>
      <td class="text-right" style="font-size: 16pt;">{{formatCurrency total currency}}</td>
    </tr>
  </table>

  <!-- Amount in Words -->
  <div class="amount-in-words">
    Amount in Words: {{amountInWords total}}
  </div>

  <!-- Payment Terms -->
  {{#if terms}}
  <div class="payment-terms">
    <div class="section-title">Payment Terms</div>
    <div>{{terms}}</div>
  </div>
  {{/if}}

  <!-- Notes -->
  {{#if notes}}
  <div style="margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 4px;">
    <div class="section-title">Notes</div>
    <div style="white-space: pre-wrap;">{{notes}}</div>
  </div>
  {{/if}}

  <!-- Footer -->
  <div class="footer">
    {{#if footerText}}
    <div style="margin-bottom: 10px;">{{footerText}}</div>
    {{/if}}

    <div class="footer-notes">
      This is a computer-generated tax invoice and is valid without signature.<br>
      For any queries, please contact us at {{email}} or {{phone}}<br>
      <strong>{{legalName}}</strong> | TIN: {{tin}} {{#if vatNumber}}| VAT Reg: {{vatNumber}}{{/if}}
    </div>
  </div>

  <!-- Page Number -->
  <div class="page-number">Page 1 of 1</div>
</body>
</html>
`;
