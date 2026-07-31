// @ts-nocheck
/**
 * Storage Provider — abstraction over object storage backends.
 *
 * Application code depends on the `StorageProvider` interface. The DI container
 * selects the implementation (`LocalStorageProvider` for development / single
 * instance, `S3StorageProvider` for production / multi-instance).
 *
 * Features:
 *   - upload / download / delete / copy / move
 *   - signedUrl — time-limited URL with HMAC signature
 *   - exists / stat / list — object introspection
 *
 * Backends:
 *   - `LocalStorageProvider` — files on the local filesystem, sidecar JSON
 *     metadata files, HMAC-signed URLs.
 *   - `S3StorageProvider` — AWS S3 (or any S3-compatible API such as MinIO,
 *     Cloudflare R2, Backblaze B2) via `@aws-sdk/client-s3`. The AWS SDK is
 *     loaded dynamically so the dependency is only required when S3 is actually
 *     used — local development does not need it installed.
 */

import { createHash, createHmac } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { getConfig } from '@/shared/config';
import { logger } from '@/shared/logging';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface StorageObject {
  key: string;
  bucket: string;
  size: number;
  contentType: string;
  etag: string;
  lastModified: number;
  metadata: Record<string, string>;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
}

export interface StorageProvider {
  upload(bucket: string, key: string, data: Buffer, options?: UploadOptions): Promise<StorageObject>;
  download(bucket: string, key: string): Promise<Buffer>;
  delete(bucket: string, key: string): Promise<void>;
  copy(srcBucket: string, srcKey: string, destBucket: string, destKey: string): Promise<StorageObject>;
  move(srcBucket: string, srcKey: string, destBucket: string, destKey: string): Promise<StorageObject>;
  signedUrl(bucket: string, key: string, expiresIn: number): Promise<string>;
  exists(bucket: string, key: string): Promise<boolean>;
  stat(bucket: string, key: string): Promise<StorageObject | null>;
  list(bucket: string, prefix: string, limit?: number): Promise<StorageObject[]>;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const META_SUFFIX = '.meta.json';

/** On-disk sidecar metadata for LocalStorageProvider. */
interface ObjectMetadata {
  size: number;
  contentType: string;
  etag: string;
  lastModified: number;
  metadata: Record<string, string>;
  cacheControl?: string;
}

/** Reject bucket/key names that could escape the storage root via path traversal. */
function assertSafePath(bucket: string, key: string): void {
  if (!bucket || bucket.includes('/') || bucket.includes('..') || bucket.includes('\0')) {
    throw new Error(`Invalid bucket name: "${bucket}"`);
  }
  if (key.includes('..') || key.includes('\0')) {
    throw new Error(`Invalid key (path traversal detected): "${key}"`);
  }
}

// ---------------------------------------------------------------------------
// LocalStorageProvider
// ---------------------------------------------------------------------------

export interface LocalStorageProviderOptions {
  /** Absolute or relative path to the storage root directory. */
  baseDir: string;
  /** Secret used to sign URLs. Defaults to `getConfig().auth.secret`. */
  secret?: string;
  /** Public URL prefix used when constructing signed URLs. */
  publicBaseUrl?: string;
}

/**
 * Filesystem-backed object storage. Buckets are top-level subdirectories, keys
 * are nested paths within them. A sidecar `<key>.meta.json` file records the
 * object's content type, etag, and arbitrary user metadata so that `stat` /
 * `list` can return the full `StorageObject` shape without re-reading the body.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;
  private readonly secret: string;
  private readonly publicBaseUrl: string;

  constructor(opts: LocalStorageProviderOptions) {
    this.baseDir = opts.baseDir;
    this.secret = opts.secret ?? getConfig().auth.secret;
    this.publicBaseUrl = opts.publicBaseUrl ?? '/storage';
  }

  private fullPath(bucket: string, key: string): string {
    assertSafePath(bucket, key);
    return join(this.baseDir, bucket, key);
  }

  private metaPath(bucket: string, key: string): string {
    return this.fullPath(bucket, key) + META_SUFFIX;
  }

  private async readMeta(bucket: string, key: string): Promise<ObjectMetadata | null> {
    try {
      const raw = await readFile(this.metaPath(bucket, key), 'utf-8');
      return JSON.parse(raw) as ObjectMetadata;
    } catch {
      return null;
    }
  }

  private async writeMeta(bucket: string, key: string, meta: ObjectMetadata): Promise<void> {
    await writeFile(this.metaPath(bucket, key), JSON.stringify(meta), 'utf-8');
  }

  private toStorageObject(bucket: string, key: string, meta: ObjectMetadata): StorageObject {
    return {
      key,
      bucket,
      size: meta.size,
      contentType: meta.contentType,
      etag: meta.etag,
      lastModified: meta.lastModified,
      metadata: meta.metadata,
    };
  }

  async upload(bucket: string, key: string, data: Buffer, options?: UploadOptions): Promise<StorageObject> {
    const filePath = this.fullPath(bucket, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);

    const etag = createHash('md5').update(data).digest('hex');
    const fileStat = await stat(filePath);
    const meta: ObjectMetadata = {
      size: data.length,
      contentType: options?.contentType ?? DEFAULT_CONTENT_TYPE,
      etag,
      lastModified: fileStat.mtimeMs,
      metadata: options?.metadata ?? {},
      cacheControl: options?.cacheControl,
    };
    await this.writeMeta(bucket, key, meta);

    logger.system().debug('Storage upload (local)', { bucket, key, size: data.length, contentType: meta.contentType });
    return this.toStorageObject(bucket, key, meta);
  }

  async download(bucket: string, key: string): Promise<Buffer> {
    try {
      return await readFile(this.fullPath(bucket, key));
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        throw new Error(`Object not found: ${bucket}/${key}`);
      }
      throw e;
    }
  }

  async delete(bucket: string, key: string): Promise<void> {
    assertSafePath(bucket, key);
    try {
      await unlink(this.fullPath(bucket, key));
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw e;
    }
    try {
      await unlink(this.metaPath(bucket, key));
    } catch {
      // ignore missing sidecar
    }
    logger.system().debug('Storage delete (local)', { bucket, key });
  }

  async copy(srcBucket: string, srcKey: string, destBucket: string, destKey: string): Promise<StorageObject> {
    const srcPath = this.fullPath(srcBucket, srcKey);
    const destPath = this.fullPath(destBucket, destKey);
    await mkdir(dirname(destPath), { recursive: true });
    await copyFile(srcPath, destPath);

    const meta = await this.readMeta(srcBucket, srcKey);
    const finalMeta: ObjectMetadata = meta ?? {
      size: (await stat(destPath)).size,
      contentType: DEFAULT_CONTENT_TYPE,
      etag: '',
      lastModified: Date.now(),
      metadata: {},
    };
    await this.writeMeta(destBucket, destKey, finalMeta);
    return this.toStorageObject(destBucket, destKey, finalMeta);
  }

  async move(srcBucket: string, srcKey: string, destBucket: string, destKey: string): Promise<StorageObject> {
    // Try a fast rename when source and destination buckets match.
    if (srcBucket === destBucket) {
      try {
        const srcPath = this.fullPath(srcBucket, srcKey);
        const destPath = this.fullPath(destBucket, destKey);
        await mkdir(dirname(destPath), { recursive: true });
        await rename(srcPath, destPath);
        try {
          await rename(this.metaPath(srcBucket, srcKey), this.metaPath(destBucket, destKey));
        } catch {
          // ignore missing sidecar
        }
        const meta = await this.readMeta(destBucket, destKey);
        if (meta) return this.toStorageObject(destBucket, destKey, meta);
      } catch {
        // fall through to copy + delete
      }
    }
    const result = await this.copy(srcBucket, srcKey, destBucket, destKey);
    await this.delete(srcBucket, srcKey);
    return result;
  }

  async signedUrl(bucket: string, key: string, expiresIn: number): Promise<string> {
    assertSafePath(bucket, key);
    const expires = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(expiresIn));
    const payload = `${bucket}/${key}:${expires}`;
    const signature = createHmac('sha256', this.secret).update(payload).digest('hex');
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `${this.publicBaseUrl}/${bucket}/${encodedKey}?expires=${expires}&signature=${signature}`;
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    try {
      await stat(this.fullPath(bucket, key));
      return true;
    } catch {
      return false;
    }
  }

  async stat(bucket: string, key: string): Promise<StorageObject | null> {
    const meta = await this.readMeta(bucket, key);
    if (meta) return this.toStorageObject(bucket, key, meta);
    // No sidecar — fall back to filesystem stat for a bare object.
    try {
      const fileStat = await stat(this.fullPath(bucket, key));
      const meta2: ObjectMetadata = {
        size: fileStat.size,
        contentType: DEFAULT_CONTENT_TYPE,
        etag: '',
        lastModified: fileStat.mtimeMs,
        metadata: {},
      };
      return this.toStorageObject(bucket, key, meta2);
    } catch {
      return null;
    }
  }

  async list(bucket: string, prefix: string, limit = 100): Promise<StorageObject[]> {
    const bucketDir = join(this.baseDir, bucket);
    const results: StorageObject[] = [];
    const seen = new Set<string>();
    try {
      await this.listRecursive(bucketDir, bucket, prefix, limit, results, seen);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw e;
    }
    return results.slice(0, limit);
  }

  private async listRecursive(
    dir: string,
    bucket: string,
    prefix: string,
    limit: number,
    results: StorageObject[],
    seen: Set<string>,
  ): Promise<void> {
    if (results.length >= limit) return;
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= limit) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.listRecursive(full, bucket, prefix, limit, results, seen);
        continue;
      }
      if (!entry.name.endsWith(META_SUFFIX)) continue;
      // Derive the object key from the sidecar path.
      const metaRel = full.slice(join(this.baseDir, bucket).length + 1);
      const key = metaRel.slice(0, -META_SUFFIX.length).split('\\').join('/');
      if (prefix && !key.startsWith(prefix)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      const meta = await this.readMeta(bucket, key);
      if (meta) results.push(this.toStorageObject(bucket, key, meta));
    }
  }

  /**
   * Verify a signed URL produced by `signedUrl`. Returns true if the signature
   * matches and the URL has not expired. Useful for serving endpoints that
   * validate tokens before streaming the underlying file.
   */
  verifySignedUrl(bucket: string, key: string, expires: number, signature: string): boolean {
    if (!Number.isFinite(expires) || expires * 1000 < Date.now()) return false;
    const payload = `${bucket}/${key}:${expires}`;
    const expected = createHmac('sha256', this.secret).update(payload).digest('hex');
    // Constant-time comparison
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  }
}

