# Enhanced Multi-Tenant Invoicing SaaS - Implementation Plan

## Executive Summary
Transform the existing invoice system into a comprehensive, multi-tenant SaaS platform with intelligent branding and full Sri Lankan tax compliance, powered entirely by Firebase.

---

## 1. Firebase Architecture Overview

### Firebase Services Used
- **Firebase Authentication** - User authentication with custom claims for RBAC
- **Cloud Firestore** - NoSQL database with multi-tenant architecture
- **Cloud Functions** (Gen2) - Backend API, triggers, and scheduled jobs
- **Firebase Storage** - Logo and PDF storage with security rules
- **Firebase Hosting** - Frontend deployment
- **Cloud Scheduler** - Automated jobs (reminders, tax calculations)

### Key Architectural Decisions
1. **Multi-Tenancy Model**: Tenant ID scoping in Firestore with security rules
2. **Data Isolation**: All documents include `tenantId` field, enforced by security rules
3. **User Context**: JWT custom claims store user's company memberships and roles
4. **Color Extraction**: Cloud Function with Sharp/Jimp for image processing
5. **PDF Generation**: Puppeteer in Cloud Functions with dynamic CSS injection

---

## 2. Firestore Database Schema (Multi-Tenant)

### 2.1 Collection Structure

```
/tenants/{tenantId}
  - name: string
  - legalName: string
  - brn: string (Business Registration Number)
  - tin: string (Taxpayer Identification Number)
  - address: object
  - branding: object
    - logoUrl: string
    - primaryColor: string
    - secondaryColor: string
    - accentColor: string
    - autoExtracted: boolean
  - taxConfig: object
    - vatRegistered: boolean
    - vatNumber: string
    - svatRegistered: boolean
    - ssclApplicable: boolean
    - defaultVatRate: number (0.15)
    - fiscalYearStart: string
  - invoiceConfig: object
    - prefix: string
    - nextNumber: number
    - paymentTerms: string
    - footerText: string
  - currency: string (default: LKR)
  - status: string (active/suspended)
  - createdAt: timestamp
  - updatedAt: timestamp

/users/{userId}
  - email: string
  - displayName: string
  - phone: string
  - photoURL: string
  - mfaEnabled: boolean
  - createdAt: timestamp
  - lastLogin: timestamp

/tenantUsers/{tenantUserId}
  - tenantId: string (indexed)
  - userId: string (indexed)
  - role: string (owner/admin/accountant/sales/viewer)
  - permissions: array
  - invitedBy: string
  - joinedAt: timestamp
  - status: string (active/suspended)

/clients/{clientId}
  - tenantId: string (indexed)
  - name: string
  - email: string
  - phone: string
  - whatsappNumber: string
  - address: object
  - tin: string
  - vatNumber: string
  - registrationType: string (vat/svat/none)
  - currency: string
  - paymentTerms: string
  - tags: array
  - createdAt: timestamp
  - updatedAt: timestamp

/products/{productId}
  - tenantId: string (indexed)
  - sku: string
  - name: string
  - description: string
  - unitPrice: number
  - taxCategory: string (standard/zero-rated/exempt)
  - taxRate: number
  - ssclApplicable: boolean
  - isActive: boolean
  - createdAt: timestamp
  - updatedAt: timestamp

/invoices/{invoiceId}
  - tenantId: string (indexed)
  - invoiceNumber: string
  - invoiceType: string (proforma/tax_invoice/credit_note/debit_note)
  - status: string (draft/sent/delivered/viewed/partial_paid/paid/overdue/cancelled)
  - clientId: string
  - clientSnapshot: object (denormalized for audit)
  - dateIssued: timestamp
  - dateDue: timestamp
  - dateOfSupply: timestamp
  - lineItems: array
    - productId: string
    - description: string
    - quantity: number
    - unitPrice: number
    - discount: number
    - taxable: boolean
    - taxCategory: string
    - taxRate: number
    - taxAmount: number
    - lineTotal: number
  - subtotal: number
  - totalDiscount: number
  - taxBreakdown: object
    - vatAmount: number
    - ssclAmount: number
    - totalTax: number
  - total: number
  - amountPaid: number
  - amountDue: number
  - currency: string
  - exchangeRate: number
  - pdfUrl: string
  - publicViewUrl: string
  - notes: string
  - terms: string
  - footerText: string
  - branding: object (snapshot for consistency)
  - recurring: object (if applicable)
    - frequency: string
    - nextDate: timestamp
    - endDate: timestamp
  - createdBy: string
  - createdAt: timestamp
  - updatedAt: timestamp

/payments/{paymentId}
  - tenantId: string (indexed)
  - invoiceId: string (indexed)
  - amount: number
  - currency: string
  - paymentMethod: string (cash/cheque/bank_transfer/online/card)
  - paymentDate: timestamp
  - reference: string
  - gatewayProvider: string (payhere/webxpay/hnb/sampath)
  - gatewayTransactionId: string
  - gatewayStatus: string
  - gatewayResponse: object
  - notes: string
  - recordedBy: string
  - createdAt: timestamp

/invoiceEvents/{eventId}
  - tenantId: string (indexed)
  - invoiceId: string (indexed)
  - eventType: string (created/sent/delivered/viewed/paid/cancelled/edited)
  - channel: string (email/whatsapp/manual/system)
  - metadata: object
    - sentTo: string
    - sentVia: string
    - ipAddress: string
    - userAgent: string
    - messageId: string
  - performedBy: string
  - timestamp: timestamp

/communicationLogs/{logId}
  - tenantId: string (indexed)
  - invoiceId: string
  - channel: string (email/whatsapp)
  - type: string (invoice_delivery/reminder/receipt)
  - recipient: string
  - status: string (sent/delivered/read/failed/bounced)
  - provider: string (gmail/smtp/whatsapp_cloud/twilio)
  - messageId: string
  - errorMessage: string
  - sentAt: timestamp
  - deliveredAt: timestamp
  - readAt: timestamp

/integrations/{integrationId}
  - tenantId: string (indexed)
  - type: string (gmail/smtp/whatsapp/payment_gateway)
  - provider: string
  - credentials: object (encrypted)
  - config: object
  - status: string (active/inactive/error)
  - lastSync: timestamp
  - createdAt: timestamp
  - updatedAt: timestamp

/auditLogs/{logId}
  - tenantId: string (indexed)
  - userId: string
  - action: string
  - resourceType: string
  - resourceId: string
  - changes: object (before/after)
  - ipAddress: string
  - userAgent: string
  - timestamp: timestamp

/recurringInvoices/{recurringId}
  - tenantId: string (indexed)
  - invoiceTemplate: object
  - frequency: string (weekly/monthly/quarterly/annually)
  - startDate: timestamp
  - endDate: timestamp
  - nextRunDate: timestamp
  - lastRunDate: timestamp
  - isActive: boolean
  - createdAt: timestamp
```

