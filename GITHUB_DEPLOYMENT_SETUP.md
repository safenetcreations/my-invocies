# GitHub Auto-Deployment Setup Guide

This guide will help you set up automatic deployment to Firebase using GitHub Actions.

## 🎯 Overview

Every time you push code to the `main` or `master` branch, GitHub Actions will automatically:
1. Build the frontend (React app)
2. Build the backend (Firebase Functions)
3. Deploy everything to Firebase (Hosting, Functions, Firestore)

## 📋 Prerequisites

- GitHub repository: https://github.com/safenetcreations/my-invocies.git
- Firebase project: my-invocies
- Firebase service account JSON key

## 🔧 Setup Steps

### Step 1: Get Firebase Service Account Key

If you don't have a service account key yet:

1. Go to [Firebase Console](https://console.firebase.google.com/project/my-invocies/settings/serviceaccounts/adminsdk)
2. Click on **Service accounts** tab
3. Click **Generate new private key**
4. Save the JSON file securely
5. **NEVER commit this file to your repository!**

### Step 2: Set Up GitHub Secrets

1. Go to your GitHub repository: https://github.com/safenetcreations/my-invocies
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

#### Required Secrets:

**1. FIREBASE_SERVICE_ACCOUNT**
- Name: `FIREBASE_SERVICE_ACCOUNT`
- Value: The entire contents of your service account JSON file
- How to get: Copy and paste the entire JSON file content

**2. FIREBASE_TOKEN** (Alternative to service account)
- Name: `FIREBASE_TOKEN`
- Value: Your Firebase CI token
- How to get: Run `firebase login:ci` in your terminal

**3. Frontend Environment Variables:**

Add these secrets for your frontend build:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

Get these values from your Firebase project settings or from `frontend/.env.local`:

```bash
# Example values
VITE_FIREBASE_API_KEY=AIzaSyCfEfFgpq9VdmsezG6ccSszzRvKJu4ZHvQ
VITE_FIREBASE_AUTH_DOMAIN=my-invocies.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=my-invocies
VITE_FIREBASE_STORAGE_BUCKET=my-invocies.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=763860963535
VITE_FIREBASE_APP_ID=1:763860963535:web:9f19e64fb03cb1ce19e7ba
VITE_FIREBASE_MEASUREMENT_ID=G-2E484ZYEFB
```

### Step 3: Push Code to GitHub

```bash
# Initialize git if not already done
git init

# Add remote repository
git remote add origin https://github.com/safenetcreations/my-invocies.git

# Add all files
git add .

# Commit changes
git commit -m "Initial commit with auto-deployment"

# Push to main branch
git push -u origin main
```

### Step 4: Verify Deployment

1. Go to your GitHub repository
2. Click on **Actions** tab
3. You should see the workflow running
4. Wait for it to complete (usually 3-5 minutes)
5. Check the deployment at: https://my-invocies.web.app

## 🔄 How Auto-Deployment Works

### Trigger Events:
- **Automatic**: Pushes to `main` or `master` branch
- **Manual**: Click "Run workflow" in GitHub Actions tab

### Deployment Process:

1. **Checkout Code** - Gets latest code from repository
2. **Setup Node.js** - Installs Node.js v20
3. **Install Dependencies** - Installs npm packages for frontend, backend, and functions
4. **Build Frontend** - Compiles React app with Vite
5. **Build Functions** - Compiles TypeScript to JavaScript
6. **Deploy to Firebase** - Deploys hosting, functions, and Firestore rules

### What Gets Deployed:

✅ **Frontend (Hosting)**
- URL: https://my-invocies.web.app
- Built from: `frontend/build/`

✅ **Backend (Functions)**
- API URL: https://us-central1-my-invocies.cloudfunctions.net/api
- Built from: `functions/lib/`

✅ **Firestore Rules & Indexes**
- Security rules from: `firestore.rules`
- Indexes from: `firestore.indexes.json`

## 🚨 Important Security Notes

### DO NOT Commit These Files:
- ❌ Service account JSON files
- ❌ `.env` or `.env.local` files
- ❌ `firebase-adminsdk-*.json`
- ❌ Any files containing secrets or API keys

These are already added to `.gitignore`

### Safe to Commit:
- ✅ Source code
- ✅ `package.json` and `package-lock.json`
- ✅ Configuration files (without secrets)
- ✅ `.github/workflows/` files

## 🐛 Troubleshooting

### Deployment Fails?

**Check these common issues:**

1. **Missing Secrets**
   - Verify all required secrets are added in GitHub
   - Check secret names match exactly (case-sensitive)

2. **Build Errors**
   - Check the Actions log for specific errors
   - Test builds locally first: `npm run build`

3. **Firebase Permissions**
   - Ensure service account has necessary permissions
   - Roles needed: Firebase Admin, Cloud Functions Admin

4. **Node Version**
   - Workflow uses Node 20
   - Ensure your code is compatible

### View Deployment Logs

1. Go to GitHub repository
2. Click **Actions** tab
3. Click on the failed workflow
4. Expand the failed step to see detailed logs

## 📊 Monitoring Deployments

### Check Deployment Status:
- GitHub Actions: https://github.com/safenetcreations/my-invocies/actions
- Firebase Console: https://console.firebase.google.com/project/my-invocies

### Test Endpoints After Deployment:
```bash
# Test frontend
curl https://my-invocies.web.app

# Test API health check
curl https://us-central1-my-invocies.cloudfunctions.net/api/health

# Test businesses endpoint
curl https://us-central1-my-invocies.cloudfunctions.net/api/businesses
```

## 🔄 Manual Deployment (Alternative)

If you prefer to deploy manually:

```bash
# Build and deploy everything
npm run deploy

# Or deploy specific services
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore
```

## 📝 Workflow Configuration

The workflow file is located at:
`.github/workflows/firebase-deploy.yml`

You can modify it to:
- Change trigger branches
- Add/remove deployment steps
- Customize build commands
- Add testing steps

## ✅ Success Indicators

After successful deployment, you should see:
- ✅ Green checkmark in GitHub Actions
- ✅ Frontend accessible at https://my-invocies.web.app
- ✅ API responding at https://us-central1-my-invocies.cloudfunctions.net/api/health
- ✅ Firestore rules updated in Firebase Console

## 🎉 Next Steps

1. Set up all GitHub secrets
2. Push your first commit
3. Watch the automatic deployment
4. Celebrate! 🎊

---

**Need Help?**
- Check GitHub Actions logs for errors
- Review Firebase Console for deployment status
- Ensure all secrets are properly configured
