# Firebase Extensions Configuration

This document provides instructions for installing and configuring recommended Firebase Extensions for the Multi-Tenant Invoice Management System.

## Recommended Extensions

### 1. Trigger Email (Email Delivery)

**Extension ID**: `firebase/firestore-send-email`

**Purpose**: Send transactional emails directly from Firestore triggers

**Installation**:
```bash
firebase ext:install firebase/firestore-send-email
```

**Configuration**:
- **SMTP Connection URI**: `smtp://username:password@smtp.gmail.com:587`
  - For Gmail: Use App Password (not regular password)
  - For SendGrid: `smtp://apikey:YOUR_API_KEY@smtp.sendgrid.net:587`
  - For AWS SES: `smtp://USERNAME:PASSWORD@email-smtp.us-east-1.amazonaws.com:587`

- **Email Documents Collection**: `mail`
- **Default FROM Email**: `noreply@yourdomain.com`
- **Default Reply-To Email**: `support@yourdomain.com`

**Usage Example**:
```javascript
// In Cloud Function
await db.collection('mail').add({
  to: 'client@example.com',
  from: 'invoices@yourdomain.com',
  replyTo: 'support@yourdomain.com',
  subject: `Invoice ${invoiceNumber} from ${tenant.name}`,
  html: emailHtml,
  attachments: [
    {
      filename: `${invoiceNumber}.pdf`,
      path: pdfUrl
    }
  ]
});
```

**Benefits**:
- Automatic retry on failure
- Delivery status tracking
- Rate limiting built-in
- No cold start delays

---

### 2. Resize Images (Logo Optimization)

**Extension ID**: `firebase/storage-resize-images`

**Purpose**: Automatically resize and optimize uploaded logos

**Installation**:
```bash
firebase ext:install firebase/storage-resize-images
```

**Configuration**:
- **Cloud Storage bucket**: `(default)`
- **Sizes of resized images**: `200x200,500x500,1000x1000`
- **Deletion of original file**: `No` (keep original)
- **Cloud Storage path for resized images**: Same folder as original
- **Cache-Control header**: `max-age=31536000` (1 year)
- **Paths that contain images**: `/logos/{tenantId}/{filename}`

**Benefits**:
- Faster page loads (optimized images)
- Automatic WebP conversion
- Thumbnail generation for UI
- Bandwidth savings

---

### 3. Delete User Data (GDPR Compliance)

**Extension ID**: `firebase/delete-user-data`

**Purpose**: Automatically delete user data when account is deleted

**Installation**:
```bash
firebase ext:install firebase/delete-user-data
```

**Configuration**:
- **Cloud Firestore paths**:
  ```
  users/{UID}
  tenant_users/{membershipId}
  activity_logs/{logId}
  ```
- **Cloud Storage paths**:
  ```
  users/{UID}
  temp/{UID}
  ```
- **Recursive delete**: `Yes`

**Benefits**:
- GDPR compliance
- Automatic cleanup
- Data privacy protection

**Important Notes**:
- Does NOT delete tenant data (invoices, clients, etc.) - only user's personal data
- Tenant ownership transfer should be handled separately before user deletion
- Consider archiving instead of deleting for audit trail compliance

---

### 4. Export Collections to BigQuery (Analytics)

**Extension ID**: `firebase/firestore-bigquery-export`

**Purpose**: Stream Firestore data to BigQuery for advanced analytics

**Installation**:
```bash
firebase ext:install firebase/firestore-bigquery-export
```

**Configuration**:
- **Collection path**: `invoices` (install multiple times for different collections)
- **Dataset ID**: `invoice_analytics`
- **Table ID**: `invoices`
- **BigQuery SQL transform**: Optional custom SQL
- **Wildcard field for arrays**: Optional

**Benefits**:
- Advanced reporting and analytics
- Business intelligence dashboards
- Revenue forecasting
- Tax reporting automation

**Recommended Collections to Export**:
1. `invoices` - For revenue analytics
2. `payments` - For payment tracking
3. `clients` - For customer analytics
4. `communication_logs` - For engagement metrics

---

### 5. Stream Collections to BigQuery (Real-time Analytics)

**Extension ID**: `firebase/firestore-bigquery-export`

**Purpose**: Real-time data streaming for live dashboards

**Setup**: Same as Export Collections above, but enable real-time sync

**Use Cases**:
- Live revenue dashboards
- Real-time invoice status monitoring
- Payment success rate tracking
- Client engagement metrics

---

### 6. Backup Collections (Optional but Recommended)

**Extension ID**: `firebase/firestore-backup-collections`

**Purpose**: Scheduled backups of Firestore data

**Installation**:
```bash
firebase ext:install firebase/firestore-backup-collections
```

**Configuration**:
- **Collections to backup**: `tenants,clients,invoices,payments`
- **Backup schedule**: `every 24 hours`
- **Backup retention**: `30 days`
- **Cloud Storage bucket**: `gs://your-project-backups`

**Benefits**:
- Disaster recovery
- Point-in-time restore
- Compliance requirements
- Peace of mind

---

## Installation Instructions

### Prerequisites

1. **Enable Required APIs**:
```bash
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudscheduler.googleapis.com \
  eventarc.googleapis.com \
  run.googleapis.com
```

2. **Install Firebase CLI** (if not already):
```bash
npm install -g firebase-tools
firebase login
```

3. **Ensure Billing is Enabled**:
- Extensions require Firebase Blaze (Pay-as-you-go) plan
- Most extensions have free tier limits

### Step-by-Step Installation

1. **Navigate to project directory**:
```bash
cd "/Users/nanthangopal/Desktop/MY INVOICES BY VS CODE"
```

