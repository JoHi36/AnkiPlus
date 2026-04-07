// Neo4j Knowledge Graph Schema for AnkiPlus
// Run once on AuraDB instance before first use.
//
// Usage: paste into Neo4j Browser or run via cypher-shell:
//   cat scripts/neo4j_schema.cypher | cypher-shell -u neo4j -p <password> -a <uri>

// === Uniqueness Constraints ===

CREATE CONSTRAINT card_hash IF NOT EXISTS
FOR (c:Card) REQUIRE c.content_hash IS UNIQUE;

CREATE CONSTRAINT term_name IF NOT EXISTS
FOR (t:Term) REQUIRE t.name IS UNIQUE;

CREATE CONSTRAINT user_uid IF NOT EXISTS
FOR (u:User) REQUIRE u.uid IS UNIQUE;

CREATE CONSTRAINT deck_name IF NOT EXISTS
FOR (d:Deck) REQUIRE d.name IS UNIQUE;

CREATE CONSTRAINT agent_name IF NOT EXISTS
FOR (a:Agent) REQUIRE a.name IS UNIQUE;

// === Vector Indexes (Neo4j 5.x native ANN) ===

// Card embeddings — full 3072-dim for maximum recall
CREATE VECTOR INDEX card_embedding IF NOT EXISTS
FOR (c:Card) ON (c.embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 3072,
  `vector.similarity_function`: 'cosine'
}};

// Term embeddings — 768-dim, card-averaged (cheaper storage)
CREATE VECTOR INDEX term_embedding IF NOT EXISTS
FOR (t:Term) ON (t.embedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 768,
  `vector.similarity_function`: 'cosine'
}};

// === Lookup Indexes ===

CREATE INDEX term_name_lookup IF NOT EXISTS FOR (t:Term) ON (t.name);
CREATE INDEX card_hash_lookup IF NOT EXISTS FOR (c:Card) ON (c.content_hash);
CREATE INDEX session_agent IF NOT EXISTS FOR (s:Session) ON (s.agent);
CREATE INDEX user_uid_lookup IF NOT EXISTS FOR (u:User) ON (u.uid);

// === Seed Agent Nodes ===

MERGE (a:Agent {name: 'tutor'});
MERGE (a:Agent {name: 'research'});
MERGE (a:Agent {name: 'definition'});
MERGE (a:Agent {name: 'prufer'});
MERGE (a:Agent {name: 'plusi'});