### 2.2 Firestore Indexes

```json
{
  "indexes": [
    {
      "collectionGroup": "invoices",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "tenantId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "dateIssued", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "invoices",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "tenantId", "order": "ASCENDING" },
        { "fieldPath": "dateDue", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "clients",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "tenantId", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "tenantUsers",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## 3. Intelligent Branding Engine

### 3.1 Implementation Architecture

**Cloud Function**: `extractBrandingColors`
- Triggered when logo is uploaded to Firebase Storage
- Uses Sharp library for image processing
- Extracts dominant colors using K-means clustering
- Validates WCAG contrast ratios
- Stores results in tenant document

### 3.2 Algorithm Flow

```javascript
// Color Extraction Flow
1. User uploads logo → Firebase Storage /tenants/{tenantId}/logo.png
2. Storage trigger → extractBrandingColors(logo)
3. Download image → Sharp processing
4. Extract color palette (5-10 dominant colors)
5. Select primary (most dominant), secondary (2nd), accent (complementary)
6. Validate contrast:
   - Text on primary: must have 4.5:1 ratio (WCAG AA)
   - Adjust luminance if needed
7. Generate CSS variables:
   - --primary-color, --secondary-color, --accent-color
   - --text-on-primary, --text-on-secondary
8. Update tenant document
9. Generate branded invoice CSS template
10. Notify frontend to refresh theme
```

### 3.3 Libraries Required

```json
{
  "dependencies": {
    "sharp": "^0.33.0",
    "color-thief-node": "^1.0.3",
    "chroma-js": "^2.4.2"
  }
}
```

### 3.4 Frontend Theme Application

```javascript
// Dynamic CSS injection
function applyTenantTheme(branding) {
  document.documentElement.style.setProperty('--primary-color', branding.primaryColor);
  document.documentElement.style.setProperty('--secondary-color', branding.secondaryColor);
  document.documentElement.style.setProperty('--accent-color', branding.accentColor);

  // Update MUI theme
  setTheme(createTheme({
    palette: {
      primary: { main: branding.primaryColor },
      secondary: { main: branding.secondaryColor }
    }
  }));
}
```

---

## 4. Sri Lankan Tax Compliance Engine

### 4.1 Tax Calculation Service

**Cloud Function**: `calculateInvoiceTaxes`

```typescript
interface TaxCalculationInput {
  tenantId: string;
  lineItems: LineItem[];
  clientRegistrationType: 'vat' | 'svat' | 'none';
  dateOfSupply: Date;
}

