/**
 * Prisma-backed DeviceRepository — registry of recognized user devices.
 *
 * Devices are identified by a fingerprint (derived client-side from a stable
 * set of browser + OS + hardware attributes). The `(userId, fingerprint)`
 * pair is unique — a device can be "trusted" by a specific user but the same
 * physical device visiting under a different user is a separate row.
 *
 * Risk score (0-100) is computed by the RiskEngine and refreshed on every
 * authentication event. Trusted devices skip MFA prompts in the login flow.
 */

import type { DeviceData, DeviceRepository } from '@/domain/identity/repositories';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

interface DeviceRecord {
  id: string;
  userId: string;
  name: string;
  browser: string;
  os: string;
  ipAddress: string;
  location: string | null;
  fingerprint: string;
  riskScore: number;
  trusted: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

function toData(r: DeviceRecord): DeviceData {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    browser: r.browser,
    os: r.os,
    ipAddress: r.ipAddress,
    location: r.location,
    fingerprint: r.fingerprint,
    riskScore: r.riskScore,
    trusted: r.trusted,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    revokedAt: r.revokedAt,
  };
}

export class PrismaDeviceRepository implements DeviceRepository {
  async getById(id: string): Promise<DeviceData | null> {
    const client = getClient();
    const record = await client.device.findUnique({ where: { id } });
    return record ? toData(record) : null;
  }

  async getByFingerprint(userId: string, fingerprint: string): Promise<DeviceData | null> {
    const client = getClient();
    const record = await client.device.findUnique({
      where: { userId_fingerprint: { userId, fingerprint } },
    });
    return record ? toData(record) : null;
  }

  async getByUserId(userId: string): Promise<DeviceData[]> {
    const client = getClient();
    const records = await client.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
    return records.map(toData);
  }

  async save(device: DeviceData): Promise<void> {
    const client = getClient();
    await client.device.upsert({
      where: { userId_fingerprint: { userId: device.userId, fingerprint: device.fingerprint } },
      create: {
        id: device.id,
        userId: device.userId,
        name: device.name,
        browser: device.browser,
        os: device.os,
        ipAddress: device.ipAddress,
        location: device.location,
        fingerprint: device.fingerprint,
        riskScore: device.riskScore,
        trusted: device.trusted,
        firstSeenAt: device.firstSeenAt,
        lastSeenAt: device.lastSeenAt,
        revokedAt: device.revokedAt,
      },
      update: {
        name: device.name,
        browser: device.browser,
        os: device.os,
        ipAddress: device.ipAddress,
        location: device.location,
        riskScore: device.riskScore,
        trusted: device.trusted,
        lastSeenAt: device.lastSeenAt,
        revokedAt: device.revokedAt,
      },
    });
    logger.database().debug('Device saved', {
      deviceId: device.id,
      userId: device.userId,
      trusted: device.trusted,
    });
  }

  async update(id: string, updates: Partial<DeviceData>): Promise<void> {
    const client = getClient();
    const data: Record<string, unknown> = {};
    if (updates.name !== undefined) data['name'] = updates.name;
    if (updates.browser !== undefined) data['browser'] = updates.browser;
    if (updates.os !== undefined) data['os'] = updates.os;
    if (updates.ipAddress !== undefined) data['ipAddress'] = updates.ipAddress;
    if (updates.location !== undefined) data['location'] = updates.location;
    if (updates.riskScore !== undefined) data['riskScore'] = updates.riskScore;
    if (updates.trusted !== undefined) data['trusted'] = updates.trusted;
    if (updates.lastSeenAt !== undefined) data['lastSeenAt'] = updates.lastSeenAt;
    if (updates.revokedAt !== undefined) data['revokedAt'] = updates.revokedAt;

    await client.device.update({ where: { id }, data });
    logger.database().debug('Device updated', { deviceId: id, fields: Object.keys(data) });
  }

  async delete(id: string): Promise<void> {
    const client = getClient();
    await client.device.delete({ where: { id } }).catch(() => {});
    logger.database().debug('Device deleted', { deviceId: id });
  }

  async revoke(id: string): Promise<void> {
    const client = getClient();
    const now = new Date().toISOString();
    await client.device.update({
      where: { id },
      data: { revokedAt: now, trusted: false },
    });
    logger.database().debug('Device revoked', { deviceId: id, revokedAt: now });
  }
}
