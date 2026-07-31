/**
 * Metrics Framework — comprehensive in-memory metrics with Prometheus export.
 *
 * This EXTENDS the simple `InMemoryMetricsRecorder` in
 * `src/infrastructure/telemetry/metrics.ts` (which only tracks command/query
 * dispatch timing) with a full metric taxonomy:
 *
 *   - Counters: monotonically increasing values (request counts, dispatched
 *     commands, cache hits). Reset only by `reset()`.
 *   - Gauges: arbitrary point-in-time values (queue depth, in-flight
 *     requests, circuit-breaker state). Can go up or down.
 *   - Histograms: distributions of observations (request duration, db query
 *     duration). Pre-aggregates count/sum/min/max/avg and percentiles.
 *   - Timers: convenience wrappers over histograms for duration measurement.
 *     `startTimer()` returns a stop function that records the elapsed
 *     duration in seconds.
 *
 * All metrics are multi-dimensional: each (name, labels) pair is stored
 * separately. Labels are keyed by a stable, sorted serialization so that
 * `{route:'/users', method:'GET'}` and `{method:'GET', route:'/users'}`
 * resolve to the same series.
 *
 * The framework pre-registers a set of standard metrics so that consumers
 * can rely on them existing (with zero values) before any observation is
 * recorded. The `toPrometheus()` method emits the standard text exposition
 * format consumed by Prometheus, Grafana, vmagent, etc.
 *
 * Design notes:
 *   - Histograms keep the full list of observations in memory. This is fine
 *     for low-volume application metrics (commands, queries, queue depths).
 *     For high-volume metrics (per-request timings on a busy API), a
 *     bucketed histogram would be more memory-efficient — the interface is
 *     identical so the implementation can be swapped later.
 *   - Percentiles are computed via linear interpolation on the sorted
 *     observation list (matching Prometheus' histogram_quantile semantics
 *     for the same input data).
 *   - All operations are synchronous and in-memory; there is no batching,
 *     networking, or persistence. Production scrape endpoints call
 *     `toPrometheus()` on an HTTP `/metrics` handler.
 */

import { logger } from '@/shared/logging';

// ─── Public Types ──────────────────────────────────────────────────────────

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'timer';

