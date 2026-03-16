import { Timestamp } from 'firebase/firestore';

export interface TestimonialDocument {
  userId: string;
  text: string;
  tier: 'tier1' | 'tier2';
  status: 'pending' | 'approved' | 'rejected';
  moderationScore?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TestimonialWithUser extends TestimonialDocument {
  userEmail?: string;
  userDisplayName?: string;
}

