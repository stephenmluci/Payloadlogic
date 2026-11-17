import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'truckin-smart.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'truckin-smart',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'truckin-smart.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '447381347977',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:447381347977:web:77e04726e9aa3d89767058',
};

const isBrowser = typeof window !== 'undefined';
const hasValidApiKey = Boolean(firebaseConfig.apiKey && firebaseConfig.apiKey.trim().length > 0);

let app: FirebaseApp = undefined as unknown as FirebaseApp;
let db: Firestore = undefined as unknown as Firestore;
let auth: Auth = undefined as unknown as Auth;
let storage: FirebaseStorage = undefined as unknown as FirebaseStorage;

if (isBrowser && hasValidApiKey) {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

    try {
      // Use modern persistent cache (replaces deprecated enableIndexedDbPersistence).
      // persistentMultipleTabManager allows multiple browser tabs without conflicts.
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      db = getFirestore(app);
    }

    auth = getAuth(app);
    storage = getStorage(app);
  } catch (err) {
    console.warn('Firebase client initialization skipped or failed:', err);
  }
}

/**
 * Returns the Firebase Messaging instance if supported in current browser environment.
 */
export async function getFirebaseMessaging() {
  if (!isBrowser || !app) return null;
  const { isSupported, getMessaging } = await import('firebase/messaging');
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(app);
}

export { app, db, auth, storage };