2. **Install extensions one by one**:
```bash
# Email Extension
firebase ext:install firebase/firestore-send-email --project=your-project-id

# Image Resize Extension
firebase ext:install firebase/storage-resize-images --project=your-project-id

# Delete User Data Extension
firebase ext:install firebase/delete-user-data --project=your-project-id

# BigQuery Export Extension (install for each collection)
firebase ext:install firebase/firestore-bigquery-export --project=your-project-id
```

3. **Follow interactive prompts** for each extension configuration

4. **Verify installation**:
```bash
firebase ext:list
```

---

## Environment Variables for Extensions

Add these to your `.env` file and Firebase Functions config:

```bash
# SMTP Configuration (for Trigger Email extension)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# SendGrid Alternative
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx

# Image Optimization Settings
IMAGE_SIZES=200x200,500x500,1000x1000
IMAGE_QUALITY=80

# BigQuery Settings
BIGQUERY_PROJECT_ID=your-project-id
BIGQUERY_DATASET=invoice_analytics
```

---

## Extension Configuration in Firebase Console

### Via Firebase Console UI:

1. Go to **Firebase Console** → **Build** → **Extensions**
2. Click **Install Extension**
3. Browse the extensions marketplace
4. Select desired extension
5. Review details and click **Install**
6. Configure extension parameters
7. Review required APIs and permissions
8. Click **Install extension**

### Via Firebase CLI:

```bash
# List available extensions
firebase ext:list --project=your-project-id

# Install extension
firebase ext:install firebase/firestore-send-email --project=your-project-id

# Update extension configuration
firebase ext:configure firestore-send-email --project=your-project-id

# Uninstall extension
firebase ext:uninstall firestore-send-email --project=your-project-id
```

---

## Cost Estimates

All extensions operate on Firebase's pay-as-you-go pricing:

| Extension | Free Tier | Est. Cost/Month |
|-----------|-----------|-----------------|
| Trigger Email | 40,000 invocations | $0 - $50 |
| Resize Images | 2,000 builds/day | $0 - $20 |
| Delete User Data | 125K invocations | $0 |
| BigQuery Export | 10GB storage | $0 - $100 |
| Backup Collections | 5GB storage | $0 - $30 |

**Total Estimated**: $0 - $200/month for small to medium usage

---

## Testing Extensions

### Test Email Extension:
```javascript
// Test sending email
await db.collection('mail').add({
  to: 'test@example.com',
  subject: 'Test Email',
  text: 'This is a test email from Firebase Extensions'
});

// Check delivery status
const mailDoc = await db.collection('mail').doc(mailId).get();
console.log(mailDoc.data().delivery); // { state: 'SUCCESS', ... }
```

### Test Image Resize Extension:
```javascript
// Upload logo
const logoRef = storage.bucket().file('logos/test-tenant/logo.png');
await logoRef.save(buffer, { contentType: 'image/png' });

// Check for resized versions (generated automatically)
const resized200 = await storage.bucket().file('logos/test-tenant/logo_200x200.png').exists();
console.log('200x200 version created:', resized200[0]);
```

---

## Troubleshooting

### Email Extension Not Sending

**Check**:
1. SMTP credentials are correct
2. Extension has `mail` collection access
3. Check extension logs: `firebase ext:logs firestore-send-email`
4. Verify email document format

**Common Issues**:
- Gmail blocking: Enable "Less secure app access" or use App Password
- Rate limiting: Implement queue/throttling
- Invalid email addresses: Validate before adding to collection

### Image Resize Not Working

**Check**:
1. Storage path configuration matches upload path
2. Image MIME type is supported
3. Check extension logs: `firebase ext:logs storage-resize-images`

**Common Issues**:
- Path mismatch: Ensure `/logos/{tenantId}` matches config
- Unsupported format: Only JPEG, PNG, WebP supported
- Memory limits: Very large images may fail

---

## Security Considerations

1. **Email Extension**: Store SMTP credentials in Secret Manager, not environment variables
2. **Image Resize**: Limit upload sizes to prevent abuse
3. **Delete User Data**: Test thoroughly before production
4. **BigQuery Export**: Set appropriate IAM permissions
5. **Backups**: Encrypt backup buckets

---

## Maintenance

### Update Extensions Regularly:
```bash
# Check for updates
firebase ext:update firestore-send-email

# Update all extensions
firebase ext:update --all
```

### Monitor Extension Usage:
```bash
# View extension logs
firebase ext:logs firestore-send-email

# View extension metrics in Firebase Console
# Console → Extensions → [Extension Name] → Metrics
```

---

## Alternative: Custom Solutions

If Firebase Extensions don't meet your needs, consider these alternatives:

1. **Email**: Use Cloud Functions with Nodemailer directly (already implemented)
2. **Images**: Use Sharp library in Cloud Functions for custom processing
3. **Backups**: Schedule Cloud Functions to export to Cloud Storage
4. **Analytics**: Use Cloud Functions to stream to custom analytics platform

---

## Summary

Firebase Extensions provide pre-built, tested solutions that reduce development time and maintenance burden. For the invoice system:

**Recommended Priority**:
1. ✅ **Trigger Email** - Critical for invoice delivery
2. ✅ **Resize Images** - Improves performance
3. ⚠️ **Delete User Data** - Required for GDPR
4. 📊 **BigQuery Export** - Optional, for advanced analytics
5. 💾 **Backups** - Recommended for production

**Note**: You've already implemented custom email and WhatsApp solutions, so the Trigger Email extension is optional but can serve as a backup delivery method.
