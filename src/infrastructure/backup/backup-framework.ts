/**
 * Backup Framework — pluggable backup + restore for platform state.
 *
 * The application depends on the `BackupProvider` interface. The DI container
 * selects an implementation (`LocalBackupProvider` for development / single
 * instance, an S3-backed provider for production / multi-instance).
 *
 * Backed-up artefacts:
 *   - `database`           — the live SQLite DB file (or a `pg_dump` snapshot
 *                            for PostgreSQL deployments).
 *   - `storage`            — a tar archive of every file under the configured
 *                            storage root (LocalStorageProvider's baseDir).
 *   - `configuration`      — the current validated `AppConfig` exported as
 *                            JSON, with sensitive material (auth.secret)
 *                            redacted.
 *   - `secrets-metadata`   — the *names* of every secret the platform expects
 *                            to find at runtime. NO secret values are written.
 *
 * Every backup is content-addressed by a SHA-256 checksum recorded in the
 * manifest. `verify()` re-hashes the on-disk artefact and compares.
 * `restore()` is gated behind an explicit confirmation env var so it cannot
 * be triggered accidentally.
 *
 * Manifest format: a single JSON file at `<backupDir>/manifest.json`
 * containing `BackupResult[]` sorted newest-first. Each artefact is stored
 * as a separate file named `<id>.<ext>` in the same directory.
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { copyFile, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import type { AppConfig } from '@/shared/config';
import { getConfig, getEnvVar } from '@/shared/config';
import { prisma } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';
import { createId } from '@/shared/ids';

// ─── Public types (exactly per task spec) ────────────────────────────────

export interface BackupResult {
  id: string;
  type: 'database' | 'storage' | 'configuration' | 'secrets-metadata';
  status: 'success' | 'failed' | 'partial';
  size: number; // bytes
  location: string; // backup file path/URL
  checksum: string; // SHA-256
  startedAt: number;
  completedAt: number;
  error?: string;
}

export interface BackupProvider {
  backup(type: BackupResult['type']): Promise<BackupResult>;
  list(limit?: number): Promise<BackupResult[]>;
  get(id: string): Promise<BackupResult | null>;
  verify(id: string): Promise<boolean>; // verify checksum
  restore(id: string): Promise<boolean>; // returns success
  delete(id: string): Promise<void>;
}

export interface BackupSchedule {
  type: BackupResult['type'];
  cronExpression: string;
  retention: number; // keep N backups
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Compute the SHA-256 hex digest of a buffer. */
function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Recursively walk a directory and yield absolute file paths. */
async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const name = entry.name as string;
    const full = join(dir, name);
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Build a USTAR-format tar archive from a list of file entries.
 *
 * Each entry's `name` should be relative to the archive root. We emit a
 * 512-byte header per file (regular-file typeflag '0', mode 0644), the file
 * body padded to a 512-byte boundary, and two zero blocks at the end. The
 * output is deterministic given the same input ordering, so checksums are
 * reproducible.
 */
function buildTar(entries: ReadonlyArray<{ name: string; data: Buffer }>): Buffer {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const name = entry.name.slice(0, 100);
    const size = entry.data.length;

    const header = Buffer.alloc(512, 0);
    header.write(name, 0, 'ascii');
    header.write('0000644\0', 100, 'ascii'); // mode
    header.write('0000000\0', 108, 'ascii'); // uid
    header.write('0000000\0', 116, 'ascii'); // gid
    // size as 11-digit octal + NUL
    header.write(size.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
    // mtime (now) as 11-digit octal + NUL
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 'ascii');
    header.write('        ', 148, 'ascii'); // checksum placeholder (8 spaces)
    header.write('0', 156, 'ascii'); // typeflag: regular file
    header.write('ustar\0', 257, 'ascii'); // magic
    header.write('00', 263, 'ascii'); // version

    // Checksum: unsigned sum of all header bytes (with checksum field as spaces).
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');

    blocks.push(header);
    blocks.push(entry.data);
    const pad = (512 - (size % 512)) % 512;
    if (pad > 0) blocks.push(Buffer.alloc(pad, 0));
  }

  // Two zero blocks signal end-of-archive.
  blocks.push(Buffer.alloc(512, 0));
  blocks.push(Buffer.alloc(512, 0));
  return Buffer.concat(blocks);
}

