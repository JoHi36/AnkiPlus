/**
 * KG Query Handler — read-only Cypher queries against Neo4j.
 *
 * Receives { query_type, params } and dispatches to the appropriate
 * Cypher query. All queries are read-only.
 */

import { Request, Response } from 'express';
import { runCypher } from '../utils/neo4j';
import * as v1 from 'firebase-functions/v1';
import crypto from 'crypto';

function hashUid(uid: string): string {
  return crypto.createHash('sha256').update(uid).digest('hex').slice(0, 32);
}

type QueryType =
  | 'vector_search_cards'
  | 'vector_search_terms'
  | 'get_related_cards'
  | 'get_card_terms'
  | 'get_term_expansions'
  | 'get_weak_terms'
  | 'get_kg_metrics'
  | 'exact_term_lookup'
  | 'get_all_term_embeddings';

export async function kgQueryHandler(req: Request, res: Response): Promise<void> {
  const uid = (req as any).userId;
  if (!uid) {
    res.status(401).json({ error: 'Unauthorized — no userId on request' });
    return;
  }

  const { query_type, params } = req.body as {
    query_type?: QueryType;
    params?: Record<string, unknown>;
  };

  if (!query_type) {
    res.status(400).json({ error: 'Missing query_type' });
    return;
  }

  const hashedUid = hashUid(uid);

  try {
    let result: unknown;

    switch (query_type) {
      case 'vector_search_cards':
        result = await vectorSearchCards(params || {});
        break;
      case 'vector_search_terms':
        result = await vectorSearchTerms(params || {});
        break;
      case 'get_related_cards':
        result = await getRelatedCards(params || {});
        break;
      case 'get_card_terms':
        result = await getCardTerms(params || {});
        break;
      case 'get_term_expansions':
        result = await getTermExpansions(params || {});
        break;
      case 'get_weak_terms':
        result = await getWeakTerms(hashedUid, params || {});
        break;
      case 'get_kg_metrics':
        result = await getKgMetrics(hashedUid);
        break;
      case 'exact_term_lookup':
        result = await exactTermLookup(params || {});
        break;
      case 'get_all_term_embeddings':
        result = await getAllTermEmbeddings();
        break;
      default:
        res.status(400).json({ error: `Unknown query_type: ${query_type}` });
        return;
    }

    res.json({ result });
  } catch (error) {
    v1.logger.error('kgQuery: failed', { query_type, error });
    res.status(500).json({ error: 'Query failed' });
  }
}

async function vectorSearchCards(
  params: Record<string, unknown>
): Promise<Array<{ content_hash: string; text: string; score: number }>> {
  const embedding = params.embedding as number[];
  const topK = (params.top_k as number) || 10;

  if (!embedding || !Array.isArray(embedding)) return [];

  const result = await runCypher(
    `
    CALL db.index.vector.queryNodes('card_embedding', $k, $embedding)
    YIELD node, score
    RETURN node.content_hash AS content_hash,
           node.text AS text,
           score
    ORDER BY score DESC
    `,
    { k: topK, embedding }
  );

  return result.records.map((r) => ({
    content_hash: r.get('content_hash'),
    text: r.get('text'),
    score: r.get('score'),
  }));
}

async function vectorSearchTerms(
  params: Record<string, unknown>
): Promise<Array<{ term: string; score: number }>> {
  const embedding = params.embedding as number[];
  const topK = (params.top_k as number) || 10;

  if (!embedding || !Array.isArray(embedding)) return [];

  const result = await runCypher(
    `
    CALL db.index.vector.queryNodes('term_embedding', $k, $embedding)
    YIELD node, score
    RETURN node.name AS term, score
    ORDER BY score DESC
    `,
    { k: topK, embedding }
  );

  return result.records.map((r) => ({
    term: r.get('term'),
    score: r.get('score'),
  }));
}

async function getRelatedCards(
  params: Record<string, unknown>
): Promise<Array<{ content_hash: string; text: string; shared_terms: number }>> {
  const contentHash = params.content_hash as string;
  const limit = (params.limit as number) || 10;

  if (!contentHash) return [];

  const result = await runCypher(
    `
    MATCH (c:Card {content_hash: $hash})-[:HAS_TERM]->(t:Term)<-[:HAS_TERM]-(other:Card)
    WHERE other.content_hash <> $hash
    WITH other, count(t) AS shared
    RETURN other.content_hash AS content_hash,
           other.text AS text,
           shared AS shared_terms
    ORDER BY shared DESC
    LIMIT $limit
    `,
    { hash: contentHash, limit }
  );

  return result.records.map((r) => ({
    content_hash: r.get('content_hash'),
    text: r.get('text'),
    shared_terms: r.get('shared_terms').toNumber(),
  }));
}

