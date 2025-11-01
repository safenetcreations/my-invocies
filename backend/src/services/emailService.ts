import nodemailer, { Transporter } from 'nodemailer';
import { google } from 'googleapis';
import { prisma } from '../index';
import { generateTrackingId } from '../routes/tracking';
import { InvoiceData } from './pdfService';

export const sendInvoiceEmail = async (invoice: any): Promise<void> => {
  try {
    // Get business email integration credentials
    const credentials = await prisma.integrationCredential.findFirst({
      where: {
        businessId: invoice.businessId,
        kind: 'GMAIL_OAUTH',
        isActive: true,
      },
    });

    if (!credentials) {
      throw new Error('No email integration configured for this business');
    }

    // Decrypt credentials (implement proper decryption)
    const emailConfig = JSON.parse(credentials.encryptedPayload);
    
    // Create transporter
    const transporter = await createEmailTransporter(emailConfig);
    
    // Generate tracking links
    const trackingId = generateTrackingId(invoice.id);
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const trackingPixelUrl = `${baseUrl}/track/open/${trackingId}.png`;
    const invoiceViewUrl = `${process.env.FRONTEND_URL}/invoice/${invoice.id}`;
    const trackedViewUrl = `${baseUrl}/track/click/${trackingId}?r=${encodeURIComponent(invoiceViewUrl)}`;

    // Email content
    const emailHTML = generateEmailHTML(invoice, trackingPixelUrl, trackedViewUrl);
    const emailText = generateEmailText(invoice, invoiceViewUrl);

    // Email options
    const mailOptions = {
      from: `${invoice.business.name} <${emailConfig.email}>`,
      to: invoice.customerEmail,
      subject: `Invoice ${invoice.invoiceNumber} from ${invoice.business.name}`,
      text: emailText,
      html: emailHTML,
      attachments: invoice.pdfUrl ? [{
        filename: `invoice-${invoice.invoiceNumber}.pdf`,
        path: `./pdfs/${invoice.pdfUrl.split('/').pop()}`, // Adjust path as needed
      }] : [],
    };

    // Send email
    const result = await transporter.sendMail(mailOptions);
    
    // Record tracking event
    await prisma.trackingEvent.create({
      data: {
        invoiceId: invoice.id,
        kind: 'EMAIL_SENT',
        metadata: {
          messageId: result.messageId,
          to: invoice.customerEmail,
          subject: mailOptions.subject,
          trackingId,
        },
      },
    });

    console.log(`📧 Email sent for invoice ${invoice.invoiceNumber} to ${invoice.customerEmail}`);
  } catch (error) {
    console.error('Email sending error:', error);
    throw error;
  }
};

const createEmailTransporter = async (emailConfig: any) => {
  if (emailConfig.type === 'gmail_oauth') {
    // Gmail OAuth setup
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: emailConfig.refreshToken,
    });

    const accessToken = await oauth2Client.getAccessToken();

    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: emailConfig.email,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: emailConfig.refreshToken,
        accessToken: accessToken.token,
      },
    } as any);
  } else if (emailConfig.type === 'smtp') {
    // SMTP setup
    return nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: {
        user: emailConfig.username,
        pass: emailConfig.password,
      },
    });
  } else {
    throw new Error('Unsupported email configuration type');
  }
};

const generateEmailHTML = (invoice: any, trackingPixelUrl: string, trackedViewUrl: string): string => {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Invoice ${invoice.invoiceNumber}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: ${invoice.business.primaryColor};
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
        }
        .content {
            background-color: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
        }
        .invoice-details {
            background-color: white;
            padding: 20px;
            border-radius: 6px;
            margin: 20px 0;
            border-left: 4px solid ${invoice.business.primaryColor};
        }
        .button {
            display: inline-block;
            background-color: ${invoice.business.primaryColor};
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin: 20px 0;
        }
        .footer {
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${invoice.business.name}</h1>
        <p>Invoice ${invoice.invoiceNumber}</p>
    </div>
    
    <div class="content">
        <h2>Hello ${invoice.customerName},</h2>
        
        <p>Thank you for your business! Please find your invoice details below:</p>
        
        <div class="invoice-details">
            <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Date Issued:</strong> ${new Date(invoice.dateIssued).toLocaleDateString()}</p>
            ${invoice.dueDate ? `<p><strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}</p>` : ''}
            <p><strong>Amount:</strong> ${formatCurrency(invoice.total, invoice.currency)}</p>
        </div>
        
        <p>
            <a href="${trackedViewUrl}" class="button">View Invoice Online</a>
        </p>
        
        <p>If you have any questions about this invoice, please contact us at ${invoice.business.email} or ${invoice.business.phone}.</p>
        
        <p>Best regards,<br>
        ${invoice.business.name}</p>
    </div>
    
    <div class="footer">
        <p>${invoice.business.name} • ${invoice.business.email} • ${invoice.business.phone}</p>
        <p>${invoice.business.address}</p>
    </div>
    
    <!-- Tracking pixel -->
    <img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="">
</body>
</html>
  `;
};

const generateEmailText = (invoice: any, invoiceViewUrl: string): string => {
  return `
Hello ${invoice.customerName},

Thank you for your business! Please find your invoice details below:

Invoice Number: ${invoice.invoiceNumber}
Date Issued: ${new Date(invoice.dateIssued).toLocaleDateString()}
${invoice.dueDate ? `Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}\n` : ''}Amount: ${formatCurrency(invoice.total, invoice.currency)}

You can view your invoice online at: ${invoiceViewUrl}

If you have any questions about this invoice, please contact us at ${invoice.business.email} or ${invoice.business.phone}.

Best regards,
${invoice.business.name}

---
${invoice.business.name}
${invoice.business.email}
${invoice.business.phone}
${invoice.business.address}
  `;
};

const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};