interface TaxCalculationResult {
  subtotal: number;
  vatAmount: number;
  ssclAmount: number;
  totalTax: number;
  total: number;
  lineItemTaxes: Array<{
    lineItemId: string;
    taxCategory: string;
    taxRate: number;
    taxAmount: number;
  }>;
}

async function calculateInvoiceTaxes(input: TaxCalculationInput): Promise<TaxCalculationResult> {
  // Fetch tenant tax configuration
  const tenant = await getTenant(input.tenantId);

  let subtotal = 0;
  let vatAmount = 0;
  let ssclAmount = 0;

  for (const item of input.lineItems) {
    const itemTotal = item.quantity * item.unitPrice * (1 - item.discount);
    subtotal += itemTotal;

    // VAT Calculation
    if (tenant.taxConfig.vatRegistered && item.taxCategory === 'standard') {
      const vatRate = tenant.taxConfig.defaultVatRate || 0.15;
      vatAmount += itemTotal * vatRate;
    }

    // SSCL Calculation (if applicable)
    if (tenant.taxConfig.ssclApplicable && item.ssclApplicable) {
      const ssclRate = 0.025; // 2.5% as per Sri Lankan regulations
      ssclAmount += itemTotal * ssclRate;
    }
  }

  return {
    subtotal,
    vatAmount,
    ssclAmount,
    totalTax: vatAmount + ssclAmount,
    total: subtotal + vatAmount + ssclAmount
  };
}
```

### 4.2 Tax Invoice Validation

Must ensure compliance before finalizing:

```typescript
function validateTaxInvoice(invoice: Invoice, tenant: Tenant): ValidationResult {
  const errors = [];

  if (tenant.taxConfig.vatRegistered) {
    if (!invoice.invoiceType.includes('tax_invoice')) {
      errors.push('VAT registered businesses must issue Tax Invoices');
    }
    if (!tenant.tin) {
      errors.push('Supplier TIN number is required');
    }
    if (invoice.clientSnapshot.vatNumber && !invoice.clientSnapshot.tin) {
      errors.push('Customer TIN number is required for VAT registered customers');
    }
    if (!invoice.taxBreakdown || !invoice.taxBreakdown.vatAmount) {
      errors.push('VAT breakdown is required');
    }
  }

  if (tenant.taxConfig.svatRegistered) {
    // SVAT voucher tracking requirements
    // This requires special handling
  }

  return { valid: errors.length === 0, errors };
}
```

### 4.3 SVAT Handling

SVAT requires tracking vouchers from suppliers:

```typescript
// Additional collection for SVAT tracking
/svatVouchers/{voucherId}
  - tenantId: string
  - supplierId: string
  - voucherNumber: string
  - dateIssued: timestamp
  - amount: number
  - taxAmount: number
  - linkedInvoiceId: string (if used)
  - status: string (unused/used/cancelled)
```

---

## 5. Authentication & RBAC

### 5.1 Firebase Auth Custom Claims

```typescript
// Custom claims structure
{
  tenantMemberships: {
    'tenant1Id': {
      role: 'owner',
      permissions: ['*']
    },
    'tenant2Id': {
      role: 'accountant',
      permissions: ['invoices:read', 'invoices:create', 'reports:read']
    }
  },
  activeTenantId: 'tenant1Id'
}
```

### 5.2 Permission System

```typescript
const PERMISSIONS = {
  owner: ['*'], // All permissions
  admin: [
    'tenants:read', 'tenants:update',
    'users:*',
    'invoices:*', 'clients:*', 'products:*',
    'reports:*', 'settings:*'
  ],
  accountant: [
    'tenants:read',
    'invoices:*', 'clients:read', 'products:read',
    'payments:*', 'reports:*'
  ],
  sales: [
    'tenants:read',
    'invoices:create', 'invoices:read', 'invoices:update',
    'clients:*', 'products:read'
  ],
  viewer: [
    'tenants:read',
    'invoices:read', 'clients:read', 'products:read',
    'reports:read'
  ]
};

function hasPermission(user, resource, action) {
  const activeTenant = user.customClaims.activeTenantId;
  const membership = user.customClaims.tenantMemberships[activeTenant];
  const permissions = PERMISSIONS[membership.role];

  return permissions.includes('*') ||
         permissions.includes(`${resource}:*`) ||
         permissions.includes(`${resource}:${action}`);
}
```

### 5.3 MFA Implementation

```typescript
// Enable MFA during account setup
import { multiFactor, PhoneMultiFactorGenerator } from 'firebase/auth';