// ---------------------------------------------------------------------------
// S3StorageProvider
// ---------------------------------------------------------------------------

/**
 * Minimal type-only shape of the AWS SDK v3 S3 client. We define these locally
 * rather than importing them statically so that the `@aws-sdk/client-s3` and
 * `@aws-sdk/s3-request-presigner` packages are only required at runtime when
 * S3 is actually used — local development works without them installed.
 */
interface S3ClientConfig {
  region: string;
  endpoint?: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  forcePathStyle?: boolean;
}

interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

interface S3ModuleLike {
  S3Client: new (config: S3ClientConfig) => S3ClientLike;
  PutObjectCommand: new (input: Record<string, unknown>) => unknown;
  GetObjectCommand: new (input: Record<string, unknown>) => unknown;
  DeleteObjectCommand: new (input: Record<string, unknown>) => unknown;
  CopyObjectCommand: new (input: Record<string, unknown>) => unknown;
  HeadObjectCommand: new (input: Record<string, unknown>) => unknown;
  ListObjectsV2Command: new (input: Record<string, unknown>) => unknown;
}

interface PresignerModuleLike {
  getSignedUrl(client: unknown, command: unknown, options: { expiresIn: number }): Promise<string>;
}

/** Result shape from S3 PutObject / CopyObject — only the fields we use. */
interface S3WriteResult {
  ETag?: string;
}