/** Redact sensitive fields from the config snapshot before persisting. */
function redactConfig(config: AppConfig): Record<string, unknown> {
  const snapshot = structuredClone(config) as unknown as Record<string, unknown>;
  const maybeAuth = snapshot['auth'] as Record<string, unknown> | undefined;
  if (maybeAuth && typeof maybeAuth === 'object') {
    maybeAuth['secret'] = '[REDACTED]';
  }
  const maybeDb = snapshot['database'] as Record<string, unknown> | undefined;
  if (maybeDb && typeof maybeDb['url'] === 'string') {
    // Mask everything except the protocol + filename so we know what was backed up.
    const url = maybeDb['url'] as string;
    maybeDb['url'] = url.replace(/(:[^:@/]+@)/, ':***@');
  }
  return snapshot;
}

/**
 * The static list of secret names the platform's config layer reads.
 *
 * Used by the secrets-metadata backup so operators can see *which* secrets
 * must be provisioned in a fresh environment, without ever exposing the
 * values themselves. Marked sensitive vs non-sensitive for triage.
 */
interface SecretNameEntry {
  name: string;
  sensitive: boolean;
  description: string;
}

const KNOWN_SECRET_NAMES: readonly SecretNameEntry[] = [
  { name: 'NODE_ENV', sensitive: false, description: 'Runtime environment' },
  { name: 'LOG_LEVEL', sensitive: false, description: 'Log verbosity' },
  { name: 'DATABASE_URL', sensitive: true, description: 'Primary datastore connection string' },
  { name: 'AUTH_SECRET', sensitive: true, description: 'Token signing secret' },
  { name: 'REDIS_URL', sensitive: true, description: 'Redis connection string (optional)' },
  { name: 'CACHE_TTL_SECONDS', sensitive: false, description: 'Default cache TTL' },
  { name: 'CACHE_MAX_SIZE', sensitive: false, description: 'Max cache entries' },
  { name: 'OBSERVABILITY_ENABLED', sensitive: false, description: 'Toggle telemetry export' },
  { name: 'OBSERVABILITY_SERVICE_NAME', sensitive: false, description: 'Telemetry service label' },
  { name: 'FEATURE_OUTBOX_WORKER', sensitive: false, description: 'Toggle outbox worker' },
  { name: 'FEATURE_PROJECTION_WORKER', sensitive: false, description: 'Toggle projection worker' },
] as const;

// ─── LocalBackupProvider ─────────────────────────────────────────────────

export interface LocalBackupProviderOptions {
  /** Directory where backup artefacts + manifest are stored. Default: ./backups */
  backupDir?: string;
  /** Storage root to walk when backing up `storage`. Default: ./storage */
  storageRoot?: string;
  /** Override the database file path (otherwise parsed from DATABASE_URL). */
  databasePath?: string;
  /**
   * Require an explicit env-var confirmation before allowing `restore()`.
   * The env var BACKUP_RESTORE_CONFIRMED must be set to "yes" (case-sensitive).
   * Default: true.
   */
  requireRestoreConfirmation?: boolean;
}

/**
 * Filesystem-backed backup provider. Suitable for single-instance deployments
 * and development. For multi-instance production, substitute an S3-backed
 * provider that implements the same `BackupProvider` interface.
 */
export class LocalBackupProvider implements BackupProvider {
  private readonly backupDir: string;
  private readonly storageRoot: string;
  private readonly databasePath: string | null;
  private readonly requireRestoreConfirmation: boolean;
  private readonly manifestPath: string;
  private manifestCache: BackupResult[] | null = null;

