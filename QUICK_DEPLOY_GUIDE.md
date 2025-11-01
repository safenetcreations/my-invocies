# 🚀 Quick Deploy Guide - Auto Push to Firebase

## Step 1: Add GitHub Secrets (5 minutes)

Go to: https://github.com/safenetcreations/my-invocies/settings/secrets/actions

### Add These Secrets:

1. **FIREBASE_SERVICE_ACCOUNT**
   - Paste your entire service account JSON file content

2. **FIREBASE_TOKEN**
   - Run: `firebase login:ci`
   - Copy the token it gives you

3. **Frontend Environment Variables:**
   ```
   VITE_FIREBASE_API_KEY=AIzaSyCfEfFgpq9VdmsezG6ccSszzRvKJu4ZHvQ
   VITE_FIREBASE_AUTH_DOMAIN=my-invocies.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=my-invocies
   VITE_FIREBASE_STORAGE_BUCKET=my-invocies.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=763860963535
   VITE_FIREBASE_APP_ID=1:763860963535:web:9f19e64fb03cb1ce19e7ba
   VITE_FIREBASE_MEASUREMENT_ID=G-2E484ZYEFB
   ```

## Step 2: Push to GitHub (2 minutes)

```bash
# Initialize git repository
git init

# Add remote
git remote add origin https://github.com/safenetcreations/my-invocies.git

# Stage all files
git add .

# Create first commit
git commit -m "🚀 Initial commit with auto-deployment"

# Push to GitHub
git push -u origin main
```

If you get an error about divergent branches:
```bash
git pull origin main --rebase
git push -u origin main
```

## Step 3: Watch Deployment (3-5 minutes)

1. Go to: https://github.com/safenetcreations/my-invocies/actions
2. Watch the deployment progress
3. Wait for green checkmark ✅

## Step 4: Test Your Deployment

**Frontend:** https://my-invocies.web.app

**API Health:** https://us-central1-my-invocies.cloudfunctions.net/api/health

**API Businesses:** https://us-central1-my-invocies.cloudfunctions.net/api/businesses

## 🎉 Done!

From now on, every push to `main` branch will auto-deploy to Firebase!

---

## Common Issues

### "Permission denied"?
```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to GitHub
cat ~/.ssh/id_ed25519.pub
# Copy and add to: https://github.com/settings/keys
```

### "Authentication failed"?
```bash
# Use HTTPS instead
git remote set-url origin https://github.com/safenetcreations/my-invocies.git
```

### Deployment failed?
- Check GitHub Actions logs
- Verify all secrets are added
- Ensure service account has correct permissions

---

For detailed documentation, see: `GITHUB_DEPLOYMENT_SETUP.md`
