/**
 * Search Provider — abstraction over full-text search backends.
 *
 * Application code depends on the `SearchProvider` interface. The DI container
 * selects the implementation (`InMemorySearchProvider` for development and
 * tests, a real backend such as Meilisearch / Elasticsearch / Typesense for
 * production — to be added in a later milestone).
 *
 * Features:
 *   - Indexer API: index / indexMany / update / delete / deleteIndex /
 *     createIndex
 *   - Search API: tokenised full-text matching with TF scoring, filters
 *     (equality + $eq/$ne/$gt/$gte/$lt/$lte/$in/$nin/$exists operators),
 *     sorting, pagination, and basic faceting.
 *   - count() — total matching documents without materialising results.
 */

import { logger } from '@/shared/logging';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface SearchDocument {
  id: string;
  index: string;
  fields: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  fields: Record<string, unknown>;
  highlights?: Record<string, string[]>;
}

export interface SearchQuery {
  index: string;
  query: string;
  filters?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  facets?: string[];
}

export interface Indexer {
  index(doc: SearchDocument): Promise<void>;
  indexMany(docs: SearchDocument[]): Promise<void>;
  update(id: string, index: string, fields: Record<string, unknown>): Promise<void>;
  delete(id: string, index: string): Promise<void>;
  deleteIndex(index: string): Promise<void>;
  createIndex(index: string, schema: Record<string, string>): Promise<void>;
}

export interface SearchProvider extends Indexer {
  search(
    query: SearchQuery,
  ): Promise<{
    results: SearchResult[];
    total: number;
    facets?: Record<string, Record<string, number>>;
  }>;
  count(query: Omit<SearchQuery, 'limit' | 'offset'>): Promise<number>;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface IndexState {
  schema: Record<string, string>;
  docs: Map<string, SearchDocument>;
  /** token → (docId → term frequency) */
  invertedIndex: Map<string, Map<string, number>>;
}

/** A parsed filter predicate tree. */
type FilterMatcher = (doc: SearchDocument) => boolean;

// ---------------------------------------------------------------------------
// Tokenisation & scoring helpers
// ---------------------------------------------------------------------------

const TOKEN_SPLIT = /[^a-z0-9]+/g;

/** Lowercase + split on non-alphanumeric, dropping empty tokens. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter((t) => t.length > 0);
}

/** Flatten a field value into the strings that should be indexed. */
function fieldToIndexableStrings(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const v of value) out.push(...fieldToIndexableStrings(v));
    return out;
  }
  if (typeof value === 'object') {
    try {
      return [JSON.stringify(value)];
    } catch {
      return [];
    }
  }
  return [];
}

