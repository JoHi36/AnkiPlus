import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { createUserDocument } from '../utils/userSetup';
import { saveRefreshToken, clearRefreshToken } from '../utils/tokenStorage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  getAuthToken: () => Promise<string | null>;
  getRefreshToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If Firebase auth is not available, skip auth initialization
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      // Save refresh token when user logs in
      if (firebaseUser) {
        try {
          // Firebase Auth automatically manages refresh tokens
          // We get the ID token which we'll use for authentication
          const idToken = await firebaseUser.getIdToken();
          // Note: Firebase doesn't expose refresh tokens directly in the client SDK
          // We'll handle this differently - the refresh token is managed by Firebase
          // For the deep link, we'll use the ID token and handle refresh on the backend
        } catch (error) {
          console.error('Error getting ID token:', error);
        }
      } else {
        clearRefreshToken();
      }
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    if (!auth) {
      throw new Error('Firebase Auth is not configured. Please configure Firebase API keys.');
    }
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // User document will be created if it doesn't exist (handled in register)
      // For login, we just need to ensure the user exists
      if (userCredential.user) {
        await createUserDocument(userCredential.user.uid, userCredential.user.email || '');
      }
    } catch (error: any) {
      throw new Error(getAuthErrorMessage(error.code));
    }
  };

  const register = async (email: string, password: string): Promise<void> => {
    if (!auth) {
      throw new Error('Firebase Auth is not configured. Please configure Firebase API keys.');
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Create user document in Firestore
      if (userCredential.user) {
        await createUserDocument(userCredential.user.uid, userCredential.user.email || '');
      }
    } catch (error: any) {
      throw new Error(getAuthErrorMessage(error.code));
    }
  };

  const loginWithGoogle = async (): Promise<void> => {
    if (!auth) {
      throw new Error('Firebase Auth is not configured. Please configure Firebase API keys.');
    }
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      // Create user document if it doesn't exist
      if (userCredential.user) {
        await createUserDocument(userCredential.user.uid, userCredential.user.email || '');
      }
    } catch (error: any) {
      throw new Error(getAuthErrorMessage(error.code));
    }
  };

  const logout = async (): Promise<void> => {
    if (!auth) {
      return; // No-op if Firebase is not configured
    }
    try {
      await signOut(auth);
      clearRefreshToken();
    } catch (error: any) {
      throw new Error('Logout failed: ' + error.message);
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    if (!auth) {
      throw new Error('Firebase Auth is not configured. Please configure Firebase API keys.');
    }
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      throw new Error(getAuthErrorMessage(error.code));
    }
  };

  const getAuthToken = async (): Promise<string | null> => {
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  };

  const getRefreshToken = (): string | null => {
    // Firebase Auth manages refresh tokens internally
    // For the deep link, we'll use a workaround:
    // Store a reference that the backend can use to refresh
    // Actually, Firebase doesn't expose refresh tokens in the client SDK
    // We'll need to handle this on the backend side
    // For now, return null and handle refresh token generation differently
    return null;
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    loginWithGoogle,
    logout,
    resetPassword,
    getAuthToken,
    getRefreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Converts Firebase Auth error codes to user-friendly messages
 */
function getAuthErrorMessage(code: string): string {
  switch (code) {
    case 'auth/user-not-found':
      return 'Kein Account mit dieser E-Mail gefunden.';
    case 'auth/wrong-password':
      return 'Falsches Passwort.';
    case 'auth/email-already-in-use':
      return 'Diese E-Mail ist bereits registriert.';
    case 'auth/weak-password':
      return 'Passwort ist zu schwach. Bitte verwende mindestens 6 Zeichen.';
    case 'auth/invalid-email':
      return 'Ungültige E-Mail-Adresse.';
    case 'auth/too-many-requests':
      return 'Zu viele Anfragen. Bitte versuche es später erneut.';
    case 'auth/network-request-failed':
      return 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung.';
    case 'auth/popup-closed-by-user':
      return 'Anmeldung abgebrochen.';
    default:
      return 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
  }
}

