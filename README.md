# Multi-Business Invoice Builder for Sri Lanka

A comprehensive invoice management platform with email/WhatsApp tracking, payment integration, and Sri Lankan tax compliance.

## Features

- **Multi-tenant architecture** - Support multiple businesses under one platform
- **Sri Lankan tax compliance** - Enforces government tax invoice format requirements
- **Email tracking** - Open/click tracking with Gmail OAuth integration
- **WhatsApp delivery** - Send invoices via WhatsApp with delivery/read receipts
- **Payment tracking** - Manual and automated payment recording with gateway integration
- **PDF generation** - Professional invoice PDFs with company branding

## Quick Start

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Configure your database and API keys in .env
npm run db:migrate
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

### Database Setup
```bash
# Start PostgreSQL (via Docker)
docker run --name invoice-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=invoices -p 5432:5432 -d postgres:15

# Run migrations
cd backend && npm run db:migrate
```

## Tech Stack

- **Backend**: Node.js, TypeScript, Express, Firebase Functions
- **Database**: Firestore (NoSQL)
- **Frontend**: React, TypeScript, Vite, Material-UI
- **Hosting**: Firebase Hosting
- **PDF Generation**: Puppeteer
- **Email**: Gmail API, SendGrid
- **WhatsApp**: WhatsApp Cloud API
- **Payments**: Stripe, local Sri Lankan gateways
- **CI/CD**: GitHub Actions (Auto-deploy to Firebase)

## Project Structure

```
├── backend/          # Node.js API server
├── frontend/         # React web application
├── shared/           # Shared TypeScript types
└── docs/            # Documentation
```

## Development

### Environment Variables
Copy `.env.example` to `.env` and configure:
- Firebase credentials
- Gmail/WhatsApp API credentials
- Payment gateway keys
- Encryption secrets

### Testing
```bash
cd backend && npm test
cd frontend && npm test
```

## 🚀 Deployment

### Live URLs
- **Frontend**: https://my-invocies.web.app
- **API**: https://us-central1-my-invocies.cloudfunctions.net/api
- **Firestore Console**: https://console.firebase.google.com/project/my-invocies/firestore

### Auto-Deployment with GitHub Actions

Every push to `main` branch automatically deploys to Firebase!

**Quick Setup:**
1. Add secrets to GitHub repository
2. Push code to `main` branch
3. GitHub Actions handles the rest

📖 **Full guide**: See `QUICK_DEPLOY_GUIDE.md` or `GITHUB_DEPLOYMENT_SETUP.md`

### Manual Deployment

```bash
# Build frontend
cd frontend && npm run build

# Build backend functions
cd backend && npm run build:functions

# Deploy to Firebase
firebase deploy
```

## 📂 Firebase Structure

### Firestore Collections
- `users` - User accounts
- `businesses` - Business profiles with members subcollection
- `products` - Product catalog
- `contacts` - Customer contacts
- `invoices` - Invoices with lineItems and payments subcollections
- `trackingEvents` - Email/WhatsApp tracking data
- `integrationCredentials` - API keys and tokens (encrypted)

### Firebase Functions
- `api` - Main REST API (Express)
- `onInvoiceCreated` - Auto-track invoice creation
- `onInvoiceUpdated` - Track status changes
- `sendInvoiceReminders` - Daily scheduler for overdue invoices

### Security
- ✅ Firestore security rules configured
- ✅ Role-based access control (OWNER, ADMIN, USER)
- ✅ Service account authentication
- ✅ HTTPS only endpoints

## 🔒 Security Notes

**NEVER commit these files:**
- Service account JSON files
- `.env` or `.env.local` files
- API keys or secrets

All sensitive files are in `.gitignore`

## License

MIT