async function enrollMFA(user, phoneNumber) {
  const session = await multiFactor(user).getSession();
  const phoneInfoOptions = {
    phoneNumber,
    session
  };

  const phoneAuthProvider = new PhoneAuthProvider(auth);
  const verificationId = await phoneAuthProvider.verifyPhoneNumber(
    phoneInfoOptions,
    recaptchaVerifier
  );

  // User enters verification code
  const verificationCode = await promptUserForCode();
  const cred = PhoneAuthProvider.credential(verificationId, verificationCode);
  const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);

  await multiFactor(user).enroll(multiFactorAssertion, 'Phone Number');
}
```

---

## 6. Enhanced PDF Generation

### 6.1 Dynamic Invoice Template

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    :root {
      --primary-color: {{primaryColor}};
      --secondary-color: {{secondaryColor}};
      --accent-color: {{accentColor}};
      --text-on-primary: {{textOnPrimary}};
    }

    .header {
      background: var(--primary-color);
      color: var(--text-on-primary);
      padding: 20px;
    }

    .tax-invoice-stamp {
      border: 3px solid var(--accent-color);
      color: var(--accent-color);
      font-size: 24px;
      font-weight: bold;
      padding: 10px;
      text-align: center;
      margin: 20px 0;
    }

    table th {
      background: var(--secondary-color);
      color: var(--text-on-primary);
    }

    .total-section {
      border-top: 3px solid var(--primary-color);
    }

    .vat-breakdown {
      background: #f5f5f5;
      padding: 10px;
      border-left: 4px solid var(--accent-color);
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="{{logoUrl}}" alt="{{companyName}}" style="height: 60px;">
    <h1>{{companyName}}</h1>
  </div>

  {{#if isVatRegistered}}
  <div class="tax-invoice-stamp">TAX INVOICE</div>
  {{/if}}

  <div class="company-details">
    <p><strong>{{legalName}}</strong></p>
    <p>{{address}}</p>
    {{#if tin}}<p>TIN: {{tin}}</p>{{/if}}
    {{#if vatNumber}}<p>VAT Reg. No.: {{vatNumber}}</p>{{/if}}
    {{#if brn}}<p>BRN: {{brn}}</p>{{/if}}
  </div>

  <!-- Invoice details, line items, etc. -->

  <div class="vat-breakdown">
    <table>
      <tr><td>Subtotal:</td><td>{{currency}} {{subtotal}}</td></tr>
      {{#if vatAmount}}
      <tr><td>VAT ({{vatRate}}%):</td><td>{{currency}} {{vatAmount}}</td></tr>
      {{/if}}
      {{#if ssclAmount}}
      <tr><td>SSCL (2.5%):</td><td>{{currency}} {{ssclAmount}}</td></tr>
      {{/if}}
      <tr class="total"><td><strong>Total:</strong></td><td><strong>{{currency}} {{total}}</strong></td></tr>
    </table>
  </div>
</body>
</html>
```

### 6.2 PDF Generation Function

```typescript
import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';

async function generateInvoicePDF(invoiceId: string) {
  // Fetch invoice with all relationships
  const invoice = await getInvoiceWithDetails(invoiceId);
  const tenant = await getTenant(invoice.tenantId);

  // Compile template with data
  const template = Handlebars.compile(invoiceTemplateHTML);
  const html = template({
    ...invoice,
    ...tenant,
    primaryColor: tenant.branding.primaryColor,
    secondaryColor: tenant.branding.secondaryColor,
    accentColor: tenant.branding.accentColor,
    textOnPrimary: calculateTextColor(tenant.branding.primaryColor),
    isVatRegistered: tenant.taxConfig.vatRegistered
  });

  // Generate PDF
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html);

  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
  });

  await browser.close();

  // Upload to Firebase Storage
  const filename = `invoices/${invoice.tenantId}/${invoiceId}.pdf`;
  const file = storage.bucket().file(filename);
  await file.save(pdfBuffer, { contentType: 'application/pdf' });

  const pdfUrl = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 1000 * 60 * 60 * 24 * 365 // 1 year
  });

  return pdfUrl[0];
}
```

---

## 7. Communication Integration

### 7.1 WhatsApp Business API

