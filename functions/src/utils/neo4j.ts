/**
 * Neo4j connection utility for Knowledge Graph.
 *
 * Uses the neo4j-driver npm package with connection pooling.
 * Credentials come from environment variables (set in Firebase config).
 */

import neo4j, { Driver, Session, Result } from 'neo4j-driver';
import * as v1 from 'firebase-functions/v1';

let _driver: Driver | null = null;

function getDriver(): Driver {
  if (_driver) return _driver;

  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USER;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !user || !password) {
    throw new Error(
      'Neo4j credentials not configured. Set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD env vars.'
    );
  }

  _driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 10,
    connectionAcquisitionTimeout: 5000,
  });

  v1.logger.info('Neo4j driver initialized', { uri });
  return _driver;
}

/**
 * Run a Cypher query and return the result.
 */
export async function runCypher(
  query: string,
  params: Record<string, unknown> = {}
): Promise<Result> {
  const driver = getDriver();
  const session: Session = driver.session();
  try {
    return await session.run(query, params);
  } finally {
    await session.close();
  }
}

/**
 * Run multiple Cypher queries in a single transaction.
 */
export async function runTransaction(
  queries: Array<{ query: string; params: Record<string, unknown> }>
): Promise<void> {
  const driver = getDriver();
  const session: Session = driver.session();
  const tx = session.beginTransaction();
  try {
    for (const { query, params } of queries) {
      await tx.run(query, params);
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Close the driver (for graceful shutdown).
 */
export async function closeDriver(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}
