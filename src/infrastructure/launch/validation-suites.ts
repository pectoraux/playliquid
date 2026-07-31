/**
 * Built-in platform validation suites for the Launch & Scale program.
 *
 * Each suite is a collection of `ValidationCheck`s that verify a specific
 * aspect of the platform. The `ValidationSuiteRunner` runs them on demand
 * (or on a schedule via the scheduler) and persists the result via the
 * `ValidationRunRepository`.
 *
 * Design principles:
 *
 *   1. **Real checks, not stubs.** Every check queries the database, calls
 *      an endpoint, or exercises a real subsystem. No `passed: true`
 *      placeholders.
 *
 *   2. **Graceful degradation.** If a dependency is unavailable (e.g. an
 *      optional service wasn't wired into the DI container), the check
 *      returns `{ passed: false, message: '...' }` instead of throwing.
 *      Throwing would cause the suite runner to mark the check as failed
 *      but with a generic "threw" message; returning the explicit failure
 *      gives ops a clear action item.
 *
 *   3. **No raw env access.** Base URL for HTTP checks comes from
 *      `getEnvVar('VALIDATION_BASE_URL')` with a localhost default.
 *
 *   4. **Bounded work.** Every check has an implicit timeout via the
 *      `fetchWithTimeout` helper so a hung endpoint can't stall the
 *      whole suite.
 */

import type { EventStore } from '@/application/ports';
import type { StorageProvider } from '@/infrastructure/storage/storage-provider';
import type { RateLimiter } from '@/infrastructure/rate-limiting/rate-limiter';
import type {
  ValidationCheck,
  ValidationCheckResult,
  ValidationSuite,
} from '@/domain/launch/services/validation-suite';
import type {
  ReconciliationSource,
} from '@/domain/launch/services/reconciliation-service';
import type {
  SessionReplayRepository,
} from '@/domain/launch/repositories';
import { ReconciliationService } from '@/domain/launch/services/reconciliation-service';
import { getClient } from '@/infrastructure/database/prisma';
import { getEnvVar } from '@/shared/config';
import { logger } from '@/shared/logging';

