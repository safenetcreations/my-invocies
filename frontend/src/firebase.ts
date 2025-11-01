// Firebase initialization (modular SDK)
// Reads configuration from Vite environment variables (VITE_*) for security.

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAnalytics, isSupported as analyticsIsSupported, Analytics } from 'firebase/analytics';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

export interface FirebaseClient {
  app: FirebaseApp;
  analytics?: Analytics | null;
  auth?: Auth;
  db?: Firestore;
  storage?: FirebaseStorage;
}

function readConfigFromEnv() {
  // Vite exposes env vars via import.meta.env and requires the VITE_ prefix for client-side usage
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  } as Record<string, string | undefined>;

  // Basic validation
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
    console.warn('Firebase config is missing required environment variables. Firebase will not be initialized.');
    return null;
  }

  return cfg as {
    apiKey: string;
    authDomain?: string;
    projectId: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId: string;
    measurementId?: string;
  };
}

let firebaseClient: FirebaseClient | null = null;

export function initFirebase(): FirebaseClient | null {
  if (firebaseClient) return firebaseClient;

  const cfg = readConfigFromEnv();
  if (!cfg) return null;

  // Initialize app
  const app = initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket,
    messagingSenderId: cfg.messagingSenderId,
    appId: cfg.appId,
    measurementId: cfg.measurementId,
  });

  const client: FirebaseClient = { app };

  // Auth and Firestore are safe to initialize in most environments
  try {
    client.auth = getAuth(app);
  } catch (err) {
    console.warn('Firebase Auth initialization failed:', err);
  }

  try {
    client.db = getFirestore(app);
  } catch (err) {
    console.warn('Firebase Firestore initialization failed:', err);
  }

  try {
    client.storage = getStorage(app);
  } catch (err) {
    console.warn('Firebase Storage initialization failed:', err);
  }

  // Analytics might not be available in server environments or unsupported browsers
  if (cfg.measurementId) {
    analyticsIsSupported()
      .then((supported) => {
        if (supported) {
          try {
            client.analytics = getAnalytics(app);
          } catch (err) {
            console.warn('Firebase Analytics init failed:', err);
            client.analytics = null;
          }
        } else {
          client.analytics = null;
        }
      })
      .catch((err) => {
        console.warn('Analytics support check failed:', err);
        client.analytics = null;
      });
  }

  firebaseClient = client;
  return firebaseClient;
}

// Convenience getter
export function getFirebase(): FirebaseClient | null {
  return firebaseClient ?? initFirebase();
}

// Example usage (do not call at module-top-level if you need strict SSR control):
// const fb = initFirebase();
// fb?.auth; fb?.db; fb?.analytics;
