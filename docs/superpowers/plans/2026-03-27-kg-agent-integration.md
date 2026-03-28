# KG Triple-Retrieval Agent Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Knowledge Graph as third retrieval signal into the Tutor agent's HybridRetrieval pipeline, add KG reasoning step to the visual Suchstrategie display, improve term definitions with search context + card references, and connect graph node clicks to the sidebar.

**Architecture:** The KG lookup replaces the LLM-based query expansion (saving ~150 tokens/search) and adds a third retrieval signal alongside SQL and Semantic search. The existing `HybridRetrieval.retrieve()` in `ai/retrieval.py` gets a `kg_search` phase that runs in parallel with the other two. Frontend gets a new `kg_search` step renderer in the reasoning display. Term definitions become contextual (include search query + card refs).

**Tech Stack:** Python (SQLite KG queries), React/TypeScript (reasoning renderers), existing agent pipeline

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `ai/retrieval.py` | Modify | Add KG retrieval phase + triple merge |
| `ai/gemini.py` | Modify | Update `generate_definition` prompt with context + card refs |
| `frontend/src/reasoning/defaultRenderers.tsx` | Modify | Add `kg_search` step renderer + label |
| `frontend/src/components/GraphView.jsx` | Modify | Connect node click → `selectTerm` |
| `frontend/src/components/SearchSidebar.jsx` | Modify | Add connected terms chips in drill-down |
| `ui/widget.py` | Modify | Pass connected terms in term definition response |

---

### Task 1: Add KG retrieval phase to HybridRetrieval

**Files:**
- Modify: `ai/retrieval.py`

The KG search runs alongside SQL and Semantic. It uses `kg_card_terms` to find cards that contain terms connected to the query terms.

- [ ] **Step 1: Add KG retrieval method to HybridRetrieval**

In `ai/retrieval.py`, add this method to the `HybridRetrieval` class (after `_build_context_string`):

```python
    def _kg_retrieve(self, user_message, router_result):
        """Knowledge Graph retrieval: find cards via term co-occurrence.

        1. Look up query terms in kg_terms
        2. Find connected terms via kg_card_terms co-occurrence
        3. Return card IDs from those connected terms
        """
        try:
            try:
                from ..storage.kg_store import _get_db as kg_get_db
            except ImportError:
                from storage.kg_store import _get_db as kg_get_db

            db = kg_get_db()

            # Extract query words (≥3 chars, no stopwords)
            words = [w for w in user_message.split() if len(w) >= 3]
            if not words:
                return [], []

            # Find matching terms in KG
            matched_terms = []
            for word in words[:5]:
                rows = db.execute(
                    "SELECT term FROM kg_terms WHERE term LIKE ? ORDER BY frequency DESC LIMIT 5",
                    (f"%{word}%",)
                ).fetchall()
                matched_terms.extend([r[0] for r in rows])

            if not matched_terms:
                return [], []

            # Deduplicate
            matched_terms = list(dict.fromkeys(matched_terms))[:10]

            # Find connected terms (co-occurrence expansion)
            term_placeholders = ','.join('?' * len(matched_terms))
            connected_rows = db.execute(
                "SELECT DISTINCT b.term FROM kg_card_terms a "
                "JOIN kg_card_terms b ON a.card_id = b.card_id AND a.term != b.term "
                "WHERE a.term IN (%s) "
                "GROUP BY b.term "
                "HAVING COUNT(DISTINCT a.card_id) >= 2 "
                "ORDER BY COUNT(DISTINCT a.card_id) DESC "
                "LIMIT 15" % term_placeholders,
                matched_terms
            ).fetchall()
            expanded_terms = matched_terms + [r[0] for r in connected_rows]
            expanded_terms = list(dict.fromkeys(expanded_terms))[:20]

            # Find card IDs for all expanded terms
            exp_placeholders = ','.join('?' * len(expanded_terms))
            card_rows = db.execute(
                "SELECT DISTINCT card_id FROM kg_card_terms WHERE term IN (%s)" % exp_placeholders,
                expanded_terms
            ).fetchall()
            card_ids = [r[0] for r in card_rows]

            return card_ids, expanded_terms
        except Exception as e:
            logger.warning("KG retrieval failed: %s", e)
            return [], []
```