```typescript
// Cloud Function: sendInvoiceViaWhatsApp
import axios from 'axios';

async function sendInvoiceViaWhatsApp(invoiceId: string) {
  const invoice = await getInvoice(invoiceId);
  const integration = await getIntegration(invoice.tenantId, 'whatsapp');

  // WhatsApp message template (must be pre-approved)
  const template = {
    name: 'invoice_delivery',
    language: { code: 'en' },
    components: [
      {
        type: 'header',
        parameters: [
          { type: 'document', document: { link: invoice.pdfUrl } }
        ]
      },
      {
        type: 'body',
        parameters: [
          { type: 'text', text: invoice.clientSnapshot.name },
          { type: 'text', text: invoice.invoiceNumber },
          { type: 'text', text: `${invoice.currency} ${invoice.total.toFixed(2)}` }
        ]
      }
    ]
  };

  const response = await axios.post(
    `https://graph.facebook.com/v18.0/${integration.config.phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: invoice.clientSnapshot.whatsappNumber,
      type: 'template',
      template
    },
    {
      headers: {
        'Authorization': `Bearer ${integration.credentials.accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  // Log communication
  await createCommunicationLog({
    tenantId: invoice.tenantId,
    invoiceId,
    channel: 'whatsapp',
    type: 'invoice_delivery',
    recipient: invoice.clientSnapshot.whatsappNumber,
    status: 'sent',
    provider: 'whatsapp_cloud',
    messageId: response.data.messages[0].id,
    sentAt: new Date()
  });

  return response.data;
}
```

### 7.2 Gmail OAuth Integration

```typescript
import { google } from 'googleapis';

async function sendInvoiceViaGmail(invoiceId: string) {
  const invoice = await getInvoice(invoiceId);
  const integration = await getIntegration(invoice.tenantId, 'gmail');

  // Setup OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: integration.credentials.accessToken,
    refresh_token: integration.credentials.refreshToken
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Create email with tracking pixel
  const trackingPixel = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/trackEmailOpen?invoiceId=${invoiceId}`;

  const emailContent = `
From: ${integration.config.fromEmail}
To: ${invoice.clientSnapshot.email}
Subject: Invoice ${invoice.invoiceNumber} from ${invoice.tenantSnapshot.name}
Content-Type: multipart/mixed; boundary="boundary"

--boundary
Content-Type: text/html; charset="UTF-8"

<html>
<body>
  <p>Dear ${invoice.clientSnapshot.name},</p>
  <p>Please find attached invoice ${invoice.invoiceNumber} for ${invoice.currency} ${invoice.total.toFixed(2)}.</p>
  <p>View invoice online: <a href="${invoice.publicViewUrl}">Click here</a></p>
  <img src="${trackingPixel}" width="1" height="1" alt="" />
</body>
</html>

--boundary
Content-Type: application/pdf; name="invoice-${invoice.invoiceNumber}.pdf"
Content-Disposition: attachment; filename="invoice-${invoice.invoiceNumber}.pdf"
Content-Transfer-Encoding: base64

${pdfBase64Content}
--boundary--
  `;

  const encodedEmail = Buffer.from(emailContent).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedEmail }
  });

  // Update invoice status
  await updateInvoice(invoiceId, { status: 'sent', sentAt: new Date() });

  // Log event
  await createInvoiceEvent({
    tenantId: invoice.tenantId,
    invoiceId,
    eventType: 'sent',
    channel: 'email',
    metadata: { messageId: response.data.id, sentTo: invoice.clientSnapshot.email }
  });

  return response.data;
}
```

---

## 8. Payment Gateway Integration (Sri Lankan)

### 8.1 PayHere Integration

```typescript
import crypto from 'crypto';

async function initiatePayHerePayment(invoiceId: string) {
  const invoice = await getInvoice(invoiceId);
  const integration = await getIntegration(invoice.tenantId, 'payhere');

  const merchantId = integration.credentials.merchantId;
  const merchantSecret = integration.credentials.merchantSecret;

  const paymentData = {
    merchant_id: merchantId,
    return_url: `${FRONTEND_URL}/invoices/${invoiceId}/payment-success`,
    cancel_url: `${FRONTEND_URL}/invoices/${invoiceId}/payment-cancel`,
    notify_url: `${FUNCTIONS_URL}/webhooks/payhere`,
    order_id: invoice.invoiceNumber,
    items: invoice.invoiceNumber,
    currency: invoice.currency,
    amount: invoice.amountDue.toFixed(2),
    first_name: invoice.clientSnapshot.name.split(' ')[0],
    last_name: invoice.clientSnapshot.name.split(' ').slice(1).join(' '),
    email: invoice.clientSnapshot.email,
    phone: invoice.clientSnapshot.phone,
    address: invoice.clientSnapshot.address.line1,
    city: invoice.clientSnapshot.address.city,
    country: 'Sri Lanka'
  };

  // Generate hash
  const hashString = `${merchantId}${paymentData.order_id}${paymentData.amount}${paymentData.currency}${merchantSecret}`;
  paymentData.hash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

  return {
    paymentUrl: 'https://sandbox.payhere.lk/pay/checkout',
    paymentData
  };
}

