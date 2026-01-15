import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'ankiplus-b0ffb.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ankiplus-b0ffb',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ankiplus-b0ffb.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if Firebase is configured
const isFirebaseConfigured = !!firebaseConfig.apiKey && 
                             firebaseConfig.apiKey !== 'undefined' &&
                             firebaseConfig.apiKey.trim() !== '';

// Initialize Firebase only if configured
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log('✅ Firebase initialized successfully');
  } catch (error: any) {
    console.error('❌ Firebase initialization error:', error);
    if (error.code === 'auth/invalid-api-key' || error.message?.includes('API key')) {
      console.error(
        'Invalid Firebase API Key. Please check your .env file and ensure VITE_FIREBASE_API_KEY is correct.\n' +
        'Get your Firebase config from: Firebase Console > Project Settings > General > Your apps > Web app'
      );
    }
    // Don't throw - allow app to run in fallback mode
    app = null;
    auth = null;
    db = null;
  }
} else {
  console.warn('⚠️ Firebase not configured - running in fallback mode. Landing page will work, but auth features are disabled.');
  console.warn('📖 To enable Firebase Auth:');
  console.warn('   1. Create a .env file in the Landingpage directory');
  console.warn('   2. Add VITE_FIREBASE_API_KEY and other Firebase config values');
  console.warn('   3. See Landingpage/SETUP.md for detailed instructions');
}

// Export Firebase services (may be null if not configured)
export { auth, db };
export default app;
