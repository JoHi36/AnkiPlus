/**
 * KG Events Ingestion Handler.
 *
 * Receives batched KG events from the Anki client and writes them
 * to Firestore. The Firestore onCreate trigger (kgProcessor.ts) then
 * processes each event and writes to Neo4j.
 */

import { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import * as v1 from 'firebase-functions/v1';

interface KgEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export async function kgEventsHandler(req: Request, res: Response): Promise<void> {
  const uid = (req as any).userId;
  if (!uid) {
    res.status(401).json({ error: 'Unauthorized — no userId on request' });
    return;
  }

  const { events } = req.body as { events?: KgEvent[] };

  if (!events || !Array.isArray(events) || events.length === 0) {
    res.status(400).json({ error: 'Missing or empty events array' });
    return;
  }

  if (events.length > 100) {
    res.status(400).json({ error: 'Max 100 events per batch' });
    return;
  }

  const db = getFirestore();
  const batch = db.batch();
  let accepted = 0;

  for (const event of events) {
    if (!event.id || !event.type || !event.payload) {
      v1.logger.warn('kgEvents: skipping malformed event', { event });
      continue;
    }

    const docRef = db.collection(`users/${uid}/kg_events`).doc(event.id);
    batch.set(docRef, {
      type: event.type,
      payload: event.payload,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    accepted++;
  }

  try {
    await batch.commit();
    v1.logger.info('kgEvents: accepted batch', { uid, accepted });
    res.json({ accepted });
  } catch (error) {
    v1.logger.error('kgEvents: batch write failed', { error, uid });
    res.status(500).json({ error: 'Failed to write events' });
  }
}
