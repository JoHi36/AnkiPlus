import { getFirestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

export interface UserDocument {
  tier: 'free' | 'tier1' | 'tier2';
  createdAt: Timestamp;
  email?: string;
}

export interface DailyUsageDocument {
  flashRequests: number;
  deepRequests: number;
  lastReset: Timestamp;
}

/**
 * Get or create user document in Firestore
 * @param userId - Firebase Auth User ID
 * @param email - Optional email address
 * @returns User document
 */
export async function getOrCreateUser(
  userId: string,
  email?: string
): Promise<UserDocument> {
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    // Create new user with default tier
    const newUser: UserDocument = {
      tier: 'free',
      createdAt: Timestamp.now(),
      email,
    };
    await userRef.set(newUser);
    return newUser;
  }

  return userDoc.data() as UserDocument;
}

/**
 * Get user document from Firestore
 * @param userId - Firebase Auth User ID
 * @returns User document or null if not found
 */
export async function getUser(userId: string): Promise<UserDocument | null> {
  const userRef = db.collection('users').doc(userId);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    return null;
  }

  return userDoc.data() as UserDocument;
}

/**
 * Get or create daily usage document for a user
 * @param userId - Firebase Auth User ID
 * @param date - Date string in format YYYY-MM-DD
 * @returns Daily usage document
 */
export async function getOrCreateDailyUsage(
  userId: string,
  date: string
): Promise<DailyUsageDocument> {
  const usageRef = db
    .collection('usage')
    .doc(userId)
    .collection('daily')
    .doc(date);

  const usageDoc = await usageRef.get();

  if (!usageDoc.exists) {
    // Create new daily usage document
    const newUsage: DailyUsageDocument = {
      flashRequests: 0,
      deepRequests: 0,
      lastReset: Timestamp.now(),
    };
    await usageRef.set(newUsage);
    return newUsage;
  }

  return usageDoc.data() as DailyUsageDocument;
}

/**
 * Get daily usage document for a user
 * @param userId - Firebase Auth User ID
 * @param date - Date string in format YYYY-MM-DD
 * @returns Daily usage document or null if not found
 */
export async function getDailyUsage(
  userId: string,
  date: string
): Promise<DailyUsageDocument | null> {
  const usageRef = db
    .collection('usage')
    .doc(userId)
    .collection('daily')
    .doc(date);

  const usageDoc = await usageRef.get();

  if (!usageDoc.exists) {
    return null;
  }

  return usageDoc.data() as DailyUsageDocument;
}

/**
 * Increment flash requests counter for a user
 * @param userId - Firebase Auth User ID
 * @param date - Date string in format YYYY-MM-DD
 * @returns New flash requests count
 */
export async function incrementFlashRequests(
  userId: string,
  date: string
): Promise<number> {
  const usageRef = db
    .collection('usage')
    .doc(userId)
    .collection('daily')
    .doc(date);

  const usageDoc = await usageRef.get();

  if (!usageDoc.exists) {
    // Create new document if it doesn't exist
    await usageRef.set({
      flashRequests: 1,
      deepRequests: 0,
      lastReset: Timestamp.now(),
    });
    return 1;
  }

  // Use Firestore increment for atomic operation
  await usageRef.update({
    flashRequests: (usageDoc.data()?.flashRequests || 0) + 1,
  });

  const updatedDoc = await usageRef.get();
  return (updatedDoc.data()?.flashRequests || 0) as number;
}

/**
 * Increment deep requests counter for a user
 * @param userId - Firebase Auth User ID
 * @param date - Date string in format YYYY-MM-DD
 * @returns New deep requests count
 */
export async function incrementDeepRequests(
  userId: string,
  date: string
): Promise<number> {
  const usageRef = db
    .collection('usage')
    .doc(userId)
    .collection('daily')
    .doc(date);

  const usageDoc = await usageRef.get();

  if (!usageDoc.exists) {
    // Create new document if it doesn't exist
    await usageRef.set({
      flashRequests: 0,
      deepRequests: 1,
      lastReset: Timestamp.now(),
    });
    return 1;
  }

  // Use Firestore increment for atomic operation
  await usageRef.update({
    deepRequests: (usageDoc.data()?.deepRequests || 0) + 1,
  });

  const updatedDoc = await usageRef.get();
  return (updatedDoc.data()?.deepRequests || 0) as number;
}

/**
 * Reset daily usage for a user (called automatically at midnight UTC)
 * @param userId - Firebase Auth User ID
 * @param date - Date string in format YYYY-MM-DD
 */
export async function resetDailyUsage(
  userId: string,
  date: string
): Promise<void> {
  const usageRef = db
    .collection('usage')
    .doc(userId)
    .collection('daily')
    .doc(date);

  await usageRef.set({
    flashRequests: 0,
    deepRequests: 0,
    lastReset: Timestamp.now(),
  });
}

/**
 * Get current date string in format YYYY-MM-DD (UTC)
 * @returns Date string
 */
export function getCurrentDateString(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get reset time for next day (midnight UTC)
 * @returns ISO timestamp string
 */
export function getResetTime(): string {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}

