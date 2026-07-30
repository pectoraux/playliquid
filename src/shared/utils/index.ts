/**
 * Shared utility helpers.
 */

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Debounce an async function. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

/** Retry an async function with exponential backoff. */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 100, maxDelayMs = 5000 } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt === maxRetries) break;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Sleep for a number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Safe JSON parse that returns a fallback on failure. */
export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Safe JSON stringify. */
export function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value);
}

/** Group an array by a key function. */
export function groupBy<T, K extends string | number>(
  items: T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  return items.reduce(
    (acc, item) => {
      const key = keyFn(item);
      (acc[key] ??= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

/** Chunk an array into batches. */
export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Remove duplicates from an array by a key. */
export function uniqueBy<T, K>(items: T[], keyFn: (item: T) => K): T[] {
  const seen = new Set<K>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
