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
  firebaseConfigured: boolean;
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
  const [firebaseConfigured, setFirebaseConfigured] = useState(!!auth);

  useEffect(() => {
    // Check if Firebase is configured
    const isConfigured = !!auth;
    setFirebaseConfigured(isConfigured);
    
    // If Firebase auth is not available, skip auth initialization
    if (!auth) {
      console.warn('⚠️ Firebase Auth is not configured. Auth features will be disabled.');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      // Save refresh token when user logs in
      if (firebaseUser) {
        try {
          // Firebase User object exposes refreshToken property
          const refreshToken = (firebaseUser as any).stsTokenManager?.refreshToken
            || (firebaseUser as any).refreshToken
            || '';
          if (refreshToken) {
            saveRefreshToken(firebaseUser.uid, refreshToken);
          }
        } catch (error) {
          console.error('Error saving refresh token:', error);
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
      console.error('Login error:', error);
      throw new Error(getAuthErrorMessage(error.code, error));
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
      console.error('Register error:', error);
      throw new Error(getAuthErrorMessage(error.code, error));
    }
  };

  const loginWithGoogle = async (): Promise<void> => {
    if (!auth) {
      throw new Error('Firebase Auth is not configured. Please configure Firebase API keys.');
    }
    const provider = new GoogleAuthProvider();
    try {
      const userCredential = await signInWithPopup(auth, provider);
      if (userCredential.user) {
        await createUserDocument(userCredential.user.uid, userCredential.user.email || '');
      }
    } catch (error: any) {
      console.error('Google login error:', error.code, error.message, error);
      throw new Error(getAuthErrorMessage(error.code, error));
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
      console.error('Reset password error:', error);
      throw new Error(getAuthErrorMessage(error.code, error));
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
    if (!user) return null;
    // Firebase User object has refreshToken property
    const rt = (user as any).stsTokenManager?.refreshToken
      || (user as any).refreshToken
      || null;
    return rt || null;
  };

  const value: AuthContextType = {
    user,
    loading,
    firebaseConfigured,
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
function getAuthErrorMessage(code: string, originalError?: any): string {
  // Log the error for debugging
  console.error('Firebase Auth Error:', code, originalError);
  
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
      return 'Anmeldung abgebrochen. Versuche es erneut.';
    case 'auth/popup-blocked':
      return 'Popup wurde vom Browser blockiert. Bitte erlaube Popups für diese Seite.';
    case 'auth/cancelled-popup-request':
      return 'Popup-Anfrage abgebrochen. Versuche es erneut.';
    case 'auth/unauthorized-domain':
      return 'Diese Domain ist nicht für Google Sign-In autorisiert.';
    case 'auth/operation-not-allowed':
      return 'Diese Anmeldemethode ist nicht aktiviert. Bitte kontaktiere den Support.';
    case 'auth/requires-recent-login':
      return 'Bitte melde dich erneut an, um diese Aktion durchzuführen.';
    case 'permission-denied':
      return 'Zugriff verweigert. Bitte kontaktiere den Support.';
    default:
      // Include more details in development
      if (process.env.NODE_ENV === 'development' && originalError?.message) {
        return `Fehler: ${originalError.message} (Code: ${code})`;
      }
      return `Ein Fehler ist aufgetreten (${code}). Bitte versuche es erneut oder kontaktiere den Support.`;
  }
}