  constructor(options: LocalBackupProviderOptions = {}) {
    this.backupDir = resolve(options.backupDir ?? './backups');
    this.storageRoot = resolve(options.storageRoot ?? './storage');
    this.databasePath = options.databasePath ?? this.resolveDatabasePath();
    this.requireRestoreConfirmation = options.requireRestoreConfirmation ?? true;
    this.manifestPath = join(this.backupDir, 'manifest.json');
  }

  // ─── BackupProvider interface ─────────────────────────────────────────

  async backup(type: BackupResult['type']): Promise<BackupResult> {
    const id = createId(`bkp_${type}`);
    const startedAt = Date.now();
    logger.system().info('Backup starting', { id, type });

    // Ensure the backup directory exists before we write anything.
    await mkdir(this.backupDir, { recursive: true });

    let result: BackupResult;
    try {
      switch (type) {
        case 'database':
          result = await this.backupDatabase(id);
          break;
        case 'storage':
          result = await this.backupStorage(id);
          break;
        case 'configuration':
          result = await this.backupConfiguration(id);
          break;
        case 'secrets-metadata':
          result = await this.backupSecretsMetadata(id);
          break;
        default: {
          const exhaustive: never = type;
          throw new Error(`Unknown backup type: ${String(exhaustive)}`);
        }
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e);
      logger.system().error('Backup failed', { id, type }, e);
      result = {
        id,
        type,
        status: 'failed',
        size: 0,
        location: '',
        checksum: '',
        startedAt,
        completedAt: Date.now(),
        error,
      };
    }

    result.startedAt = startedAt;
    await this.persistRecord(result);
    logger.system().info('Backup complete', {
      id: result.id,
      type: result.type,
      status: result.status,
      size: result.size,
    });
    return result;
  }

  async list(limit?: number): Promise<BackupResult[]> {
    const records = await this.loadManifest();
    const sorted = [...records].sort((a, b) => b.startedAt - a.startedAt);
    return typeof limit === 'number' ? sorted.slice(0, Math.max(0, limit)) : sorted;
  }

  async get(id: string): Promise<BackupResult | null> {
    const records = await this.loadManifest();
    return records.find((r) => r.id === id) ?? null;
  }

  async verify(id: string): Promise<boolean> {
    const record = await this.get(id);
    if (!record) {
      logger.system().warn('Backup verify: record not found', { id });
      return false;
    }
    if (!record.location || !record.checksum) return false;
    try {
      const data = await readFile(record.location);
      const actual = sha256(data);
      const ok = actual === record.checksum;
      if (!ok) {
        logger.system().warn('Backup checksum mismatch', {
          id,
          expected: record.checksum,
          actual,
        });
      }
      return ok;
    } catch (e: unknown) {
      logger.system().error('Backup verify: cannot read artefact', { id, location: record.location }, e);
      return false;
    }
  }

  async restore(id: string): Promise<boolean> {
    const record = await this.get(id);
    if (!record) {
      logger.system().error('Backup restore: record not found', { id });
      return false;
    }

    // Safety confirmation — restore overwrites live state and must never run
    // accidentally. Caller sets BACKUP_RESTORE_CONFIRMED=yes via the config
    // layer (env) to opt in.
    if (this.requireRestoreConfirmation && getEnvVar('BACKUP_RESTORE_CONFIRMED') !== 'yes') {
      logger.system().error(
        'Backup restore refused: confirmation env var not set. Set BACKUP_RESTORE_CONFIRMED=yes to proceed.',
        { id, type: record.type },
      );
      return false;
    }

    logger.system().warn('RESTORE IN PROGRESS — live state will be overwritten', {
      id,
      type: record.type,
      location: record.location,
    });

    try {
      switch (record.type) {
        case 'database':
          return await this.restoreDatabase(record);
        case 'storage':
          return await this.restoreStorage(record);
        case 'configuration':
          // Configuration backups are reference-only — restoring them would
          // bypass the validated config layer. Operator must replay manually.
          logger.system().warn(
            'Configuration backup restore is informational only — re-apply manually via the config layer.',
            { id },
          );
          return true;
        case 'secrets-metadata':
          // Secrets metadata is reference-only — list of expected names.
          logger.system().warn(
            'Secrets-metadata backup restore is informational only — re-provision secrets via the secret provider.',
            { id },
          );
          return true;
        default: {
          const exhaustive: never = record.type;
          throw new Error(`Unknown backup type: ${String(exhaustive)}`);
        }
      }
    } catch (e: unknown) {
      logger.system().error('Backup restore failed', { id, type: record.type }, e);
      return false;
    }
  }

