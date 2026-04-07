/**
 * Firestore onCreate trigger for KG event processing.
 *
 * Listens on `users/{userId}/kg_events/{eventId}`.
 * For each event, runs idempotent Cypher MERGE queries against Neo4j.
 *
 * On failure, the function throws — Cloud Functions auto-retries
 * onCreate triggers with exponential backoff for up to 7 days.
 */

import * as v1 from 'firebase-functions/v1';
import { getFirestore } from 'firebase-admin/firestore';
import { runCypher, runTransaction } from '../utils/neo4j';
import crypto from 'crypto';

/**
 * Hash a Firebase UID to an opaque string for GDPR compliance.
 * No PII (email, name) ever reaches Neo4j.
 */
function hashUid(uid: string): string {
  return crypto.createHash('sha256').update(uid).digest('hex').slice(0, 32);
}

export const processKgEvent = v1
  .region('europe-west1')
  .firestore.document('users/{userId}/kg_events/{eventId}')
  .onCreate(async (snap, context) => {
    const { userId, eventId } = context.params;
    const data = snap.data();
    const eventType = data.type as string;
    const payload = data.payload as Record<string, unknown>;

    const hashedUid = hashUid(userId);

    v1.logger.info('processKgEvent', { eventType, eventId, userId: hashedUid });

    try {
      switch (eventType) {
        case 'card_embedded':
          await handleCardEmbedded(hashedUid, payload);
          break;

        case 'card_reviewed':
          await handleCardReviewed(hashedUid, payload);
          break;

        default:
          v1.logger.warn('processKgEvent: unknown event type', { eventType, eventId });
      }

      // Mark as processed
      const db = getFirestore();
      await db
        .doc(`users/${userId}/kg_events/${eventId}`)
        .update({ status: 'processed', processedAt: new Date().toISOString() });

    } catch (error) {
      v1.logger.error('processKgEvent: failed', { eventType, eventId, error });
      // Throw to trigger Cloud Functions auto-retry
      throw error;
    }
  });

/**
 * Handle card_embedded event:
 * - MERGE Card node with content_hash (dedup key)
 * - Store embedding vector on Card node
 * - Link user to card via OWNS relationship
 */
async function handleCardEmbedded(
  hashedUid: string,
  payload: Record<string, unknown>
): Promise<void> {
  const contentHash = payload.content_hash as string;
  const text = payload.text as string;
  const embedding = payload.embedding as number[];
  const cardId = payload.card_id as number;

  if (!contentHash || !embedding) {
    v1.logger.warn('handleCardEmbedded: missing required fields');
    return;
  }

  await runTransaction([
    {
      // MERGE Card node (shared, deduped by content_hash)
      query: `
        MERGE (c:Card {content_hash: $hash})
        ON CREATE SET c.text = $text, c.embedding = $embedding
        ON MATCH SET c.embedding = $embedding
      `,
      params: {
        hash: contentHash,
        text: (text || '').slice(0, 2000),
        embedding,
      },
    },
    {
      // Ensure user exists + link to card
      query: `
        MERGE (u:User {uid: $uid})
        WITH u
        MATCH (c:Card {content_hash: $hash})
        MERGE (u)-[r:OWNS]->(c)
        SET r.anki_card_id = $cardId
      `,
      params: {
        uid: hashedUid,
        hash: contentHash,
        cardId,
      },
    },
  ]);
}

/**
 * Handle card_reviewed event:
 * - Update OWNS relationship with review metrics (ease, interval)
 */
async function handleCardReviewed(
  hashedUid: string,
  payload: Record<string, unknown>
): Promise<void> {
  const cardId = payload.card_id as number;
  const ease = payload.ease as number;
  const interval = payload.interval as number;
  const deckId = payload.deck_id as number;

  if (!cardId) {
    v1.logger.warn('handleCardReviewed: missing card_id');
    return;
  }

  // Find the OWNS relationship by anki_card_id and update metrics
  await runCypher(
    `
    MATCH (u:User {uid: $uid})-[r:OWNS]->(c:Card)
    WHERE r.anki_card_id = $cardId
    SET r.ease = $ease,
        r.interval = $interval,
        r.deck_id = $deckId,
        r.last_reviewed = datetime()
    `,
    {
      uid: hashedUid,
      cardId,
      ease: ease || 0,
      interval: interval || 0,
      deckId: deckId || 0,
    }
  );
}