// Webhook handler
export const payhereWebhook = functions.https.onRequest(async (req, res) => {
  const {
    merchant_id,
    order_id,
    payment_id,
    payhere_amount,
    payhere_currency,
    status_code,
    md5sig
  } = req.body;

  // Verify signature
  const integration = await getIntegrationByMerchantId(merchant_id);
  const merchantSecret = integration.credentials.merchantSecret;

  const localHash = crypto.createHash('md5')
    .update(`${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${merchantSecret}`)
    .digest('hex')
    .toUpperCase();

  if (localHash !== md5sig) {
    return res.status(400).send('Invalid signature');
  }

  // Find invoice
  const invoice = await getInvoiceByNumber(integration.tenantId, order_id);

  if (status_code === '2') { // Success
    // Record payment
    await createPayment({
      tenantId: invoice.tenantId,
      invoiceId: invoice.id,
      amount: parseFloat(payhere_amount),
      currency: payhere_currency,
      paymentMethod: 'online',
      paymentDate: new Date(),
      gatewayProvider: 'payhere',
      gatewayTransactionId: payment_id,
      gatewayStatus: 'success'
    });

    // Update invoice
    const newAmountPaid = invoice.amountPaid + parseFloat(payhere_amount);
    const newStatus = newAmountPaid >= invoice.total ? 'paid' : 'partial_paid';

    await updateInvoice(invoice.id, {
      amountPaid: newAmountPaid,
      amountDue: invoice.total - newAmountPaid,
      status: newStatus
    });

    // Log event
    await createInvoiceEvent({
      tenantId: invoice.tenantId,
      invoiceId: invoice.id,
      eventType: 'paid',
      metadata: { paymentId: payment_id, amount: payhere_amount }
    });
  }

  res.status(200).send('OK');
});
```

---

## 9. Reporting Module

### 9.1 Tax Summary Report (for IRD Filing)

```typescript
async function generateTaxSummaryReport(tenantId: string, startDate: Date, endDate: Date) {
  const invoices = await db.collection('invoices')
    .where('tenantId', '==', tenantId)
    .where('status', '==', 'paid')
    .where('dateIssued', '>=', startDate)
    .where('dateIssued', '<=', endDate)
    .get();

  let totalRevenue = 0;
  let totalVAT = 0;
  let totalSSCL = 0;

  const categoryBreakdown = {
    standard: { sales: 0, vat: 0 },
    zeroRated: { sales: 0, vat: 0 },
    exempt: { sales: 0, vat: 0 }
  };

  invoices.forEach(doc => {
    const invoice = doc.data();
    totalRevenue += invoice.subtotal;
    totalVAT += invoice.taxBreakdown.vatAmount || 0;
    totalSSCL += invoice.taxBreakdown.ssclAmount || 0;

    invoice.lineItems.forEach(item => {
      const category = item.taxCategory || 'standard';
      categoryBreakdown[category].sales += item.lineTotal;
      categoryBreakdown[category].vat += item.taxAmount || 0;
    });
  });

  return {
    period: { startDate, endDate },
    summary: {
      totalRevenue,
      totalVAT,
      totalSSCL,
      totalTax: totalVAT + totalSSCL
    },
    categoryBreakdown,
    invoiceCount: invoices.size
  };
}
```

### 9.2 Aged Receivables Report

```typescript
async function generateAgedReceivablesReport(tenantId: string) {
  const today = new Date();

  const overdueInvoices = await db.collection('invoices')
    .where('tenantId', '==', tenantId)
    .where('status', 'in', ['sent', 'viewed', 'partial_paid', 'overdue'])
    .get();

  const aging = {
    current: 0,      // 0-30 days
    days30: 0,       // 31-60 days
    days60: 0,       // 61-90 days
    days90: 0        // 90+ days
  };

  const invoicesByClient = {};

  overdueInvoices.forEach(doc => {
    const invoice = doc.data();
    const daysPastDue = Math.floor((today - invoice.dateDue.toDate()) / (1000 * 60 * 60 * 24));

    const outstanding = invoice.amountDue;

    if (daysPastDue <= 30) {
      aging.current += outstanding;
    } else if (daysPastDue <= 60) {
      aging.days30 += outstanding;
    } else if (daysPastDue <= 90) {
      aging.days60 += outstanding;
    } else {
      aging.days90 += outstanding;
    }

    // Group by client
    const clientId = invoice.clientId;
    if (!invoicesByClient[clientId]) {
      invoicesByClient[clientId] = {
        clientName: invoice.clientSnapshot.name,
        invoices: [],
        totalOutstanding: 0
      };
    }

    invoicesByClient[clientId].invoices.push({
      invoiceNumber: invoice.invoiceNumber,
      dateIssued: invoice.dateIssued,
      dateDue: invoice.dateDue,
      amount: invoice.total,
      amountDue: invoice.amountDue,
      daysPastDue
    });

    invoicesByClient[clientId].totalOutstanding += outstanding;
  });

  return {
    aging,
    totalOutstanding: aging.current + aging.days30 + aging.days60 + aging.days90,
    invoicesByClient
  };
}
```

---

## 10. Frontend Implementation

### 10.1 Company Switcher Component

```typescript
// CompanySwitcher.tsx
import { useState, useEffect } from 'react';
import { MenuItem, Select, Avatar } from '@mui/material';
import { useAuth } from '../hooks/useAuth';