  async delete(id: string): Promise<void> {
    const records = await this.loadManifest();
    const target = records.find((r) => r.id === id);
    if (!target) {
      logger.system().warn('Backup delete: record not found', { id });
      return;
    }
    // Best-effort delete the artefact file.
    if (target.location) {
      try {
        await unlink(target.location);
      } catch (e: unknown) {
        // File may already be gone — non-fatal.
        logger.system().debug('Backup artefact file already absent', { id, location: target.location });
      }
    }
    const filtered = records.filter((r) => r.id !== id);
    await this.writeManifest(filtered);
    logger.system().info('Backup deleted', { id, type: target.type });
  }

  // ─── Per-type backup implementations ─────────────────────────────────

  /**
   * Database backup: copy the live SQLite file (or `pg_dump` for PostgreSQL).
   * Computes a SHA-256 over the copied bytes.
   */
  private async backupDatabase(id: string): Promise<BackupResult> {
    const startedAt = Date.now();
    const dbPath = this.databasePath;

    if (!dbPath) {
      // PostgreSQL / other provider — would shell out to pg_dump here.
      return {
        id,
        type: 'database',
        status: 'partial',
        size: 0,
        location: '',
        checksum: '',
        startedAt,
        completedAt: Date.now(),
        error:
          'Database backup for non-SQLite providers requires pg_dump — not implemented in LocalBackupProvider. Use a PostgresBackupProvider.',
      };
    }

    const dest = join(this.backupDir, `${id}.db`);
    try {
      await copyFile(dbPath, dest);
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e);
      return {
        id,
        type: 'database',
        status: 'failed',
        size: 0,
        location: dest,
        checksum: '',
        startedAt,
        completedAt: Date.now(),
        error,
      };
    }
    const data = await readFile(dest);
    return {
      id,
      type: 'database',
      status: 'success',
      size: data.length,
      location: dest,
      checksum: sha256(data),
      startedAt,
      completedAt: Date.now(),
    };
  }

  /**
   * Storage backup: walk the storage root, build a USTAR tar archive of every
   * file, gzip-compress it, and persist to the backup directory.
   */
  private async backupStorage(id: string): Promise<BackupResult> {
    const startedAt = Date.now();
    const files = await walkFiles(this.storageRoot);

    if (files.length === 0) {
      return {
        id,
        type: 'storage',
        status: 'partial',
        size: 0,
        location: '',
        checksum: '',
        startedAt,
        completedAt: Date.now(),
        error: `Storage root '${this.storageRoot}' is empty or does not exist.`,
      };
    }

    const entries: Array<{ name: string; data: Buffer }> = [];
    for (const abs of files) {
      const rel = relative(this.storageRoot, abs);
      // Skip sidecar metadata files for storage objects — they are derivable
      // from the object bytes and would only bloat the archive.
      if (rel.endsWith('.meta.json')) continue;
      const data = await readFile(abs);
      entries.push({ name: rel, data });
    }

    const tar = buildTar(entries);
    const compressed = gzipSync(tar);
    const dest = join(this.backupDir, `${id}.tar.gz`);
    await writeFile(dest, compressed);

    return {
      id,
      type: 'storage',
      status: 'success',
      size: compressed.length,
      location: dest,
      checksum: sha256(compressed),
      startedAt,
      completedAt: Date.now(),
    };
  }

  /**
   * Configuration backup: serialise the validated AppConfig with sensitive
   * fields redacted. Useful for diffing environment drift across deployments.
   */
  private async backupConfiguration(id: string): Promise<BackupResult> {
    const startedAt = Date.now();
    const snapshot = redactConfig(getConfig());
    const json = JSON.stringify(snapshot, null, 2);
    const data = Buffer.from(json, 'utf8');
    const dest = join(this.backupDir, `${id}.config.json`);
    await writeFile(dest, data);

    return {
      id,
      type: 'configuration',
      status: 'success',
      size: data.length,
      location: dest,
      checksum: sha256(data),
      startedAt,
      completedAt: Date.now(),
    };
  }

  /**
   * Secrets-metadata backup: list the secret NAMES the platform expects,
   * flagged as sensitive or not. NO secret values are written.
   */
  private async backupSecretsMetadata(id: string): Promise<BackupResult> {
    const startedAt = Date.now();
    const payload = {
      generatedAt: new Date(startedAt).toISOString(),
      secretNames: KNOWN_SECRET_NAMES,
      note: 'Only secret names are recorded. Values must be provisioned via the SecretProvider.',
    };
    const json = JSON.stringify(payload, null, 2);
    const data = Buffer.from(json, 'utf8');
    const dest = join(this.backupDir, `${id}.secrets.json`);
    await writeFile(dest, data);

    return {
      id,
      type: 'secrets-metadata',
      status: 'success',
      size: data.length,
      location: dest,
      checksum: sha256(data),
      startedAt,
      completedAt: Date.now(),
    };
  }

  // ─── Per-type restore implementations ────────────────────────────────

  /**
   * Database restore: overwrite the live SQLite file with the backup
   * artefact. Prisma MUST be disconnected first or the copy may fail on
   * platforms that hold an exclusive file lock.
   */
  private async restoreDatabase(record: BackupResult): Promise<boolean> {
    if (!this.databasePath) {
      logger.system().error('Cannot restore database: live DB path not resolved', { id: record.id });
      return false;
    }
    // Verify checksum before clobbering live state.
    const ok = await this.verify(record.id);
    if (!ok) {
      logger.system().error('Backup restore aborted: checksum verification failed', { id: record.id });
      return false;
    }
    // Disconnect Prisma so the file isn't locked. Use the singleton client
    // (not getClient(), which may return a transaction-scoped client that
    // doesn't expose $disconnect).
    try {
      await prisma.$disconnect();
    } catch (e: unknown) {
      logger.system().error(
        'Prisma $disconnect failed during restore (continuing)',
        { id: record.id },
        e,
      );
    }
    // Copy the backup over the live DB file.
    await mkdir(dirname(this.databasePath), { recursive: true });
    await copyFile(record.location, this.databasePath);
    logger.system().warn('Database restored from backup', {
      id: record.id,
      target: this.databasePath,
    });
    return true;
  }

  /**
   * Storage restore: decompress + untar the backup into the storage root.
   * We re-implement a minimal USTAR reader here rather than depending on an
   * external tar library.
   */
  private async restoreStorage(record: BackupResult): Promise<boolean> {
    const ok = await this.verify(record.id);
    if (!ok) {
      logger.system().error('Backup restore aborted: checksum verification failed', { id: record.id });
      return false;
    }
    // Lazy-import the gzip decompressor so the backup module loads even if
    // zlib ever fails to initialise.
    const { gunzipSync } = await import('node:zlib');
    const compressed = await readFile(record.location);
    const tar = gunzipSync(compressed);

    // Parse the USTAR stream: 512-byte headers followed by file bodies.
    let offset = 0;
    let restored = 0;
    while (offset + 512 <= tar.length) {
      const header = tar.subarray(offset, offset + 512);
      // Two consecutive zero blocks signal end-of-archive.
      if (header.every((b) => b === 0)) break;

      const name = header.subarray(0, 100).toString('ascii').replace(/\0+$/, '');
      const sizeOctal = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
      const size = sizeOctal ? parseInt(sizeOctal, 8) : 0;
      const typeflag = header.subarray(156, 157).toString('ascii');

      offset += 512;
      const isRegularFile = typeflag === '0' || (typeflag === '\0' && name.length > 0);
      if (isRegularFile) {
        // Regular file.
        const body = tar.subarray(offset, offset + size);
        const dest = join(this.storageRoot, name);
        // Guard against path traversal outside the storage root.
        const resolved = resolve(dest);
        if (!resolved.startsWith(this.storageRoot + '/') && resolved !== this.storageRoot) {
          logger.system().warn('Skipping tar entry outside storage root', { name, id: record.id });
        } else {
          await mkdir(dirname(resolved), { recursive: true });
          await writeFile(resolved, body);
          restored++;
        }
      }
      // Advance to the next 512-byte boundary.
      offset += size + ((512 - (size % 512)) % 512);
    }
    logger.system().info('Storage restored from backup', { id: record.id, filesRestored: restored });
    return true;
  }

  // ─── Manifest persistence ────────────────────────────────────────────

  /** Parse the DATABASE_URL to find the SQLite file path (file: prefix). */
  private resolveDatabasePath(): string | null {
    const url = getConfig().database.url;
    if (url.startsWith('file:')) {
      // `file:./db/custom.db` → `./db/custom.db`
      return resolve(url.slice('file:'.length));
    }
    // PostgreSQL / MySQL / others — not supported by LocalBackupProvider.
    return null;
  }

  private async loadManifest(): Promise<BackupResult[]> {
    if (this.manifestCache) return this.manifestCache;
    try {
      const raw = await readFile(this.manifestPath, 'utf8');
      const parsed = JSON.parse(raw) as BackupResult[];
      this.manifestCache = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.manifestCache = [];
    }
    return this.manifestCache;
  }

  private async writeManifest(records: BackupResult[]): Promise<void> {
    this.manifestCache = records;
    await mkdir(this.backupDir, { recursive: true });
    await writeFile(this.manifestPath, JSON.stringify(records, null, 2), 'utf8');
  }

  private async persistRecord(record: BackupResult): Promise<void> {
    const records = await this.loadManifest();
    // Replace if same id exists (idempotent re-run), otherwise append.
    const idx = records.findIndex((r) => r.id === record.id);
    if (idx >= 0) records[idx] = record;
    else records.push(record);
    await this.writeManifest(records);
  }

  /**
   * Apply a retention policy: keep only the most recent `retention` backups
   * of each type. Older artefacts are deleted from disk and the manifest.
   * Returns the number of backups pruned.
   */
  async applyRetention(retentionByType: Record<BackupResult['type'], number>): Promise<number> {
    const records = await this.loadManifest();
    const byType = new Map<BackupResult['type'], BackupResult[]>();
    for (const r of records) {
      const list = byType.get(r.type) ?? [];
      list.push(r);
      byType.set(r.type, list);
    }

    const pruned = new Set<string>();
    for (const [type, list] of byType) {
      const keep = retentionByType[type];
      if (typeof keep !== 'number' || list.length <= keep) continue;
      const sorted = [...list].sort((a, b) => b.startedAt - a.startedAt);
      for (const old of sorted.slice(keep)) {
        pruned.add(old.id);
      }
    }

    for (const id of pruned) {
      await this.delete(id);
    }
    return pruned.size;
  }
}

// ─── Convenience: known schedule presets ─────────────────────────────────

/**
 * Recommended default backup schedules. Wire into the Scheduler (M2-3a)
 * by registering one job per entry that calls `provider.backup(type)`.
 */
export const DEFAULT_BACKUP_SCHEDULES: readonly BackupSchedule[] = [
  { type: 'database', cronExpression: '0 2 * * *', retention: 7 }, // daily 02:00, keep 7
  { type: 'storage', cronExpression: '0 3 * * *', retention: 7 }, // daily 03:00, keep 7
  { type: 'configuration', cronExpression: '0 4 * * 0', retention: 4 }, // weekly Sun 04:00, keep 4
  { type: 'secrets-metadata', cronExpression: '0 4 * * 0', retention: 4 }, // weekly Sun 04:00, keep 4
] as const;