- [ ] **Step 2: Integrate KG phase into `retrieve()` method**

In `retrieve()`, add KG retrieval between the SQL and Semantic blocks. Find the comment `# Semantic retrieval` (~line 88) and insert BEFORE it:

```python
        # KG retrieval — Knowledge Graph term expansion (free, local)
        kg_card_ids = []
        kg_terms_found = []
        if mode in ('sql', 'both', 'semantic'):
            try:
                self.emit_step("kg_search", "active", {"terms": []})
                kg_card_ids, kg_terms_found = self._kg_retrieve(user_message, router_result)
                self.emit_step("kg_search", "done", {
                    "terms": kg_terms_found[:8],
                    "total_hits": len(kg_card_ids),
                })
            except Exception as e:
                logger.warning("HybridRetrieval: KG retrieval failed: %s", e)
                self.emit_step("kg_search", "error", {"message": str(e)})
```

- [ ] **Step 3: Update `_merge_results` to accept KG results**

Change the `_merge_results` signature and add KG card handling. In `retrieve()`, change the merge call (~line 152):

```python
        merged = self._merge_results(sql_citations, semantic_results, kg_card_ids, context, max_notes)
```

Update `_merge_results` method signature and add KG section after the semantic block:

```python
    def _merge_results(self, sql_citations, semantic_results, kg_card_ids, context, max_notes):
        """Merge SQL citations, semantic search results, and KG card IDs."""
        merged = {}

        # Add SQL results
        for note_id, data in sql_citations.items():
            merged[note_id] = {**data, 'sources': ['keyword']}

        # Enrich semantic results with card data from Anki
        if semantic_results:
            for card_id, score in semantic_results:
                card_data = self._load_card_data(card_id)
                if not card_data:
                    continue
                note_id_str = str(card_data.get('noteId', card_id))
                if note_id_str in merged:
                    if 'semantic' not in merged[note_id_str].get('sources', []):
                        merged[note_id_str]['sources'].append('semantic')
                    merged[note_id_str]['similarity_score'] = max(
                        score, merged[note_id_str].get('similarity_score', 0)
                    )
                else:
                    merged[note_id_str] = {
                        'noteId': card_data.get('noteId', card_id),
                        'cardId': card_id,
                        'fields': card_data.get('fields', {}),
                        'deckName': card_data.get('deckName', ''),
                        'isCurrentCard': False,
                        'similarity_score': score,
                        'sources': ['semantic']
                    }

        # Add KG results (cards found via term co-occurrence)
        for card_id in kg_card_ids[:max_notes]:
            card_data = self._load_card_data(card_id)
            if not card_data:
                continue
            note_id_str = str(card_data.get('noteId', card_id))
            if note_id_str in merged:
                if 'kg' not in merged[note_id_str].get('sources', []):
                    merged[note_id_str]['sources'].append('kg')
            else:
                merged[note_id_str] = {
                    'noteId': card_data.get('noteId', card_id),
                    'cardId': card_id,
                    'fields': card_data.get('fields', {}),
                    'deckName': card_data.get('deckName', ''),
                    'isCurrentCard': False,
                    'similarity_score': 0.3,
                    'sources': ['kg']
                }

        # Sort: more sources first, then by similarity score
        sorted_items = sorted(
            merged.items(),
            key=lambda x: (
                len(x[1].get('sources', [])),
                x[1].get('similarity_score', 0)
            ),
            reverse=True
        )

        return dict(sorted_items[:max_notes])
```

- [ ] **Step 4: Update merge step emission to include KG count**

In `retrieve()`, update the merge done emission (~line 180) to include KG:

```python
        if mode == 'both' and merged:
            keyword_count = sum(1 for d in merged.values() if 'keyword' in d.get('sources', []))
            semantic_count = sum(1 for d in merged.values() if 'semantic' in d.get('sources', []))
            kg_count = sum(1 for d in merged.values() if 'kg' in d.get('sources', []))
            total = len(merged)
            weight = semantic_count / max(1, keyword_count + semantic_count + kg_count)

            self.emit_step("merge", "done", {
                "keyword_count": keyword_count,
                "semantic_count": semantic_count,
                "kg_count": kg_count,
                "total": total,
                "weight_position": round(weight, 2)
            })
```

- [ ] **Step 5: Verify syntax**

Run: `python3 -c "import ast; ast.parse(open('ai/retrieval.py').read()); print('OK')"`

- [ ] **Step 6: Commit**

```bash
git add ai/retrieval.py
git commit -m "feat(retrieval): add KG as third retrieval signal in HybridRetrieval"
```

---

### Task 2: Add `kg_search` step renderer to reasoning display

**Files:**
- Modify: `frontend/src/reasoning/defaultRenderers.tsx`

- [ ] **Step 1: Add KG step name and done label**

In `STEP_NAMES` (~line 24), add:
```typescript
  kg_search: 'Knowledge Graph',
```

In `getDoneLabel` (~line 35), add a case before `default`:
```typescript
    case 'kg_search':
      return `${data.total_hits || 0} Graph-Treffer`;
```

- [ ] **Step 2: Create KgTerms renderer component**

Add after the `SemanticChunks` component (~line 350):

```tsx
/* ── KG Terms ── */
function KgTerms({ data, isDone, animate = true }: { data: Record<string, any>; isDone: boolean; animate?: boolean }) {
  const terms = data.terms || [];
  if (terms.length === 0 && !isDone) {
    return (
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <div style={{
          width: 80, height: 22, borderRadius: 5,
          background: 'linear-gradient(90deg, var(--ds-hover-tint), var(--ds-active-tint), var(--ds-hover-tint))',
          backgroundSize: '200% 100%',
          animation: 'ts-shimmerWave 2s ease-in-out infinite',
        }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {terms.slice(0, 8).map((term: string, i: number) => (
        <div
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 5,
            background: 'var(--ds-hover-tint)',
            color: 'var(--ds-text-secondary)',
            animation: animate ? `ts-pulseIn 0.3s ease-out ${i * 0.1}s both` : undefined,
          }}
        >
          <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.3 }}>
            <circle cx="5" cy="5" r="2" />
            <circle cx="11" cy="5" r="2" />
            <circle cx="8" cy="11" r="2" />
            <path d="M6.5 6.5L7 9.5M9.5 6.5L9 9.5M7 5h2" />
          </svg>
          <span>{term}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Register the kg_search step renderer**

In the registration block at the bottom of the file (where `registerStepRenderer` calls are), add:

```typescript
registerStepRenderer('kg_search', {
  label: 'Knowledge Graph',
  renderActive: (data) => <KgTerms data={data} isDone={false} />,
  renderDone: (data) => <KgTerms data={data} isDone={true} />,
  getDoneLabel: (data) => getDoneLabel('kg_search', data, 'done'),
});
```

- [ ] **Step 4: Update merge done label to include KG**

In `getDoneLabel`, update the `merge` case:
```typescript
    case 'merge': {
      const t = data.total || 0;
      const k = data.keyword_count || 0;
      const s = data.semantic_count || 0;
      const g = data.kg_count || 0;
      const parts = [];
      if (k > 0) parts.push(`${k}K`);
      if (s > 0) parts.push(`${s}S`);
      if (g > 0) parts.push(`${g}G`);
      return `${t} Quelle${t !== 1 ? 'n' : ''} kombiniert` + (parts.length > 0 ? ` (${parts.join(' + ')})` : '');
    }
```

- [ ] **Step 5: Build and verify**

Run: `cd frontend && npm run build`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/reasoning/defaultRenderers.tsx
git commit -m "feat(reasoning): add kg_search step renderer for Knowledge Graph retrieval"
```