/** Result shape from S3 HeadObject. */
interface S3HeadResult {
  ContentLength?: number;
  ContentType?: string;
  ETag?: string;
  LastModified?: Date;
  Metadata?: Record<string, string>;
}

/** Result shape from S3 GetObject. The Body is a streaming blob with a
 * `transformToByteArray` helper in AWS SDK v3. */
interface S3GetResult {
  Body?: { transformToByteArray?: () => Promise<Uint8Array> } | null;
  ContentLength?: number;
  ContentType?: string;
  Metadata?: Record<string, string>;
}

/** Result shape from S3 ListObjectsV2. */
interface S3ListResult {
  Contents?: Array<{
    Key?: string;
    Size?: number;
    LastModified?: Date;
    ETag?: string;
  }>;
}

export interface S3StorageProviderOptions {
  region: string;
  /** Custom endpoint (MinIO, R2, etc.). Optional. */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Use path-style addressing (required by MinIO; default true for compat). */
  forcePathStyle?: boolean;
}

/**
 * AWS S3 (or any S3-compatible API) storage provider. The AWS SDK is imported
 * lazily on first use so that the dependency is only required when this
 * backend is actually selected.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly config: S3ClientConfig;
  private client: S3ClientLike | null = null;
  private s3Module: S3ModuleLike | null = null;
  private presignerModule: PresignerModuleLike | null = null;

  constructor(opts: S3StorageProviderOptions) {
    this.config = {
      region: opts.region,
      endpoint: opts.endpoint,
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      },
      forcePathStyle: opts.forcePathStyle ?? true,
    };
  }

  private async ensureClient(): Promise<{ client: S3ClientLike; mod: S3ModuleLike }> {
    if (this.client && this.s3Module) {
      return { client: this.client, mod: this.s3Module };
    }
    try {
      const mod = (await import(/* webpackIgnore: true */ '@aws-sdk/client-s3')) as unknown as S3ModuleLike;
      this.s3Module = mod;
      this.client = new mod.S3Client(this.config);
      logger.system().info('S3 storage client initialised', {
        region: this.config.region,
        endpoint: this.config.endpoint ?? 'aws-default',
      });
      return { client: this.client, mod };
    } catch (e) {
      throw new Error(
        'S3StorageProvider requires @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner. ' +
          'Install them with: bun add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner. ' +
          `Original error: ${(e as Error).message}`,
      );
    }
  }

  private async ensurePresigner(): Promise<PresignerModuleLike> {
    if (this.presignerModule) return this.presignerModule;
    try {
      this.presignerModule = (await import(/* webpackIgnore: true */ '@aws-sdk/s3-request-presigner')) as unknown as PresignerModuleLike;
      return this.presignerModule;
    } catch (e) {
      throw new Error(
        'S3StorageProvider.signedUrl requires @aws-sdk/s3-request-presigner. ' +
          'Install it with: bun add @aws-sdk/s3-request-presigner. ' +
          `Original error: ${(e as Error).message}`,
      );
    }
  }

  async upload(bucket: string, key: string, data: Buffer, options?: UploadOptions): Promise<StorageObject> {
    const { client, mod } = await this.ensureClient();
    const input: Record<string, unknown> = {
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: options?.contentType ?? DEFAULT_CONTENT_TYPE,
    };
    if (options?.metadata) input.Metadata = options.metadata;
    if (options?.cacheControl) input.CacheControl = options.cacheControl;

    const result = (await client.send(new mod.PutObjectCommand(input))) as S3WriteResult;
    const etag = result?.ETag?.replace(/"/g, '') ?? createHash('md5').update(data).digest('hex');
    const obj: StorageObject = {
      key,
      bucket,
      size: data.length,
      contentType: input.ContentType as string,
      etag,
      lastModified: Date.now(),
      metadata: options?.metadata ?? {},
    };
    logger.system().debug('Storage upload (S3)', { bucket, key, size: data.length });
    return obj;
  }

  async download(bucket: string, key: string): Promise<Buffer> {
    const { client, mod } = await this.ensureClient();
    const result = (await client.send(
      new mod.GetObjectCommand({ Bucket: bucket, Key: key }),
    )) as S3GetResult;
    if (!result?.Body) {
      throw new Error(`Object body missing: ${bucket}/${key}`);
    }
    if (typeof result.Body.transformToByteArray === 'function') {
      const bytes = await result.Body.transformToByteArray();
      return Buffer.from(bytes);
    }
    throw new Error(
      `Unexpected S3 Body shape for ${bucket}/${key} — transformToByteArray is not available. ` +
        'Ensure @aws-sdk/client-s3 v3.x is installed.',
    );
  }

  async delete(bucket: string, key: string): Promise<void> {
    const { client, mod } = await this.ensureClient();
    await client.send(new mod.DeleteObjectCommand({ Bucket: bucket, Key: key }));
    logger.system().debug('Storage delete (S3)', { bucket, key });
  }

  async copy(srcBucket: string, srcKey: string, destBucket: string, destKey: string): Promise<StorageObject> {
    const { client, mod } = await this.ensureClient();
    const result = (await client.send(
      new mod.CopyObjectCommand({
        Bucket: destBucket,
        Key: destKey,
        CopySource: `${srcBucket}/${encodeURIComponent(srcKey)}`,
      }),
    )) as S3WriteResult;
    const head = await this.stat(destBucket, destKey);
    return {
      key: destKey,
      bucket: destBucket,
      size: head?.size ?? 0,
      contentType: head?.contentType ?? DEFAULT_CONTENT_TYPE,
      etag: result?.ETag?.replace(/"/g, '') ?? head?.etag ?? '',
      lastModified: head?.lastModified ?? Date.now(),
      metadata: head?.metadata ?? {},
    };
  }

  async move(srcBucket: string, srcKey: string, destBucket: string, destKey: string): Promise<StorageObject> {
    const result = await this.copy(srcBucket, srcKey, destBucket, destKey);
    await this.delete(srcBucket, srcKey);
    return result;
  }

  async signedUrl(bucket: string, key: string, expiresIn: number): Promise<string> {
    const { client, mod } = await this.ensureClient();
    const presigner = await this.ensurePresigner();
    const command = new mod.GetObjectCommand({ Bucket: bucket, Key: key });
    return presigner.getSignedUrl(client, command, { expiresIn });
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    const obj = await this.stat(bucket, key);
    return obj !== null;
  }

  async stat(bucket: string, key: string): Promise<StorageObject | null> {
    const { client, mod } = await this.ensureClient();
    let head: S3HeadResult;
    try {
      head = (await client.send(new mod.HeadObjectCommand({ Bucket: bucket, Key: key }))) as S3HeadResult;
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
    return {
      key,
      bucket,
      size: head.ContentLength ?? 0,
      contentType: head.ContentType ?? DEFAULT_CONTENT_TYPE,
      etag: head.ETag?.replace(/"/g, '') ?? '',
      lastModified: head.LastModified ? head.LastModified.getTime() : Date.now(),
      metadata: head.Metadata ?? {},
    };
  }

  async list(bucket: string, prefix: string, limit = 100): Promise<StorageObject[]> {
    const { client, mod } = await this.ensureClient();
    const result = (await client.send(
      new mod.ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: limit,
      }),
    )) as S3ListResult;
    const contents = result?.Contents ?? [];
    return contents
      .filter((c): c is { Key: string; Size: number; LastModified: Date; ETag: string } => typeof c.Key === 'string')
      .map((c) => ({
        key: c.Key,
        bucket,
        size: c.Size ?? 0,
        contentType: DEFAULT_CONTENT_TYPE,
        etag: c.ETag?.replace(/"/g, '') ?? '',
        lastModified: c.LastModified ? c.LastModified.getTime() : Date.now(),
        metadata: {},
      }));
  }
}