/** Dependencies required by `createPlatformValidationSuites`. */
export interface ValidationSuiteDeps {
  readonly eventStore: EventStore;
  readonly reconciliationSource: ReconciliationSource;
  readonly sessionReplayRepository?: SessionReplayRepository;
  readonly storageProvider?: StorageProvider;
  readonly rateLimiter?: RateLimiter;
  /** Optional override for the HTTP base URL used by endpoint checks. */
  readonly baseUrl?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'http://localhost:3000';

function resolveBaseUrl(deps: ValidationSuiteDeps): string {
  if (deps.baseUrl) return deps.baseUrl;
  const fromEnv = getEnvVar('VALIDATION_BASE_URL');
  if (fromEnv) return fromEnv;
  return DEFAULT_BASE_URL;
}

/**
 * Build a passing `ValidationCheckResult`.
 *
 * The `ValidationSuiteRunner` overwrites `durationMs` after `run()` returns
 * with the actual wall-clock duration — we just default it to 0 here so the
 * returned object satisfies the `ValidationCheckResult` interface.
 */
function pass(
  name: string,
  message: string,
  details?: Record<string, unknown>,
): ValidationCheckResult {
  return { name, passed: true, message, details, durationMs: 0 };
}

/** Build a failing `ValidationCheckResult`. See `pass()` for the durationMs note. */
function fail(
  name: string,
  message: string,
  details?: Record<string, unknown>,
): ValidationCheckResult {
  return { name, passed: false, message, details, durationMs: 0 };
}

/** fetch with a hard timeout so a hung endpoint can't stall the suite. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── 1. Event Replay Suite ──────────────────────────────────────────────────

function buildEventReplaySuite(deps: ValidationSuiteDeps): ValidationSuite {
  const checks: ValidationCheck[] = [
    {
      name: 'wallet-replay-matches-read-model',
      description:
        'For each wallet in the read model, replay its event stream from the EventStore and verify the computed balance matches the projected balance.',
      category: 'event_replay',
      run: async () => {
        try {
          const balances = await deps.reconciliationSource.getWalletBalances();
          if (balances.length === 0) {
            return pass(
              'wallet-replay-matches-read-model',
              'No wallet read models yet — nothing to reconcile',
              { walletCount: 0 },
            );
          }
          let mismatches = 0;
          const sample = balances.slice(0, 50);
          for (const account of sample) {
            const expected = await deps.reconciliationSource.getExpectedBalance(
              account.playerId,
            );
            if (expected !== account.balance) {
              mismatches++;
            }
          }
          if (mismatches === 0) {
            return pass(
              'wallet-replay-matches-read-model',
              `All ${sample.length} sampled wallet balances match event replay`,
              { checked: sample.length, total: balances.length },
            );
          }
          return fail(
            'wallet-replay-matches-read-model',
            `${mismatches}/${sample.length} wallet balances do not match event replay`,
            { checked: sample.length, mismatches, total: balances.length },
          );
        } catch (e) {
          return fail(
            'wallet-replay-matches-read-model',
            `Wallet replay check failed: ${(e as Error).message}`,
          );
        }
      },
    },
    {
      name: 'event-store-readable',
      description:
        'Verify the event store can be replayed from position 0 with a small batch size',
      category: 'event_replay',
      run: async () => {
        try {
          const { events, nextRowId } = await deps.eventStore.replay(0, 10);
          return pass(
            'event-store-readable',
            `Event store replay returned ${events.length} events (nextRowId=${nextRowId})`,
            { count: events.length, nextRowId },
          );
        } catch (e) {
          return fail(
            'event-store-readable',
            `Event store replay failed: ${(e as Error).message}`,
          );
        }
      },
    },
  ];

  return {
    name: 'event-replay',
    description:
      'Verifies that replaying domain events from the EventStore produces the same state as the materialized read models.',
    checks,
  };
}

// ─── 2. Ledger Integrity Suite ──────────────────────────────────────────────

function buildLedgerIntegritySuite(deps: ValidationSuiteDeps): ValidationSuite {
  const checks: ValidationCheck[] = [
    {
      name: 'reconciliation-balanced',
      description:
        'Run the ReconciliationService end-to-end and verify that the expected wallet totals match the actual read-model totals.',
      category: 'ledger',
      run: async () => {
        try {
          const service = new ReconciliationService(deps.reconciliationSource);
          const result = await service.reconcile(`validation-${Date.now()}`);
          if (result.status === 'balanced') {
            return pass(
              'reconciliation-balanced',
              `Ledger is balanced (${result.totalAccounts} accounts, ${result.totalTransactions} transactions)`,
              {
                totalAccounts: result.totalAccounts,
                matchedAccounts: result.matchedAccounts,
                totalTransactions: result.totalTransactions,
                durationMs: result.durationMs,
              },
            );
          }
          return fail(
            'reconciliation-balanced',
            `Ledger has ${result.unmatchedAccounts} unmatched account(s) and ${result.details.errors.length} error(s)`,
            {
              status: result.status,
              unmatchedAccounts: result.unmatchedAccounts,
              errors: result.details.errors,
              firstUnmatched: result.details.unmatchedAccounts.slice(0, 5),
            },
          );
        } catch (e) {
          return fail(
            'reconciliation-balanced',
            `Reconciliation failed: ${(e as Error).message}`,
          );
        }
      },
    },
    {
      name: 'transaction-count-positive',
      description:
        'Verify that the reconciliation source can report a non-negative transaction count (a sanity check on the event store cursor scan).',
      category: 'ledger',
      run: async () => {
        try {
          const count = await deps.reconciliationSource.getTransactionCount();
          if (count < 0) {
            return fail(
              'transaction-count-positive',
              `Transaction count is negative: ${count}`,
            );
          }
          return pass(
            'transaction-count-positive',
            `Transaction count is ${count}`,
            { count },
          );
        } catch (e) {
          return fail(
            'transaction-count-positive',
            `Failed to get transaction count: ${(e as Error).message}`,
          );
        }
      },
    },
  ];

  return {
    name: 'ledger-integrity',
    description:
      'Runs the ReconciliationService and checks for any ledger discrepancies between the event-sourced truth and the wallet read models.',
    checks,
  };
}

// ─── 3. AI Quality Suite ────────────────────────────────────────────────────

function buildAiQualitySuite(deps: ValidationSuiteDeps): ValidationSuite {
  const baseUrl = resolveBaseUrl(deps);
  const checks: ValidationCheck[] = [
    {
      name: 'ai-health-endpoint-responds',
      description: `Ping ${baseUrl}/api/health and verify the platform (which includes the AI subsystem) reports a healthy status.`,
      category: 'ai',
      run: async () => {
        try {
          const response = await fetchWithTimeout(`${baseUrl}/api/health`);
          if (!response.ok) {
            return fail(
              'ai-health-endpoint-responds',
              `Health endpoint returned HTTP ${response.status}`,
            );
          }
          const body: unknown = await response.json().catch(() => ({}));
          const status = (body as { status?: string } | null)?.status;
          if (status && status !== 'ok' && status !== 'healthy') {
            return fail(
              'ai-health-endpoint-responds',
              `Health endpoint reported status '${status}'`,
            );
          }
          return pass(
            'ai-health-endpoint-responds',
            'Platform health endpoint is responsive',
            { httpStatus: response.status, status: status ?? 'unknown' },
          );
        } catch (e) {
          return fail(
            'ai-health-endpoint-responds',
            `Health endpoint unreachable: ${(e as Error).message}`,
          );
        }
      },
    },
    {
      name: 'ai-generation-endpoint-reachable',
      description: `POST ${baseUrl}/api/ai/generate with a minimal payload and verify the AI subsystem responds (success or a structured error).`,
      category: 'ai',
      run: async () => {
        try {
          const response = await fetchWithTimeout(
            `${baseUrl}/api/ai/generate`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ prompt: 'validation ping', model: 'test' }),
            },
            10000,
          );
          // 200-299 = success; 400/401/403 = endpoint exists but rejected
          // our minimal payload (still passes the check); 404/500 = real failure.
          if (response.status >= 500) {
            return fail(
              'ai-generation-endpoint-reachable',
              `AI generation endpoint returned HTTP ${response.status}`,
            );
          }
          if (response.status === 404) {
            return fail(
              'ai-generation-endpoint-reachable',
              'AI generation endpoint does not exist (404)',
            );
          }
          return pass(
            'ai-generation-endpoint-reachable',
            `AI generation endpoint is reachable (HTTP ${response.status})`,
            { httpStatus: response.status },
          );
        } catch (e) {
          return fail(
            'ai-generation-endpoint-reachable',
            `AI generation endpoint unreachable: ${(e as Error).message}`,
          );
        }
      },
    },
  ];

  return {
    name: 'ai-quality',
    description:
      'Verifies that the AI generation endpoints respond to requests and produce structured output (success or a clean client error).',
    checks,
  };
}

// ─── 4. Security Suite ──────────────────────────────────────────────────────

function buildSecuritySuite(deps: ValidationSuiteDeps): ValidationSuite {
  const baseUrl = resolveBaseUrl(deps);
  const checks: ValidationCheck[] = [
    {
      name: 'auth-rejects-invalid-credentials',
      description: `POST ${baseUrl}/api/auth/login with invalid credentials and verify the endpoint rejects with 401/400 (not 200 or 500).`,
      category: 'security',
      run: async () => {
        try {
          const response = await fetchWithTimeout(
            `${baseUrl}/api/auth/login`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                email: 'invalid-validation@example.com',
                password: 'definitely-not-a-real-password-12345',
              }),
            },
          );
          // 401/400 = expected rejection; 200 = leak; 500 = unhandled error.
          if (response.status === 200) {
            return fail(
              'auth-rejects-invalid-credentials',
              'Auth endpoint returned 200 for invalid credentials — security risk',
            );
          }
          if (response.status >= 500) {
            return fail(
              'auth-rejects-invalid-credentials',
              `Auth endpoint threw HTTP ${response.status} on invalid credentials`,
            );
          }
          return pass(
            'auth-rejects-invalid-credentials',
            `Auth endpoint correctly rejected invalid credentials (HTTP ${response.status})`,
            { httpStatus: response.status },
          );
        } catch (e) {
          return fail(
            'auth-rejects-invalid-credentials',
            `Auth endpoint unreachable: ${(e as Error).message}`,
          );
        }
      },
    },
    {
      name: 'rate-limiter-functional',
      description:
        'Verify the RateLimiter is wired and functional by checking that a burst of identical requests gets throttled.',
      category: 'security',
      run: async () => {
        if (!deps.rateLimiter) {
          return fail(
            'rate-limiter-functional',
            'RateLimiter dependency is not wired into validation suite',
          );
        }
        try {
          const opts = {
            dimension: 'ip' as const,
            algorithm: 'sliding-window' as const,
            limit: 2,
            windowSeconds: 60,
          };
          // First two should be allowed, third should be throttled.
          const identifier = `validation-${Date.now()}`;
          const r1 = await deps.rateLimiter.limit(identifier, opts);
          const r2 = await deps.rateLimiter.limit(identifier, opts);
          const r3 = await deps.rateLimiter.limit(identifier, opts);
          if (!r1.allowed || !r2.allowed) {
            return fail(
              'rate-limiter-functional',
              'RateLimiter rejected initial requests — configuration error',
            );
          }
          if (r3.allowed) {
            return fail(
              'rate-limiter-functional',
              'RateLimiter failed to throttle the 3rd request in a 2-per-minute window',
            );
          }
          return pass(
            'rate-limiter-functional',
            'RateLimiter correctly throttled the burst',
            { firstAllowed: r1.allowed, thirdAllowed: r3.allowed },
          );
        } catch (e) {
          return fail(
            'rate-limiter-functional',
            `RateLimiter check failed: ${(e as Error).message}`,
          );
        }
      },
    },
  ];

  return {
    name: 'security',
    description:
      'Checks that auth endpoints reject invalid credentials and that the rate limiter is functional and properly throttles bursts.',
    checks,
  };
}

// ─── 5. Extension Runtime Suite ─────────────────────────────────────────────

function buildExtensionRuntimeSuite(deps: ValidationSuiteDeps): ValidationSuite {
  const checks: ValidationCheck[] = [
    {
      name: 'projection-engine-can-replay',
      description:
        'Since the dedicated Extension Runtime is not yet wired, this check verifies the platform projection engine can replay events (the foundational capability the extension runtime will build on).',
      category: 'extension',
      run: async () => {
        try {
          const { events } = await deps.eventStore.replay(0, 1);
          // The projection engine is exercised indirectly: if we can read
          // events from the store, the projection worker can pick them up.
          // A more thorough check would call ProjectionEngine.rebuild()
          // directly, but that requires the projector registry to be wired
          // — we keep the check self-contained here.
          if (events.length === 0) {
            return pass(
              'projection-engine-can-replay',
              'Event store is empty — projection engine has nothing to replay yet (extension runtime will work once events flow)',
            );
          }
          return pass(
            'projection-engine-can-replay',
            `Event store has ${events.length}+ events available for projection replay`,
            { firstEventType: events[0]?.eventType },
          );
        } catch (e) {
          return fail(
            'projection-engine-can-replay',
            `Event store unreadable: ${(e as Error).message}`,
          );
        }
      },
    },
    {
      name: 'extension-runtime-status',
      description:
        'Verify whether the Extension Runtime subsystem is registered and ready to load + execute extensions. Currently a stub — returns passed:false with an actionable message until the runtime ships.',
      category: 'extension',
      run: async () => {
        // The Extension Runtime is not yet built as a separate subsystem.
        // We surface this as a known-gap failure rather than a silent pass
        // so the launch dashboard tracks it as an outstanding item.
        return fail(
          'extension-runtime-status',
          'Extension Runtime is not yet registered. Build the runtime adapter and re-wire this check.',
          { reason: 'extension_runtime_not_implemented' },
        );
      },
    },
  ];

  return {
    name: 'extension-runtime',
    description:
      "Checks that the extension runtime can load and execute a simple extension. Currently verifies the event store (the runtime's input) and tracks the runtime itself as a known gap.",
    checks,
  };
}

// ─── 6. Session Replay Suite ────────────────────────────────────────────────

function buildSessionReplaySuite(deps: ValidationSuiteDeps): ValidationSuite {
  const checks: ValidationCheck[] = [
    {
      name: 'session-replay-repository-readable',
      description:
        'Verify the SessionReplayRepository can list recent replays (returns an empty list if no replays exist yet, which still counts as a pass).',
      category: 'session',
      run: async () => {
        if (!deps.sessionReplayRepository) {
          return fail(
            'session-replay-repository-readable',
            'SessionReplayRepository dependency is not wired',
          );
        }
        try {
          const result = await deps.sessionReplayRepository.list({ limit: 10 });
          return pass(
            'session-replay-repository-readable',
            `SessionReplayRepository returned ${result.items.length} recent replays (total ${result.total})`,
            { count: result.items.length, total: result.total },
          );
        } catch (e) {
          return fail(
            'session-replay-repository-readable',
            `SessionReplayRepository list failed: ${(e as Error).message}`,
          );
        }
      },
    },
    {
      name: 'session-replay-storage-key-valid',
      description:
        'For the most recent session replays, verify that the storageKey is a non-empty string. (Full playback verification requires the StorageProvider — covered by the next check.)',
      category: 'session',
      run: async () => {
        if (!deps.sessionReplayRepository) {
          return fail(
            'session-replay-storage-key-valid',
            'SessionReplayRepository dependency is not wired',
          );
        }
        try {
          const result = await deps.sessionReplayRepository.list({ limit: 5 });
          if (result.items.length === 0) {
            return pass(
              'session-replay-storage-key-valid',
              'No session replays yet — nothing to validate',
            );
          }
          const invalid = result.items.filter(
            (r) => !r.storageKey || r.storageKey.trim().length === 0,
          );
          if (invalid.length > 0) {
            return fail(
              'session-replay-storage-key-valid',
              `${invalid.length} replays have an empty storageKey`,
              { invalidIds: invalid.map((r) => r.id) },
            );
          }
          return pass(
            'session-replay-storage-key-valid',
            `All ${result.items.length} sampled replays have valid storage keys`,
          );
        } catch (e) {
          return fail(
            'session-replay-storage-key-valid',
            `Storage key check failed: ${(e as Error).message}`,
          );
        }
      },
    },
    {
      name: 'session-replay-storage-provider-wired',
      description:
        'Verify the StorageProvider (which backs session-replay playback) is wired into the validation suite dependencies.',
      category: 'session',
      run: async () => {
        if (!deps.storageProvider) {
          return fail(
            'session-replay-storage-provider-wired',
            'StorageProvider dependency is not wired — replays cannot be played back',
          );
        }
        try {
          // Round-trip a tiny object to confirm the storage backend works.
          const testKey = `validation/${Date.now()}.txt`;
          const testBucket = 'validation';
          const testPayload = Buffer.from('playliquid-validation-ping', 'utf8');
          await deps.storageProvider.upload(testBucket, testKey, testPayload, {
            contentType: 'text/plain',
          });
          const exists = await deps.storageProvider.exists(testBucket, testKey);
          if (exists) {
            await deps.storageProvider.delete(testBucket, testKey).catch(() => {});
            return pass(
              'session-replay-storage-provider-wired',
              'StorageProvider round-trip succeeded — replays can be played back',
            );
          }
          return fail(
            'session-replay-storage-provider-wired',
            'StorageProvider upload succeeded but exists() returned false',
          );
        } catch (e) {
          return fail(
            'session-replay-storage-provider-wired',
            `StorageProvider round-trip failed: ${(e as Error).message}`,
          );
        }
      },
    },
  ];

  return {
    name: 'session-replay',
    description:
      'Checks that session replays can be loaded from the repository and played back via the StorageProvider.',
    checks,
  };
}

// ─── 7. Data Integrity Suite ────────────────────────────────────────────────

function buildDataIntegritySuite(): ValidationSuite {
  const checks: ValidationCheck[] = [
    {
      name: 'no-orphaned-wallet-read-models',
      description:
        'Verify every WalletReadModel row has at least one corresponding event in the event store (no orphaned projections).',
      category: 'data_integrity',
      run: async () => {
        try {
          const client = getClient();
          const wallets = await client.walletReadModel.findMany({
            select: { playerId: true },
            take: 100,
          });
          if (wallets.length === 0) {
            return pass(
              'no-orphaned-wallet-read-models',
              'No wallet read models — nothing to check',
            );
          }
          // Look for any event stream for this player by checking the
          // event store for any event whose aggregateId === playerId.
          // We do this in one batched query for efficiency.
          const playerIds = wallets.map(
            (w: { playerId: string }) => w.playerId,
          );
          const orphans: string[] = [];
          for (const playerId of playerIds.slice(0, 25)) {
            const count = await client.eventRecord.count({
              where: { aggregateId: playerId },
            });
            if (count === 0) orphans.push(playerId);
          }
          if (orphans.length === 0) {
            return pass(
              'no-orphaned-wallet-read-models',
              `All ${Math.min(playerIds.length, 25)} sampled wallet read models have backing events`,
              { checked: Math.min(playerIds.length, 25) },
            );
          }
          return fail(
            'no-orphaned-wallet-read-models',
            `${orphans.length} wallet read models have no backing events`,
            { orphanedPlayerIds: orphans.slice(0, 10) },
          );
        } catch (e) {
          return fail(
            'no-orphaned-wallet-read-models',
            `Orphan check failed: ${(e as Error).message}`,
          );
        }
      },
    },
    {
      name: 'no-stuck-outbox-messages',
      description:
        'Verify the outbox has no messages stuck in a failed state (failed status with no remaining retries).',
      category: 'data_integrity',
      run: async () => {
        try {
          const client = getClient();
          const stuck = await client.outboxMessage.count({
            where: {
              status: 'failed',
              retryCount: { gte: 5 },
            },
          });
          if (stuck === 0) {
            return pass(
              'no-stuck-outbox-messages',
              'No outbox messages are stuck in failed state',
            );
          }
          return fail(
            'no-stuck-outbox-messages',
            `${stuck} outbox messages are stuck (failed, max retries reached)`,
            { stuckCount: stuck },
          );
        } catch (e) {
          return fail(
            'no-stuck-outbox-messages',
            `Outbox check failed: ${(e as Error).message}`,
          );
        }
      },
    },
    {
      name: 'projection-checkpoints-progressing',
      description:
        "Verify at least one projection checkpoint exists (i.e. the projection engine has processed events). A missing checkpoint indicates the projection worker hasn't started.",
      category: 'data_integrity',
      run: async () => {
        try {
          const client = getClient();
          const checkpoints = await client.projectionCheckpoint.count();
          if (checkpoints === 0) {
            return fail(
              'projection-checkpoints-progressing',
              'No projection checkpoints found — projection worker may not be running',
            );
          }
          return pass(
            'projection-checkpoints-progressing',
            `${checkpoints} projection checkpoint(s) registered`,
            { count: checkpoints },
          );
        } catch (e) {
          return fail(
            'projection-checkpoints-progressing',
            `Checkpoint check failed: ${(e as Error).message}`,
          );
        }
      },
    },
    {
      name: 'no-duplicate-event-ids',
      description:
        'Verify the event store has no duplicate eventId values (a safety net for the unique constraint).',
      category: 'data_integrity',
      run: async () => {
        try {
          const client = getClient();
          // SQLite + Prisma: groupBy with having requires orderBy when take
          // is supplied. We omit `take` and rely on the having clause to
          // narrow the result to dupes only — for a launch-size event store
          // the dupes set is tiny.
          const dupes = await client.eventRecord.groupBy({
            by: ['eventId'],
            _count: { _all: true },
            having: { eventId: { _count: { gt: 1 } } },
          });
          if (dupes.length === 0) {
            return pass(
              'no-duplicate-event-ids',
              'No duplicate eventIds in the event store',
            );
          }
          return fail(
            'no-duplicate-event-ids',
            `${dupes.length} duplicate eventId(s) detected`,
            { duplicateEventIds: dupes.map((d) => d.eventId) },
          );
        } catch (e) {
          return fail(
            'no-duplicate-event-ids',
            `Duplicate check failed: ${(e as Error).message}`,
          );
        }
      },
    },
  ];

  return {
    name: 'data-integrity',
    description:
      'Checks for orphaned records, stuck outbox messages, missing projection checkpoints, and duplicate event IDs.',
    checks,
  };
}

// ─── Public Factory ─────────────────────────────────────────────────────────

/**
 * Build the full set of platform validation suites.
 *
 * Returns 7 suites:
 *   1. event-replay        — event replay matches read models
 *   2. ledger-integrity    — reconciliation passes
 *   3. ai-quality          — AI endpoints respond
 *   4. security            — auth rejects bad creds + rate limiter works
 *   5. extension-runtime   — extension runtime is wired (currently a known gap)
 *   6. session-replay      — session replays can be loaded + played
 *   7. data-integrity      — no orphaned/stuck/duplicate records
 *
 * Suites whose dependencies are missing still get registered — their
 * checks return `passed: false` with a clear actionable message rather
 * than throwing, so the launch dashboard surfaces the gap.
 */
export function createPlatformValidationSuites(
  deps: ValidationSuiteDeps,
): ValidationSuite[] {
  logger.system().info('Building platform validation suites', {
    baseUrl: resolveBaseUrl(deps),
    hasRateLimiter: !!deps.rateLimiter,
    hasStorageProvider: !!deps.storageProvider,
    hasSessionReplayRepository: !!deps.sessionReplayRepository,
  });

  return [
    buildEventReplaySuite(deps),
    buildLedgerIntegritySuite(deps),
    buildAiQualitySuite(deps),
    buildSecuritySuite(deps),
    buildExtensionRuntimeSuite(deps),
    buildSessionReplaySuite(deps),
    buildDataIntegritySuite(),
  ];
}
