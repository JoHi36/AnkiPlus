import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';

// Lazy initialization - get Firestore when needed
function getDb() {
  return getFirestore();
}

export interface UserDocument {
  tier: 'free' | 'tier1' | 'tier2';
  createdAt: Timestamp;
  email?: string;
  // Stripe fields
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  subscriptionCurrentPeriodEnd?: Timestamp;
  subscriptionCancelAtPeriodEnd?: boolean;
}

export interface DailyUsageDocument {
  flashRequests: number;
  deepRequests: number;
  lastReset: Timestamp;
}

export interface AnonymousUserDocument {
  deviceId: string;
  ipAddress: string;
  flashRequests: number;
  deepRequests: number;
  lastReset: Timestamp;
  createdAt: Timestamp;
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
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
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

  // Use FieldValue.increment for atomic operation
  await usageRef.update({
    flashRequests: FieldValue.increment(1),
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
  const db = getDb();
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

  // Use FieldValue.increment for atomic operation
  await usageRef.update({
    deepRequests: FieldValue.increment(1),
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
  const db = getDb();
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

/**
 * Get or create anonymous user document in Firestore
 * @param deviceId - Device ID from client
 * @param ipAddress - IP address of the client
 * @returns Anonymous user document
 */
export async function getOrCreateAnonymousUser(
  deviceId: string,
  ipAddress: string
): Promise<AnonymousUserDocument> {
  const db = getDb();
  const currentDate = getCurrentDateString();
  const anonymousRef = db
    .collection('anonymous_users')
    .doc(deviceId)
    .collection('daily')
    .doc(currentDate);

  const anonymousDoc = await anonymousRef.get();

  if (!anonymousDoc.exists) {
    // Create new anonymous user document for today
    const newAnonymous: AnonymousUserDocument = {
      deviceId,
      ipAddress,
      flashRequests: 0,
      deepRequests: 0,
      lastReset: Timestamp.now(),
      createdAt: Timestamp.now(),
    };
    await anonymousRef.set(newAnonymous);
    return newAnonymous;
  }

  return anonymousDoc.data() as AnonymousUserDocument;
}

/**
 * Get anonymous daily usage document
 * @param deviceId - Device ID from client
 * @param date - Date string in format YYYY-MM-DD
 * @returns Anonymous daily usage document or null if not found
 */
export async function getAnonymousDailyUsage(
  deviceId: string,
  date: string
): Promise<AnonymousUserDocument | null> {
  const db = getDb();
  const anonymousRef = db
    .collection('anonymous_users')
    .doc(deviceId)
    .collection('daily')
    .doc(date);

  const anonymousDoc = await anonymousRef.get();

  if (!anonymousDoc.exists) {
    return null;
  }

  return anonymousDoc.data() as AnonymousUserDocument;
}

/**
 * Increment flash requests for anonymous user
 * @param deviceId - Device ID from client
 * @param date - Date string in format YYYY-MM-DD
 * @returns New flash requests count
 */
export async function incrementAnonymousFlashRequests(
  deviceId: string,
  date: string
): Promise<number> {
  const db = getDb();
  const anonymousRef = db
    .collection('anonymous_users')
    .doc(deviceId)
    .collection('daily')
    .doc(date);

  const anonymousDoc = await anonymousRef.get();

  if (!anonymousDoc.exists) {
    // Create new document if it doesn't exist
    await anonymousRef.set({
      flashRequests: 1,
      deepRequests: 0,
      lastReset: Timestamp.now(),
      createdAt: Timestamp.now(),
    });
    return 1;
  }

  // Use FieldValue.increment for atomic operation
  await anonymousRef.update({
    flashRequests: FieldValue.increment(1),
  });

  const updatedDoc = await anonymousRef.get();
  return (updatedDoc.data()?.flashRequests || 0) as number;
}

/**
 * Increment deep requests for anonymous user
 * @param deviceId - Device ID from client
 * @param date - Date string in format YYYY-MM-DD
 * @returns New deep requests count
 */
export async function incrementAnonymousDeepRequests(
  deviceId: string,
  date: string
): Promise<number> {
  const db = getDb();
  const anonymousRef = db
    .collection('anonymous_users')
    .doc(deviceId)
    .collection('daily')
    .doc(date);

  const anonymousDoc = await anonymousRef.get();

  if (!anonymousDoc.exists) {
    // Create new document if it doesn't exist
    await anonymousRef.set({
      flashRequests: 0,
      deepRequests: 1,
      lastReset: Timestamp.now(),
      createdAt: Timestamp.now(),
    });
    return 1;
  }

  // Use FieldValue.increment for atomic operation
  await anonymousRef.update({
    deepRequests: FieldValue.increment(1),
  });

  const updatedDoc = await anonymousRef.get();
  return (updatedDoc.data()?.deepRequests || 0) as number;
}

/**
 * Reset anonymous daily usage for a device
 * @param deviceId - Device ID from client
 * @param date - Date string in format YYYY-MM-DD
 */
export async function resetAnonymousDailyUsage(
  deviceId: string,
  date: string
): Promise<void> {
  const db = getDb();
  const anonymousRef = db
    .collection('anonymous_users')
    .doc(deviceId)
    .collection('daily')
    .doc(date);

  await anonymousRef.set({
    flashRequests: 0,
    deepRequests: 0,
    lastReset: Timestamp.now(),
    createdAt: Timestamp.now(),
  });
}

/**
 * Migrate anonymous user usage to authenticated user
 * @param deviceId - Device ID from client
 * @param userId - Firebase Auth User ID
 * @returns Migration result with migrated usage
 */
export async function migrateAnonymousUsage(
  deviceId: string,
  userId: string
): Promise<{ flashRequests: number; deepRequests: number }> {
  const db = getDb();
  const currentDate = getCurrentDateString();
  
  // Get anonymous usage for today
  const anonymousUsage = await getAnonymousDailyUsage(deviceId, currentDate);
  
  if (!anonymousUsage) {
    // No anonymous usage to migrate
    return { flashRequests: 0, deepRequests: 0 };
  }

  // Get or create user daily usage
  const userUsage = await getOrCreateDailyUsage(userId, currentDate);
  
  // Add anonymous usage to user usage
  const migratedFlash = anonymousUsage.flashRequests;
  const migratedDeep = anonymousUsage.deepRequests;
  
  const db_instance = getDb();
  const userUsageRef = db_instance
    .collection('usage')
    .doc(userId)
    .collection('daily')
    .doc(currentDate);
  
  await userUsageRef.update({
    flashRequests: FieldValue.increment(migratedFlash),
    deepRequests: FieldValue.increment(migratedDeep),
  });

  // Delete anonymous user data after migration
  const anonymousRef = db
    .collection('anonymous_users')
    .doc(deviceId)
    .collection('daily')
    .doc(currentDate);
  
  await anonymousRef.delete();

  return {
    flashRequests: migratedFlash,
    deepRequests: migratedDeep,
  };
}


