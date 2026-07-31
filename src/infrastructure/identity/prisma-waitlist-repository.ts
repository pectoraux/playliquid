/**
 * Prisma-backed WaitlistRepository — early-access waitlist pipeline.
 *
 * Lifecycle:
 *   pending → email_verified → approved → converted
 *                          ↘ rejected
 *
 * Each entry has a unique email. The `verificationToken` is a single-use
 * secret that gets exchanged for the `email_verified` status. Once approved,
 * `invitedById` records which admin sent the invite.
 */

import type { WaitlistEntry, WaitlistRepository } from '@/domain/identity/repositories';
import { getClient } from '@/infrastructure/database/prisma';
import { logger } from '@/shared/logging';

interface WaitlistRecord {
  id: string;
  email: string;
  username: string;
  status: string;
  verificationToken: string | null;
  verifiedAt: string | null;
  approvalNotes: string | null;
  rejectionReason: string | null;
  invitedById: string | null;
  createdAt: string;
  updatedAt: string;
}

const VALID_STATUSES = new Set([
  'pending',
  'email_verified',
  'approved',
  'rejected',
  'converted',
]);

function toEntry(r: WaitlistRecord): WaitlistEntry {
  const status = VALID_STATUSES.has(r.status) ? (r.status as WaitlistEntry['status']) : 'pending';
  return {
    id: r.id,
    email: r.email,
    username: r.username,
    status,
    verificationToken: r.verificationToken,
    verifiedAt: r.verifiedAt,
    approvalNotes: r.approvalNotes,
    rejectionReason: r.rejectionReason,
    invitedById: r.invitedById,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class PrismaWaitlistRepository implements WaitlistRepository {
  async add(entry: WaitlistEntry): Promise<void> {
    const client = getClient();
    await client.waitlistEntry.create({
      data: {
        id: entry.id,
        email: entry.email,
        username: entry.username,
        status: entry.status,
        verificationToken: entry.verificationToken,
        verifiedAt: entry.verifiedAt,
        approvalNotes: entry.approvalNotes,
        rejectionReason: entry.rejectionReason,
        invitedById: entry.invitedById,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      },
    });
    logger.database().debug('Waitlist entry added', { id: entry.id, email: entry.email });
  }

  async getById(id: string): Promise<WaitlistEntry | null> {
    const client = getClient();
    const record = await client.waitlistEntry.findUnique({ where: { id } });
    return record ? toEntry(record) : null;
  }

  async getByEmail(email: string): Promise<WaitlistEntry | null> {
    const client = getClient();
    const normalized = email.trim().toLowerCase();
    const record = await client.waitlistEntry.findUnique({ where: { email: normalized } });
    return record ? toEntry(record) : null;
  }

  async list(filters: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<WaitlistEntry[]> {
    const client = getClient();
    const where: Record<string, unknown> = {};
    if (filters.status) where['status'] = filters.status;

    const records = await client.waitlistEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
    });
    return records.map(toEntry);
  }

  async update(id: string, updates: Partial<WaitlistEntry>): Promise<void> {
    const client = getClient();
    const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (updates.status !== undefined) data['status'] = updates.status;
    if (updates.verificationToken !== undefined) data['verificationToken'] = updates.verificationToken;
    if (updates.verifiedAt !== undefined) data['verifiedAt'] = updates.verifiedAt;
    if (updates.approvalNotes !== undefined) data['approvalNotes'] = updates.approvalNotes;
    if (updates.rejectionReason !== undefined) data['rejectionReason'] = updates.rejectionReason;
    if (updates.invitedById !== undefined) data['invitedById'] = updates.invitedById;
    if (updates.username !== undefined) data['username'] = updates.username;

    await client.waitlistEntry.update({ where: { id }, data });
    logger.database().debug('Waitlist entry updated', { id, fields: Object.keys(data) });
  }

  async count(): Promise<number> {
    const client = getClient();
    return client.waitlistEntry.count();
  }

  async countByStatus(): Promise<Record<string, number>> {
    const client = getClient();
    const grouped = await client.waitlistEntry.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const g of grouped) {
      out[g.status] = g._count._all;
    }
    return out;
  }
}