export interface MetricSample {
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface HistogramStats {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface MetricsFramework {
  // Counters (monotonically increasing)
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): void;
  getCounter(name: string, labels?: Record<string, string>): number;

  // Gauges (can go up or down)
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
  getGauge(name: string, labels?: Record<string, string>): number;

  // Histograms (distribution of values)
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void;
  getHistogram(name: string, labels?: Record<string, string>): HistogramStats;

  // Timers (special histogram for durations)
  startTimer(name: string, labels?: Record<string, string>): () => void;

  // Export in Prometheus text exposition format
  toPrometheus(): string;

  // Get all metrics as a flat sample list
  getAll(): MetricSample[];

  // Reset everything
  reset(): void;
}

// ─── Internal Metric Definitions ──────────────────────────────────────────

interface MetricDefinition {
  readonly name: string;
  readonly type: MetricType;
  readonly help: string;
  readonly labelNames: readonly string[];
}

/**
 * Pre-registered standard metrics. These are emitted by `toPrometheus()`
 * with their HELP and TYPE lines even if no observation has been recorded,
 * so that Prometheus can rely on them existing in the exposition.
 */
export const STANDARD_METRICS: readonly MetricDefinition[] = [
  {
    name: 'http_requests_total',
    type: 'counter',
    help: 'Total number of HTTP requests received.',
    labelNames: ['method', 'route', 'status'],
  },
  {
    name: 'http_request_duration_seconds',
    type: 'histogram',
    help: 'HTTP request duration in seconds.',
    labelNames: ['method', 'route'],
  },
  {
    name: 'commands_dispatched_total',
    type: 'counter',
    help: 'Total number of commands dispatched through the command bus.',
    labelNames: ['commandType', 'status'],
  },
  {
    name: 'queries_executed_total',
    type: 'counter',
    help: 'Total number of queries executed through the query bus.',
    labelNames: ['queryType', 'status'],
  },
  {
    name: 'worker_processed_total',
    type: 'counter',
    help: 'Total number of items processed by background workers.',
    labelNames: ['workerName'],
  },
  {
    name: 'cache_hits_total',
    type: 'counter',
    help: 'Total number of cache hits.',
    labelNames: [],
  },
  {
    name: 'cache_misses_total',
    type: 'counter',
    help: 'Total number of cache misses.',
    labelNames: [],
  },
  {
    name: 'db_query_duration_seconds',
    type: 'histogram',
    help: 'Database query duration in seconds.',
    labelNames: [],
  },
  {
    name: 'queue_depth',
    type: 'gauge',
    help: 'Current depth of a queue (pending + in-flight).',
    labelNames: ['queue'],
  },
  {
    name: 'circuit_breaker_state',
    type: 'gauge',
    help: 'Circuit breaker state: 0=closed, 1=half-open, 2=open.',
    labelNames: ['name'],
  },
] as const;

/** Standard metric names for direct reference. */
export const METRIC_NAMES = {
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  HTTP_REQUEST_DURATION_SECONDS: 'http_request_duration_seconds',
  COMMANDS_DISPATCHED_TOTAL: 'commands_dispatched_total',
  QUERIES_EXECUTED_TOTAL: 'queries_executed_total',
  WORKER_PROCESSED_TOTAL: 'worker_processed_total',
  CACHE_HITS_TOTAL: 'cache_hits_total',
  CACHE_MISSES_TOTAL: 'cache_misses_total',
  DB_QUERY_DURATION_SECONDS: 'db_query_duration_seconds',
  QUEUE_DEPTH: 'queue_depth',
  CIRCUIT_BREAKER_STATE: 'circuit_breaker_state',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Deterministic label key. Sorts label entries by name so the same labels in
 * any order produce the same key (and the same Prometheus line).
 */
function labelsKey(labels: Record<string, string> | undefined): string {
  if (!labels) return '';
  const names = Object.keys(labels).sort();
  if (names.length === 0) return '';
  return names.map((n) => `${n}="${escapeLabelValue(labels[n])}"`).join(',');
}

/** Escape a label value per the Prometheus exposition format spec. */
function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Sort and stringify labels for Prometheus output (without surrounding braces).
 * Returns an empty string if there are no labels.
 */
function formatLabels(labels: Record<string, string> | undefined): string {
  if (!labels) return '';
  const names = Object.keys(labels).sort();
  if (names.length === 0) return '';
  return '{' + names.map((n) => `${n}="${escapeLabelValue(labels[n])}"`).join(',') + '}';
}

/**
 * Compute percentile via linear interpolation on a sorted ascending array.
 * `p` is in the range [0, 1].
 */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const clamped = Math.min(1, Math.max(0, p));
  // Rank using the "lower index" method (matches numpy default / linear interp).
  const rank = clamped * (sortedAsc.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedAsc[lower];
  const fraction = rank - lower;
  return sortedAsc[lower] + (sortedAsc[upper] - sortedAsc[lower]) * fraction;
}

function emptyHistogramStats(): HistogramStats {
  return { count: 0, sum: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
}

// ─── InMemoryMetricsFramework ─────────────────────────────────────────────

/**
 * In-memory implementation of `MetricsFramework`.
 *
 * Storage layout:
 *   - counters: Map<name, Map<labelsKey, { value, labels }>>
 *   - gauges:   same shape as counters
 *   - histograms: Map<name, Map<labelsKey, { observations, labels, sortedCache }>
 *
 * The `labels` field is retained alongside each value so we can re-emit the
 * original label set in `toPrometheus()` without parsing the labelsKey back.
 */
export class InMemoryMetricsFramework implements MetricsFramework {
  private readonly definitions = new Map<string, MetricDefinition>();
  private readonly counters = new Map<string, Map<string, { value: number; labels: Record<string, string> }>>();
  private readonly gauges = new Map<string, Map<string, { value: number; labels: Record<string, string> }>>();
  private readonly histograms = new Map<string, Map<string, { observations: number[]; labels: Record<string, string>; sorted: number[] | null }>>();

  constructor() {
    // Pre-register all standard metrics so they appear in exports immediately.
    for (const def of STANDARD_METRICS) {
      this.definitions.set(def.name, def);
    }
    logger.system().debug('Metrics framework initialized', {
      standardMetrics: STANDARD_METRICS.length,
    });
  }

  // ─── Counters ──────────────────────────────────────────────────────────

  incrementCounter(name: string, value = 1, labels?: Record<string, string>): void {
    if (value < 0) {
      // Counters are monotonic. We do not throw — we log and ignore — so that
      // a buggy caller cannot crash the metrics path.
      logger.system().warn('Counter increment with negative value ignored', { name, value });
      return;
    }
    const key = labelsKey(labels);
    let series = this.counters.get(name);
    if (!series) {
      series = new Map();
      this.counters.set(name, series);
    }
    const existing = series.get(key);
    if (existing) {
      existing.value += value;
    } else {
      series.set(key, { value, labels: labels ?? {} });
    }
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    const series = this.counters.get(name);
    if (!series) return 0;
    const entry = series.get(labelsKey(labels));
    return entry?.value ?? 0;
  }

  // ─── Gauges ────────────────────────────────────────────────────────────

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = labelsKey(labels);
    let series = this.gauges.get(name);
    if (!series) {
      series = new Map();
      this.gauges.set(name, series);
    }
    series.set(key, { value, labels: labels ?? {} });
  }

  getGauge(name: string, labels?: Record<string, string>): number {
    const series = this.gauges.get(name);
    if (!series) return 0;
    const entry = series.get(labelsKey(labels));
    return entry?.value ?? 0;
  }

  // ─── Histograms ────────────────────────────────────────────────────────

  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      logger.system().warn('Histogram observation with non-finite value ignored', { name, value });
      return;
    }
    const key = labelsKey(labels);
    let series = this.histograms.get(name);
    if (!series) {
      series = new Map();
      this.histograms.set(name, series);
    }
    let entry = series.get(key);
    if (!entry) {
      entry = { observations: [], labels: labels ?? {}, sorted: null };
      series.set(key, entry);
    }
    entry.observations.push(value);
    entry.sorted = null; // invalidate cache
  }

