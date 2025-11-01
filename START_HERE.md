# 🚀 START HERE - Auto-Deploy Setup

## Quick 3-Step Setup

### ✅ Step 1: Add Secrets to GitHub (5 min)

1. Go to: https://github.com/safenetcreations/my-invocies/settings/secrets/actions

2. Click "New repository secret" and add:

**FIREBASE_SERVICE_ACCOUNT**
- Paste your entire service account JSON file

**FIREBASE_TOKEN**
- Run: `firebase login:ci` in terminal
- Copy the token

**Frontend Variables** (add each separately):
```
VITE_FIREBASE_API_KEY=AIzaSyCfEfFgpq9VdmsezG6ccSszzRvKJu4ZHvQ
VITE_FIREBASE_AUTH_DOMAIN=my-invocies.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=my-invocies
VITE_FIREBASE_STORAGE_BUCKET=my-invocies.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=763860963535
VITE_FIREBASE_APP_ID=1:763860963535:web:9f19e64fb03cb1ce19e7ba
VITE_FIREBASE_MEASUREMENT_ID=G-2E484ZYEFB
```

### ✅ Step 2: Push to GitHub (2 min)

```bash
git init
git remote add origin https://github.com/safenetcreations/my-invocies.git
git add .
git commit -m "🚀 Setup auto-deployment"
git push -u origin main
```

### ✅ Step 3: Watch & Test (3 min)

1. Watch: https://github.com/safenetcreations/my-invocies/actions
2. Test: https://my-invocies.web.app

## 🎉 Done!

Every push to `main` now auto-deploys to Firebase!

---

**Need more details?** Check these files:
- `QUICK_DEPLOY_GUIDE.md` - Quick reference
- `GITHUB_DEPLOYMENT_SETUP.md` - Full documentation
- `AUTO_DEPLOYMENT_SUMMARY.md` - What was set up