---

### Task 3: Contextual term definitions with card references

**Files:**
- Modify: `ai/gemini.py` (function `generate_definition`, ~line 646)
- Modify: `ui/widget.py` (`KGDefinitionThread.run()`, ~line 707)

- [ ] **Step 1: Update `generate_definition` prompt**

Replace the prompt in `generate_definition()` (~line 670-673) with:

```python
    prompt = (
        "Erkläre '%s'%s basierend auf den folgenden Lernkarten.\n"
        "Referenziere relevante Karten inline mit [1], [2] etc.\n"
        "Maximal 3-4 Sätze. Antworte auf Deutsch.\n\n%s"
        % (term, (" im Kontext von '%s'" % search_query) if search_query else "", cards_str)
    )
```

Update the function signature to accept `search_query`:

```python
def generate_definition(term, card_texts, model=None, search_query=None):
```

- [ ] **Step 2: Update `KGDefinitionThread` to pass search query and card refs**

In `ui/widget.py`, update `KGDefinitionThread.__init__` (~line 711) to accept search_query:

```python
    def __init__(self, term, widget_ref, search_query=None):
        super().__init__()
        self.term = term
        self._widget_ref = weakref.ref(widget_ref) if widget_ref is not None else None
        self.search_query = search_query
```

In `KGDefinitionThread.run()`, pass search_query to `generate_definition` (~line 800):
```python
            definition = generate_definition(self.term, card_texts, search_query=self.search_query)
```

Add card_refs to the response (~line 806-816). After `source_ids = [cid for cid, _ in top_cards]`, add:

```python
            # Build card refs for frontend rendering
            card_refs = {}
            for i, (cid, _) in enumerate(top_cards):
                if i < len(card_texts):
                    card_refs[str(i + 1)] = {
                        "id": str(cid),
                        "question": (card_texts[i].get("question", ""))[:60],
                    }
```

Include card_refs in the emit:
```python
            connected = get_connected_terms(self.term)
            self.result_signal.emit(json.dumps({
                "type": "graph.termDefinition",
                "data": {
                    "term": self.term,
                    "definition": definition,
                    "sourceCount": len(source_ids),
                    "generatedBy": "llm",
                    "connectedTerms": connected,
                    "cardRefs": card_refs,
                }
            }))
```

- [ ] **Step 3: Pass search query when starting definition thread**

In `_msg_get_term_definition` and `_start_kg_definition`, pass the current search query. Update `_start_kg_definition` to accept search_query:

```python
    def _start_kg_definition(self, term, search_query=None):
        thread = KGDefinitionThread(term, self, search_query=search_query)
        # ... existing wiring
```

In `_msg_get_term_definition`, extract search query from current state and pass it:
```python
    def _msg_get_term_definition(self, data):
        try:
            term = data.get("term", "") if isinstance(data, dict) else str(data)
            search_query = data.get("searchQuery", "") if isinstance(data, dict) else ""
            # ... existing cache check ...
            self._start_kg_definition(term, search_query=search_query)
```

- [ ] **Step 4: Verify syntax**

Run: `python3 -c "import ast; ast.parse(open('ai/gemini.py').read()); print('OK')" && python3 -c "import ast; ast.parse(open('ui/widget.py').read()); print('OK')"`

- [ ] **Step 5: Commit**

```bash
git add ai/gemini.py ui/widget.py
git commit -m "feat(kg): contextual term definitions with card references and search query"
```

---

### Task 4: Connect graph node click to sidebar + add connected terms

**Files:**
- Modify: `frontend/src/components/GraphView.jsx`
- Modify: `frontend/src/components/SearchSidebar.jsx`

- [ ] **Step 1: Wire graph node click to selectTerm**

In `GraphView.jsx`, the knowledge graph `onNodeClick` (~line 320) currently only zooms. Add term selection. The component needs access to `smartSearch.selectTerm`. Check if it's passed via props or available.

