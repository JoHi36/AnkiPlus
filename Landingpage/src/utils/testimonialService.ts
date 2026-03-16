import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  deleteDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TestimonialDocument, TestimonialWithUser } from './testimonialTypes';
import { moderateTestimonial, validateTestimonialText } from '../lib/testimonialModeration';

/**
 * Erstellt oder aktualisiert ein Testimonial
 */
export async function saveTestimonial(
  userId: string,
  text: string,
  tier: 'tier1' | 'tier2'
): Promise<{ success: boolean; testimonialId?: string; error?: string }> {
  if (!db) {
    return { success: false, error: 'Firebase nicht konfiguriert' };
  }

  // Validierung
  const validation = validateTestimonialText(text);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Prüfe ob User bereits ein Testimonial hat
    const existingQuery = query(
      collection(db, 'testimonials'),
      where('userId', '==', userId),
      limit(1)
    );
    const existingDocs = await getDocs(existingQuery);
    
    let testimonialId: string;
    let existingData: TestimonialDocument | null = null;

    if (!existingDocs.empty) {
      // Update existing
      testimonialId = existingDocs.docs[0].id;
      existingData = existingDocs.docs[0].data() as TestimonialDocument;
    } else {
      // Create new
      testimonialId = doc(collection(db, 'testimonials')).id;
    }

    // KI-Moderation
    const moderationResult = await moderateTestimonial(text);
    
    const testimonialData: Partial<TestimonialDocument> = {
      userId,
      text: text.trim(),
      tier,
      status: moderationResult.approved ? 'approved' : 'pending',
      moderationScore: moderationResult.score,
      updatedAt: serverTimestamp() as any,
    };

    if (!existingData) {
      // New testimonial
      testimonialData.createdAt = serverTimestamp() as any;
    }

    await setDoc(doc(db, 'testimonials', testimonialId), testimonialData, { merge: true });

    return { 
      success: true, 
      testimonialId,
      error: moderationResult.approved ? undefined : 'Wird moderiert und erscheint nach Freigabe'
    };
  } catch (error: any) {
    console.error('Error saving testimonial:', error);
    return { 
      success: false, 
      error: error.message || 'Fehler beim Speichern des Testimonials' 
    };
  }
}

/**
 * Holt das Testimonial eines Users
 */
export async function getUserTestimonial(userId: string): Promise<TestimonialDocument | null> {
  if (!db) {
    return null;
  }

  try {
    const q = query(
      collection(db, 'testimonials'),
      where('userId', '==', userId),
      limit(1)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data() as TestimonialDocument;
  } catch (error) {
    console.error('Error fetching user testimonial:', error);
    return null;
  }
}

/**
 * Löscht das Testimonial eines Users
 */
export async function deleteTestimonial(userId: string): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: 'Firebase nicht konfiguriert' };
  }

  try {
    const q = query(
      collection(db, 'testimonials'),
      where('userId', '==', userId),
      limit(1)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return { success: false, error: 'Kein Testimonial gefunden' };
    }

    await deleteDoc(snapshot.docs[0].ref);
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting testimonial:', error);
    return { success: false, error: error.message || 'Fehler beim Löschen' };
  }
}

/**
 * Holt alle freigegebenen Testimonials für die Landing Page
 */
export async function getApprovedTestimonials(limitCount: number = 15): Promise<TestimonialWithUser[]> {
  if (!db) {
    return [];
  }

  try {
    const q = query(
      collection(db, 'testimonials'),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      ...doc.data() as TestimonialDocument,
      // User-Daten werden später aus users Collection geholt falls nötig
    }));
  } catch (error) {
    console.error('Error fetching approved testimonials:', error);
    return [];
  }
}