async function getCardTerms(
  params: Record<string, unknown>
): Promise<string[]> {
  const contentHash = params.content_hash as string;
  if (!contentHash) return [];

  const result = await runCypher(
    `
    MATCH (c:Card {content_hash: $hash})-[:HAS_TERM]->(t:Term)
    RETURN t.name AS term
    `,
    { hash: contentHash }
  );

  return result.records.map((r) => r.get('term'));
}

async function getTermExpansions(
  params: Record<string, unknown>
): Promise<Array<{ term: string; weight: number }>> {
  const term = params.term as string;
  const maxTerms = (params.max_terms as number) || 5;
  if (!term) return [];

  const result = await runCypher(
    `
    MATCH (t:Term {name: $term})-[r:CO_OCCURS]-(other:Term)
    RETURN other.name AS term, r.weight AS weight
    ORDER BY r.weight DESC
    LIMIT $max
    `,
    { term, max: maxTerms }
  );

  return result.records.map((r) => ({
    term: r.get('term'),
    weight: r.get('weight').toNumber(),
  }));
}

async function getWeakTerms(
  hashedUid: string,
  params: Record<string, unknown>
): Promise<Array<{ term: string; struggle_count: number }>> {
  const limit = (params.limit as number) || 10;

  const result = await runCypher(
    `
    MATCH (u:User {uid: $uid})-[s:STRUGGLED_WITH]->(t:Term)
    WHERE NOT (u)-[:MASTERED]->(t)
    RETURN t.name AS term, s.count AS struggle_count
    ORDER BY s.count DESC
    LIMIT $limit
    `,
    { uid: hashedUid, limit }
  );

  return result.records.map((r) => ({
    term: r.get('term'),
    struggle_count: r.get('struggle_count').toNumber(),
  }));
}

async function getKgMetrics(
  hashedUid: string
): Promise<{ totalCards: number; reviewedCards: number; avgEase: number; avgInterval: number }> {
  const result = await runCypher(
    `
    MATCH (u:User {uid: $uid})-[r:OWNS]->(c:Card)
    WITH count(c) AS totalCards,
         count(CASE WHEN r.ease IS NOT NULL THEN 1 END) AS reviewedCards,
         avg(CASE WHEN r.ease IS NOT NULL THEN r.ease END) AS avgEase,
         avg(CASE WHEN r.interval IS NOT NULL THEN r.interval END) AS avgInterval
    RETURN totalCards, reviewedCards, avgEase, avgInterval
    `,
    { uid: hashedUid }
  );

  const r = result.records[0];
  if (!r) {
    return { totalCards: 0, reviewedCards: 0, avgEase: 0, avgInterval: 0 };
  }

  return {
    totalCards: r.get('totalCards').toNumber(),
    reviewedCards: r.get('reviewedCards').toNumber(),
    avgEase: r.get('avgEase') != null ? parseFloat(r.get('avgEase').toFixed(1)) : 0,
    avgInterval: r.get('avgInterval') != null ? Math.round(r.get('avgInterval')) : 0,
  };
}

async function exactTermLookup(
  params: Record<string, unknown>
): Promise<string | null> {
  const query = params.query as string;
  if (!query) return null;

  const result = await runCypher(
    `
    MATCH (t:Term)
    WHERE toLower(t.name) = toLower($query)
    RETURN t.name AS term
    LIMIT 1
    `,
    { query }
  );

  const record = result.records[0];
  return record ? record.get('term') : null;
}

async function getAllTermEmbeddings(): Promise<
  Array<{ term: string; embedding: number[] }>
> {
  const result = await runCypher(
    `
    MATCH (t:Term)
    WHERE t.embedding IS NOT NULL
    RETURN t.name AS term, t.embedding AS embedding
    `
  );

  return result.records.map((r) => ({
    term: r.get('term'),
    embedding: r.get('embedding'),
  }));
}
