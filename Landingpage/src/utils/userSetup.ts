import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface UserDocument {
  tier: 'free' | 'tier1' | 'tier2';
  createdAt: any; // Firestore Timestamp
  email: string | null;
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
    return newUser;
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

