import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface UserDocument {
  tier: 'free' | 'tier1' | 'tier2';
  createdAt: any; // Firestore Timestamp
  email: string | null;
  // Stripe fields
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  subscriptionCurrentPeriodEnd?: any; // Firestore Timestamp
  subscriptionCancelAtPeriodEnd?: boolean;
}

/**
 * Creates a user document in Firestore if it doesn't exist
 * @param userId - Firebase Auth User ID
 * @param email - User email address
 * @returns User document
 */
export async function createUserDocument(
  userId: string,
  email: string
): Promise<UserDocument> {
  if (!db) {
    throw new Error('Firebase Firestore is not configured. Please configure Firebase API keys.');
  }
  
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      // User already exists, return existing document
      return userDoc.data() as UserDocument;
    } else {
      // Create new user document with default tier
      const newUser: UserDocument = {
        tier: 'free',
        createdAt: serverTimestamp(),
        email: email,
      };
      await setDoc(userRef, newUser);
      console.log('✅ User document created in Firestore:', userId);
      return newUser;
    }
  } catch (error: any) {
    console.error('❌ Error creating user document:', error);
    // If it's a permission error, provide helpful message
    if (error.code === 'permission-denied') {
      throw new Error('Zugriff verweigert. Bitte überprüfe die Firestore-Sicherheitsregeln.');
    }
    throw error;
  }
}

/**
 * Gets user document from Firestore
 * @param userId - Firebase Auth User ID
 * @returns User document or null if not found
 */
export async function getUserDocument(
  userId: string
): Promise<UserDocument | null> {
  if (!db) {
    throw new Error('Firebase Firestore is not configured. Please configure Firebase API keys.');
  }
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);

  if (userDoc.exists()) {
    return userDoc.data() as UserDocument;
  }
  return null;
}