In `GraphView.jsx`, add `selectTerm` to the destructured props from `smartSearch`:

```javascript
  const {
    query, searchResult, isSearching, hasResults,
    answerText, clusterLabels, clusterSummaries, cardRefs,
    selectedClusterId, setSelectedClusterId,
    selectedCluster, selectedClusterLabel, selectedClusterSummary,
    subClusters, kgSubgraph, graphMode,
    search, reset, selectTerm,
  } = smartSearch;
```

Then update the `onNodeClick` in the knowledge graph useEffect:

```javascript
      .onNodeClick(node => {
        if (!node || !node.isKg) return;
        // Select term in sidebar
        if (selectTerm) selectTerm(node);
        // Zoom to node
        const dist = 60;
        const r = Math.hypot(node.x || 1, node.y || 1, node.z || 1) || 1;
        const ratio = 1 + dist / r;
        graph.cameraPosition(
          { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
          node, 800
        );
      })
```

- [ ] **Step 2: Add connected terms in SearchSidebar drill-down**

In `SearchSidebar.jsx`, in the term drill-down view (where the definition is shown), add connected terms chips after the definition block. The `termDefinition` data from the hook includes `connectedTerms` (array of strings).

Find the definition rendering section in the drill-down and add after it:

```jsx
          {/* Connected terms navigation */}
          {termDefinition?.connectedTerms?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--ds-text-muted)', marginBottom: 6 }}>
                Verbundene Begriffe
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {termDefinition.connectedTerms.slice(0, 8).map(t => (
                  <button
                    key={t}
                    onClick={() => {
                      // Find this term in kgSubgraph nodes
                      const node = smartSearch.kgSubgraph?.nodes?.find(n => n.label === t);
                      if (node) onSelectTerm(node);
                    }}
                    style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      background: 'var(--ds-hover-tint)',
                      border: '1px solid var(--ds-border-subtle)',
                      borderRadius: 6,
                      color: 'var(--ds-text-secondary)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background 0.15s',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
```

- [ ] **Step 3: Pass searchQuery when requesting term definition**

In `useSmartSearch.js`, update `selectTerm` to include the current query:

```javascript
  const selectTerm = useCallback((termNode) => {
    if (!termNode) {
      setSelectedTerm(null);
      setTermDefinition(null);
      return;
    }
    setSelectedTerm(termNode);
    setTermDefinition(null);
    window.ankiBridge?.addMessage('getTermDefinition', {
      term: termNode.label || termNode.id,
      searchQuery: query || '',
    });
  }, [query]);
```

- [ ] **Step 4: Render card references in term definition**

In SearchSidebar's term drill-down, use the same card ref rendering logic that exists for the Perspektiven answer. Import or reuse the ref rendering from the answer section.

The definition text may contain `[1]`, `[2]` etc. Render them as clickable badges using `termDefinition.cardRefs`.

- [ ] **Step 5: Build and verify**

Run: `cd frontend && npm run build`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/GraphView.jsx frontend/src/components/SearchSidebar.jsx frontend/src/hooks/useSmartSearch.js
git commit -m "feat(kg): connect graph clicks to sidebar, add connected terms + card refs in drill-down"
```

---

### Task 5: Verify end-to-end

- [ ] **Step 1: Run Python tests**

Run: `python3 run_tests.py`
Expected: All tests pass (pre-existing failures OK)

- [ ] **Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Manual test checklist**

1. Restart Anki, search for something in Stapel tab
2. Reasoning display should show: Routing → Strategy → **KG Search** → SQL Search → Semantic Search → Merge
3. KG Search step shows expanded terms (nodes icon + term names)
4. Merge step shows triple count (e.g. "12 Quellen kombiniert (5K + 4S + 3G)")
5. Switch to Begriffe tab → click a term → sidebar shows contextual definition with `[1] [2]` refs
6. Click a node in 3D graph → sidebar highlights that term
7. Connected terms chips in drill-down → click one → navigates to that term
