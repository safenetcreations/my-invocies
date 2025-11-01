# Firebase Deployment Guide

Your multi-business invoice builder is now ready for Firebase deployment! 🚀

## 📋 Prerequisites
- ✅ Firebase CLI installed (`firebase-tools@14.23.0`)
- ✅ Firebase project created (`my-invocies`)
- ✅ All configuration files ready
- ✅ Dependencies installed

## 🚀 Deployment Steps

### 1. Login to Firebase
```bash
firebase login
```
This will open your browser to authenticate with your Google account.

### 2. Set Environment Variables

Create `frontend/.env.local` with your Firebase config:
```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=my-invocies.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=my-invocies
VITE_FIREBASE_STORAGE_BUCKET=my-invocies.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### 3. Build the Frontend
```bash
cd frontend
npm run build
```

### 4. Deploy to Firebase
```bash
# From project root
firebase deploy
```

This will deploy:
- **Frontend**: React app to Firebase Hosting
- **Backend**: Node.js API as Firebase Functions
- **Functions**: Auto PDF generation & reminder scheduler

## 📁 Project Structure

```
├── frontend/
│   ├── dist/                     # Built React app (deployed to Hosting)
│   ├── src/firebase.ts          # Firebase SDK initialization
│   └── .env.local               # Firebase config (create this)
├── backend/
│   └── src/functions.ts         # Firebase Functions entry point
├── functions/
│   ├── lib/                     # Compiled functions
│   ├── package.json            # Functions dependencies
│   └── tsconfig.json           # Functions TypeScript config
├── firebase.json               # Firebase project configuration
└── .firebaserc                 # Firebase project association
```

## 🔧 Available Scripts

### Backend Functions
```bash
cd backend
npm run build:functions    # Build functions for deployment
npm run serve             # Start local Firebase emulator
npm run deploy            # Deploy functions only
```

### Functions Directory
```bash
cd functions
npm run build            # Compile TypeScript
npm run serve            # Start local emulator
npm run deploy           # Deploy functions only
```

## 🌐 Access Your App

After deployment:
- **Frontend**: `https://my-invocies.web.app`
- **API Health Check**: `https://us-central1-my-invocies.cloudfunctions.net/api/health`
- **Firebase Console**: `https://console.firebase.google.com/project/my-invocies`

## 🔍 Testing Endpoints

Once deployed, test these endpoints:
- `GET /api/health` - Health check
- `GET /api/businesses` - List businesses
- `GET /api/invoices` - List invoices

## 🚨 Important Notes

1. **Firebase Project**: Update `.firebaserc` if your project ID differs from `my-invocies`
2. **Environment Variables**: Add your actual Firebase config values to `frontend/.env.local`
3. **Functions Runtime**: Set to Node.js 18 (configured in `functions/package.json`)
4. **CORS**: Configured to allow all origins for Functions

## 🛠 Troubleshooting

### Build Errors
- Ensure all dependencies are installed: `npm install`
- Check TypeScript compilation: `npm run build`

### Deployment Errors
- Verify Firebase login: `firebase projects:list`
- Check project association: `firebase use my-invocies`

### Function Errors
- View logs: `firebase functions:log`
- Test locally: `npm run serve`

## 🎯 Next Steps

1. Set up database (PostgreSQL/Firestore)
2. Configure authentication
3. Add payment processing
4. Set up email/WhatsApp notifications
5. Implement full business logic

Your invoice builder is ready to scale! 🎉