/** Extract all indexable text from a document (concatenation of field text). */
function extractDocTokens(doc: SearchDocument): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of Object.values(doc.fields)) {
    for (const str of fieldToIndexableStrings(value)) {
      for (const tok of tokenize(str)) {
        counts.set(tok, (counts.get(tok) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** Compare two values for sorting; numbers numerically, strings lexically. */
function compareValues(a: unknown, b: unknown): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return -1;
  if (b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Filter matching
// ---------------------------------------------------------------------------

function valueEquals(field: unknown, target: unknown): boolean {
  if (Array.isArray(field)) return field.some((v) => v === target);
  return field === target;
}

function valueIn(field: unknown, targets: unknown[]): boolean {
  if (Array.isArray(field)) return field.some((v) => targets.includes(v));
  return targets.includes(field);
}

function applyOperator(field: unknown, op: string, operand: unknown): boolean {
  switch (op) {
    case '$eq':
      return valueEquals(field, operand);
    case '$ne':
      return !valueEquals(field, operand);
    case '$gt':
      return compareValues(field, operand) > 0;
    case '$gte':
      return compareValues(field, operand) >= 0;
    case '$lt':
      return compareValues(field, operand) < 0;
    case '$lte':
      return compareValues(field, operand) <= 0;
    case '$in':
      return Array.isArray(operand) && valueIn(field, operand);
    case '$nin':
      return Array.isArray(operand) && !valueIn(field, operand);
    case '$exists':
      return operand ? field !== undefined : field === undefined;
    default:
      // Unknown operator — fail safe (no match).
      return false;
  }
}

function buildFilterMatcher(filters: Record<string, unknown>): FilterMatcher {
  const matchers: Array<(doc: SearchDocument) => boolean> = [];
  for (const [field, condition] of Object.entries(filters)) {
    if (condition !== null && typeof condition === 'object' && !Array.isArray(condition)) {
      const ops = condition as Record<string, unknown>;
      matchers.push((doc) => Object.entries(ops).every(([op, operand]) => applyOperator(doc.fields[field], op, operand)));
    } else {
      // Equality shorthand
      matchers.push((doc) => valueEquals(doc.fields[field], condition));
    }
  }
  return (doc) => matchers.every((m) => m(doc));
}

// ---------------------------------------------------------------------------
// InMemorySearchProvider
// ---------------------------------------------------------------------------

/**
 * In-memory inverted index. Suitable for development, unit tests, and small
 * datasets. All operations are synchronous under the hood but return Promises
 * to match the `SearchProvider` interface, so swapping in a real backend is a
 * pure DI change.
 *
 * The inverted index maps tokens to a posting list of (docId → term
 * frequency). Search accumulates per-document TF scores across query tokens,
 * applies filters, sorts, paginates, and computes facets over the matching
 * candidate set.
 */
export class InMemorySearchProvider implements SearchProvider {
  private readonly indexes = new Map<string, IndexState>();

  // -- Indexer ---------------------------------------------------------------

  async createIndex(index: string, schema: Record<string, string> = {}): Promise<void> {
    if (!this.indexes.has(index)) {
      this.indexes.set(index, {
        schema,
        docs: new Map(),
        invertedIndex: new Map(),
      });
      logger.system().debug('Search index created', { index, fields: Object.keys(schema) });
    } else {
      // Update schema of an existing index.
      const state = this.indexes.get(index);
      if (state) state.schema = { ...state.schema, ...schema };
    }
  }

  async deleteIndex(index: string): Promise<void> {
    this.indexes.delete(index);
    logger.system().debug('Search index deleted', { index });
  }

  async index(doc: SearchDocument): Promise<void> {
    const state = this.getOrCreateIndex(doc.index);
    // Remove previous version of the doc (if any) so stale tokens are cleared.
    const previous = state.docs.get(doc.id);
    if (previous) this.removeDocFromInvertedIndex(state, previous);
    state.docs.set(doc.id, doc);
    this.addDocToInvertedIndex(state, doc);
  }

  async indexMany(docs: SearchDocument[]): Promise<void> {
    for (const doc of docs) await this.index(doc);
  }

  async update(id: string, index: string, fields: Record<string, unknown>): Promise<void> {
    const state = this.indexes.get(index);
    if (!state) {
      throw new Error(`Cannot update doc — index does not exist: ${index}`);
    }
    const existing = state.docs.get(id);
    if (!existing) {
      // Treat as a new document if it doesn't exist.
      await this.index({ id, index, fields });
      return;
    }
    const updated: SearchDocument = {
      id,
      index,
      fields: { ...existing.fields, ...fields },
      metadata: existing.metadata,
    };
    // Re-index atomically: remove old, add new.
    this.removeDocFromInvertedIndex(state, existing);
    state.docs.set(id, updated);
    this.addDocToInvertedIndex(state, updated);
  }

  async delete(id: string, index: string): Promise<void> {
    const state = this.indexes.get(index);
    if (!state) return;
    const doc = state.docs.get(id);
    if (!doc) return;
    this.removeDocFromInvertedIndex(state, doc);
    state.docs.delete(id);
  }

  // -- Search ----------------------------------------------------------------

  async search(
    query: SearchQuery,
  ): Promise<{
    results: SearchResult[];
    total: number;
    facets?: Record<string, Record<string, number>>;
  }> {
    const state = this.indexes.get(query.index);
    if (!state) {
      return { results: [], total: 0 };
    }

    const queryTokens = tokenize(query.query ?? '');
    const scores = new Map<string, number>();

    if (queryTokens.length > 0) {
      for (const token of queryTokens) {
        const postings = state.invertedIndex.get(token);
        if (!postings) continue;
        for (const [docId, tf] of postings) {
          scores.set(docId, (scores.get(docId) ?? 0) + tf);
        }
      }
    }

    // Build candidate list. With no query tokens, every doc is a candidate
    // (filter-only search). With query tokens, only matched docs.
    let candidates: Array<{ id: string; score: number }>;
    if (queryTokens.length === 0) {
      candidates = [];
      for (const id of state.docs.keys()) candidates.push({ id, score: 0 });
    } else {
      candidates = Array.from(scores.entries()).map(([id, score]) => ({ id, score }));
    }

    // Apply filters
    if (query.filters && Object.keys(query.filters).length > 0) {
      const matcher = buildFilterMatcher(query.filters);
      candidates = candidates.filter((c) => {
        const doc = state.docs.get(c.id);
        return doc ? matcher(doc) : false;
      });
    }

    // Sort
    if (query.sortBy) {
      const field = query.sortBy;
      const order = query.sortOrder === 'desc' ? -1 : 1;
      candidates.sort((a, b) => {
        const aDoc = state.docs.get(a.id);
        const bDoc = state.docs.get(b.id);
        if (!aDoc || !bDoc) return 0;
        return order * compareValues(aDoc.fields[field], bDoc.fields[field]);
      });
    } else {
      // Sort by score desc, then by id for stable ordering.
      candidates.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }

    const total = candidates.length;

    // Facets (computed over the full filtered candidate set, not the page)
    let facets: Record<string, Record<string, number>> | undefined;
    if (query.facets && query.facets.length > 0) {
      facets = {};
      for (const field of query.facets) {
        const counts: Record<string, number> = {};
        for (const c of candidates) {
          const doc = state.docs.get(c.id);
          if (!doc) continue;
          const value = doc.fields[field];
          if (Array.isArray(value)) {
            for (const v of value) {
              const key = String(v);
              counts[key] = (counts[key] ?? 0) + 1;
            }
          } else if (value !== undefined && value !== null) {
            const key = String(value);
            counts[key] = (counts[key] ?? 0) + 1;
          }
        }
        facets[field] = counts;
      }
    }

    // Paginate
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const page = candidates.slice(offset, offset + limit);

    const results: SearchResult[] = page.map((c) => {
      const doc = state.docs.get(c.id);
      if (!doc) {
        return { id: c.id, score: c.score, fields: {} };
      }
      return {
        id: c.id,
        score: c.score,
        fields: doc.fields,
        highlights: queryTokens.length > 0 ? this.buildHighlights(doc, queryTokens) : undefined,
      };
    });

    return { results, total, facets };
  }

  async count(query: Omit<SearchQuery, 'limit' | 'offset'>): Promise<number> {
    const result = await this.search({ ...query, limit: 0, offset: 0 });
    return result.total;
  }

  // -- Internals -------------------------------------------------------------

  private getOrCreateIndex(index: string): IndexState {
    let state = this.indexes.get(index);
    if (!state) {
      state = {
        schema: {},
        docs: new Map(),
        invertedIndex: new Map(),
      };
      this.indexes.set(index, state);
    }
    return state;
  }

  private addDocToInvertedIndex(state: IndexState, doc: SearchDocument): void {
    const tokens = extractDocTokens(doc);
    for (const [token, tf] of tokens) {
      let postings = state.invertedIndex.get(token);
      if (!postings) {
        postings = new Map();
        state.invertedIndex.set(token, postings);
      }
      postings.set(doc.id, tf);
    }
  }

  private removeDocFromInvertedIndex(state: IndexState, doc: SearchDocument): void {
    const tokens = extractDocTokens(doc);
    for (const token of tokens.keys()) {
      const postings = state.invertedIndex.get(token);
      if (!postings) continue;
      postings.delete(doc.id);
      if (postings.size === 0) state.invertedIndex.delete(token);
    }
  }

  /**
   * Build simple per-field highlights. For each text field, return up to 3
   * snippets (max 80 chars each) with matched query tokens wrapped in `<mark>`.
   */
  private buildHighlights(doc: SearchDocument, queryTokens: string[]): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    const tokenSet = new Set(queryTokens);
    for (const [field, value] of Object.entries(doc.fields)) {
      const strings = fieldToIndexableStrings(value);
      if (strings.length === 0) continue;
      const snippets: string[] = [];
      for (const str of strings) {
        if (snippets.length >= 3) break;
        const snippet = highlightString(str, tokenSet, 80);
        if (snippet) snippets.push(snippet);
      }
      if (snippets.length > 0) result[field] = snippets;
    }
    return result;
  }
}

/**
 * Produce a snippet of `str` with matched tokens wrapped in `<mark>`. Returns
 * null if no query token appears in the string.
 */
function highlightString(str: string, tokens: Set<string>, maxLen: number): string | null {
  const lower = str.toLowerCase();
  const words = lower.split(TOKEN_SPLIT);
  let matched = false;
  for (const w of words) {
    if (tokens.has(w)) {
      matched = true;
      break;
    }
  }
  if (!matched) return null;

  // Escape HTML special chars in the original string, then wrap matches.
  const escaped = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Build a regex of query tokens (escaped) for replacement.
  if (tokens.size === 0) return null;
  const pattern = Array.from(tokens)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const re = new RegExp(`(${pattern})`, 'gi');
  const highlighted = escaped.replace(re, '<mark>$1</mark>');

  if (highlighted.length <= maxLen) return highlighted;
  // Find the first match position and centre the snippet on it.
  const match = re.exec(highlighted);
  if (!match) return highlighted.slice(0, maxLen) + '…';
  const start = Math.max(0, match.index - Math.floor(maxLen / 3));
  const end = Math.min(highlighted.length, start + maxLen);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < highlighted.length ? '…' : '';
  return prefix + highlighted.slice(start, end) + suffix;
}