export function CompanySwitcher() {
  const { user, switchActiveTenant } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [activeCompanyId, setActiveCompanyId] = useState('');

  useEffect(() => {
    if (user?.customClaims?.tenantMemberships) {
      const membershipIds = Object.keys(user.customClaims.tenantMemberships);
      fetchCompanies(membershipIds).then(setCompanies);
      setActiveCompanyId(user.customClaims.activeTenantId);
    }
  }, [user]);

  const handleSwitch = async (tenantId) => {
    await switchActiveTenant(tenantId);
    setActiveCompanyId(tenantId);

    // Refresh theme
    const company = companies.find(c => c.id === tenantId);
    if (company?.branding) {
      applyTenantTheme(company.branding);
    }

    // Reload data
    window.location.reload();
  };

  return (
    <Select
      value={activeCompanyId}
      onChange={(e) => handleSwitch(e.target.value)}
      renderValue={(value) => {
        const company = companies.find(c => c.id === value);
        return (
          <Box display="flex" alignItems="center">
            <Avatar src={company?.branding?.logoUrl} sx={{ width: 24, height: 24, mr: 1 }} />
            {company?.name}
          </Box>
        );
      }}
    >
      {companies.map(company => (
        <MenuItem key={company.id} value={company.id}>
          <Avatar src={company.branding?.logoUrl} sx={{ width: 32, height: 32, mr: 2 }} />
          <Box>
            <Typography variant="body1">{company.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {user.customClaims.tenantMemberships[company.id].role}
            </Typography>
          </Box>
        </MenuItem>
      ))}
    </Select>
  );
}
```

### 10.2 Dynamic Theme Hook

```typescript
// hooks/useTenantTheme.ts
import { useEffect } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { useActiveTenant } from './useActiveTenant';

export function useTenantTheme() {
  const { tenant } = useActiveTenant();

  useEffect(() => {
    if (tenant?.branding) {
      applyTenantTheme(tenant.branding);
    }
  }, [tenant]);

  const theme = createTheme({
    palette: {
      primary: {
        main: tenant?.branding?.primaryColor || '#2563eb'
      },
      secondary: {
        main: tenant?.branding?.secondaryColor || '#10b981'
      }
    }
  });

  return theme;
}

function applyTenantTheme(branding) {
  document.documentElement.style.setProperty('--primary-color', branding.primaryColor);
  document.documentElement.style.setProperty('--secondary-color', branding.secondaryColor);
  document.documentElement.style.setProperty('--accent-color', branding.accentColor);
}
```

---

## 11. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function getActiveTenantId() {
      return request.auth.token.activeTenantId;
    }

    function isTenantMember(tenantId) {
      return isAuthenticated() &&
             tenantId in request.auth.token.tenantMemberships;
    }

    function hasRole(tenantId, role) {
      return isTenantMember(tenantId) &&
             request.auth.token.tenantMemberships[tenantId].role == role;
    }

    function hasPermission(tenantId, permission) {
      return isTenantMember(tenantId) &&
             (hasRole(tenantId, 'owner') ||
              permission in request.auth.token.tenantMemberships[tenantId].permissions);
    }

    // Tenant rules
    match /tenants/{tenantId} {
      allow read: if isTenantMember(tenantId);
      allow update: if hasPermission(tenantId, 'tenants:update');
      allow create: if isAuthenticated(); // Any authenticated user can create tenant
    }

    // Tenant Users rules
    match /tenantUsers/{tenantUserId} {
      allow read: if isTenantMember(resource.data.tenantId);
      allow create, update: if hasPermission(resource.data.tenantId, 'users:manage');
    }

    // Clients rules
    match /clients/{clientId} {
      allow read: if isTenantMember(resource.data.tenantId);
      allow create, update: if hasPermission(resource.data.tenantId, 'clients:create');
      allow delete: if hasPermission(resource.data.tenantId, 'clients:delete');
    }

    // Products rules
    match /products/{productId} {
      allow read: if isTenantMember(resource.data.tenantId);
      allow create, update: if hasPermission(resource.data.tenantId, 'products:create');
    }

    // Invoices rules
    match /invoices/{invoiceId} {
      allow read: if isTenantMember(resource.data.tenantId);
      allow create: if hasPermission(request.resource.data.tenantId, 'invoices:create') &&
                       request.resource.data.tenantId == getActiveTenantId();
      allow update: if hasPermission(resource.data.tenantId, 'invoices:update');
      allow delete: if hasRole(resource.data.tenantId, 'owner');
    }

    // Payments rules
    match /payments/{paymentId} {
      allow read: if isTenantMember(resource.data.tenantId);
      allow create: if hasPermission(request.resource.data.tenantId, 'payments:create');
    }

    // Events and logs (read-only for most users)
    match /invoiceEvents/{eventId} {
      allow read: if isTenantMember(resource.data.tenantId);
      allow write: if false; // Only backend can write
    }

    match /auditLogs/{logId} {
      allow read: if hasRole(resource.data.tenantId, 'owner') ||
                     hasRole(resource.data.tenantId, 'admin');
      allow write: if false; // Only backend can write
    }
  }
}
```

---

## 12. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Setup Firebase project and services
- [ ] Implement Firestore schema
- [ ] Build authentication with custom claims
- [ ] Create RBAC middleware
- [ ] Deploy security rules

### Phase 2: Intelligent Branding (Week 3)
- [ ] Implement color extraction function
- [ ] Build logo upload UI
- [ ] Create dynamic CSS injection
- [ ] Test contrast validation

### Phase 3: Tax Compliance (Week 4)
- [ ] Build tax calculation engine
- [ ] Implement VAT/SVAT/SSCL logic
- [ ] Create tax validation rules
- [ ] Build tax configuration UI

### Phase 4: Invoice Management (Weeks 5-6)
- [ ] Build invoice CRUD operations
- [ ] Implement PDF generation with branding
- [ ] Create invoice templates
- [ ] Add recurring invoice scheduler

### Phase 5: Communication (Week 7)
- [ ] Integrate WhatsApp Business API
- [ ] Implement Gmail OAuth
- [ ] Build email tracking
- [ ] Create reminder scheduler

### Phase 6: Payments (Week 8)
- [ ] Integrate PayHere
- [ ] Add manual payment recording
- [ ] Build payment reconciliation
- [ ] Create payment tracking

### Phase 7: Reporting (Week 9)
- [ ] Build tax summary reports
- [ ] Create aged receivables
- [ ] Implement sales analytics
- [ ] Add export functionality

### Phase 8: Frontend (Weeks 10-11)
- [ ] Build company switcher
- [ ] Implement dynamic theming
- [ ] Create all CRUD interfaces
- [ ] Add reporting dashboards

### Phase 9: Testing & Deployment (Week 12)
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Security audit
- [ ] Production deployment

---

## 13. Estimated Costs (Firebase)

### Development Environment
- Functions: $0 (free tier)
- Firestore: $0 (free tier)
- Storage: $0 (free tier)

### Production (Monthly estimates for 100 active tenants)
- Functions: $20-50 (based on invocations)
- Firestore: $30-60 (based on reads/writes)
- Storage: $5-10 (PDF and logo storage)
- **Total**: ~$55-120/month

### Scaling (1000 active tenants)
- Functions: $200-400
- Firestore: $300-500
- Storage: $20-40
- **Total**: ~$520-940/month

---

## 14. Security Considerations

1. **Data Encryption**: All sensitive data encrypted at rest (Firebase default)
2. **API Keys**: Store in Secret Manager, not environment variables
3. **Rate Limiting**: Implement with Firebase App Check
4. **XSS Protection**: Sanitize all user inputs
5. **CSRF**: Use Firebase Auth tokens exclusively
6. **Audit Logging**: All critical operations logged
7. **Backup Strategy**: Daily Firestore exports to Cloud Storage

---

This implementation plan provides a comprehensive roadmap for building a world-class, multi-tenant invoicing SaaS platform specifically designed for the Sri Lankan market, leveraging Firebase's powerful ecosystem.