  getHistogram(name: string, labels?: Record<string, string>): HistogramStats {
    const series = this.histograms.get(name);
    if (!series) return emptyHistogramStats();
    const entry = series.get(labelsKey(labels));
    if (!entry || entry.observations.length === 0) return emptyHistogramStats();

    const observations = entry.observations;
    const count = observations.length;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const v of observations) {
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const avg = sum / count;

    // Lazily sort a cached copy so repeated reads of p50/p95/p99 are cheap.
    if (entry.sorted === null) {
      entry.sorted = [...observations].sort((a, b) => a - b);
    }
    const sorted = entry.sorted;
    return {
      count,
      sum,
      avg,
      min,
      max,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
    };
  }

  // ─── Timers ────────────────────────────────────────────────────────────

  /**
   * Start a timer. Returns a stop function that records the elapsed duration
   * in SECONDS to the named histogram. Calling the stop function more than
   * once only records the first call.
   */
  startTimer(name: string, labels?: Record<string, string>): () => void {
    const startNs = process.hrtime.bigint();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const endNs = process.hrtime.bigint();
      // Convert nanoseconds to seconds (float, matching Prometheus convention).
      const seconds = Number(endNs - startNs) / 1_000_000_000;
      this.observeHistogram(name, seconds, labels);
    };
  }

  // ─── Export ────────────────────────────────────────────────────────────

  /**
   * Emit all metrics in Prometheus text exposition format.
   *
   * Format (per metric family):
   *   # HELP <name> <help text>
   *   # TYPE <name> <counter|gauge|histogram|untyped>
   *   <name>[{labels}] <value>
   *   ...
   *
   * For histograms we emit the standard `_sum`, `_count`, and a single
   * representative observation per series (the average). This is sufficient
   * for human dashboards; a full bucketed exposition can be added later
   * without changing the interface.
   */
  toPrometheus(): string {
    const lines: string[] = [];

    // Definitions (HELP/TYPE) for all known metrics, in registration order.
    const emittedDefinitions = new Set<string>();
    for (const def of this.definitions.values()) {
      lines.push(`# HELP ${def.name} ${def.help}`);
      // Prometheus TYPE for "timer" is histogram (timers are histograms under the hood).
      const promType = def.type === 'timer' ? 'histogram' : def.type;
      lines.push(`# TYPE ${def.name} ${promType}`);
      emittedDefinitions.add(def.name);
    }

    // Counters
    for (const [name, series] of this.counters) {
      if (!emittedDefinitions.has(name)) {
        lines.push(`# HELP ${name} Counter metric`);
        lines.push(`# TYPE ${name} counter`);
        emittedDefinitions.add(name);
      }
      for (const entry of series.values()) {
        lines.push(`${name}${formatLabels(entry.labels)} ${formatNumber(entry.value)}`);
      }
      // If the metric was pre-registered but never observed, emit a zero
      // line so Prometheus always sees the series.
      if (series.size === 0 && this.definitions.has(name)) {
        lines.push(`${name} 0`);
      }
    }

    // Gauges
    for (const [name, series] of this.gauges) {
      if (!emittedDefinitions.has(name)) {
        lines.push(`# HELP ${name} Gauge metric`);
        lines.push(`# TYPE ${name} gauge`);
        emittedDefinitions.add(name);
      }
      for (const entry of series.values()) {
        lines.push(`${name}${formatLabels(entry.labels)} ${formatNumber(entry.value)}`);
      }
      if (series.size === 0 && this.definitions.has(name)) {
        lines.push(`${name} 0`);
      }
    }

    // Histograms (and timers, which are histograms)
    for (const [name, series] of this.histograms) {
      if (!emittedDefinitions.has(name)) {
        lines.push(`# HELP ${name} Histogram metric`);
        lines.push(`# TYPE ${name} histogram`);
        emittedDefinitions.add(name);
      }
      for (const entry of series.values()) {
        const stats = this.getHistogram(name, entry.labels);
        const labelStr = formatLabels(entry.labels);
        // Standard Prometheus histogram exposition: _sum, _count, plus
        // a single observation line carrying the average value.
        lines.push(`${name}_count${labelStr} ${stats.count}`);
        lines.push(`${name}_sum${labelStr} ${formatNumber(stats.sum)}`);
        lines.push(`${name}${labelStr} ${formatNumber(stats.avg)}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  // ─── Snapshot ──────────────────────────────────────────────────────────

  /**
   * Flatten all metrics into a single sample list. Useful for JSON
   * serialization in admin APIs.
   */
  getAll(): MetricSample[] {
    const samples: MetricSample[] = [];
    const now = Date.now();

    for (const [name, series] of this.counters) {
      const def = this.definitions.get(name);
      const type: MetricType = def?.type ?? 'counter';
      for (const entry of series.values()) {
        samples.push({ name, type, value: entry.value, labels: { ...entry.labels }, timestamp: now });
      }
    }

    for (const [name, series] of this.gauges) {
      const def = this.definitions.get(name);
      const type: MetricType = def?.type ?? 'gauge';
      for (const entry of series.values()) {
        samples.push({ name, type, value: entry.value, labels: { ...entry.labels }, timestamp: now });
      }
    }

    for (const [name, series] of this.histograms) {
      const def = this.definitions.get(name);
      const type: MetricType = def?.type ?? 'histogram';
      for (const entry of series.values()) {
        const stats = this.getHistogram(name, entry.labels);
        // One sample per histogram series carrying the average observation.
        samples.push({ name, type, value: stats.avg, labels: { ...entry.labels }, timestamp: now });
      }
    }

    return samples;
  }

  // ─── Reset ─────────────────────────────────────────────────────────────

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

/** Format a number for Prometheus — avoid scientific notation for small values. */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  // Trim trailing zeros from the decimal representation while preserving
  // reasonable precision (Prometheus accepts up to ~17 significant digits).
  return String(Math.round(value * 1_000_000) / 1_000_000);
}

// ─── Singleton accessor ───────────────────────────────────────────────────

let frameworkInstance: InMemoryMetricsFramework | null = null;

/**
 * Get the process-wide `InMemoryMetricsFramework` singleton. Composition root
 * is the typical caller; production code should resolve the framework from
 * the DI container rather than calling this directly.
 */
export function getMetricsFramework(): InMemoryMetricsFramework {
  if (!frameworkInstance) {
    frameworkInstance = new InMemoryMetricsFramework();
  }
  return frameworkInstance;
}

/** Reset the singleton (for testing / hot reload). */
export function resetMetricsFramework(): void {
  frameworkInstance = null;
}
