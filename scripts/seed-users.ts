/**
 * Seed script — creates the permanent administrator and demo accounts.
 *
 * Run once on first deploy (or when the database is empty).
 * Creates:
 *   - Permanent admin: ekontetevi@gmail / Payswap123456
 *   - Demo accounts for every role (player, creator, studio, marketplace, moderator, support, finance, operations, admin)
 *
 * Each account is a real WaitlistEntry with status=APPROVED so it can log in
 * immediately via the waitlist approval flow.
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

interface SeedUser {
  email: string;
  username: string;
  displayName: string;
  password: string;
  role: string;
  isPermanent: boolean;
  isDemo: boolean;
  country: string;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'ekontetevi@gmail',
    username: 'admin',
    displayName: 'Administrator',
    password: 'Payswap123456',
    role: 'admin',
    isPermanent: true,
    isDemo: false,
    country: 'GH',
  },
  {
    email: 'player@demo.playliquid.com',
    username: 'player_demo',
    displayName: 'Alex Player',
    password: 'demo12345',
    role: 'player',
    isPermanent: false,
    isDemo: true,
    country: 'GH',
  },
  {
    email: 'creator@demo.playliquid.com',
    username: 'creator_demo',
    displayName: 'Jordan Creator',
    password: 'demo12345',
    role: 'creator',
    isPermanent: false,
    isDemo: true,
    country: 'US',
  },
  {
    email: 'studio@demo.playliquid.com',
    username: 'studio_demo',
    displayName: 'Sam Studio',
    password: 'demo12345',
    role: 'studio',
    isPermanent: false,
    isDemo: true,
    country: 'GB',
  },
  {
    email: 'marketplace@demo.playliquid.com',
    username: 'marketplace_demo',
    displayName: 'Morgan Market',
    password: 'demo12345',
    role: 'marketplace',
    isPermanent: false,
    isDemo: true,
    country: 'GH',
  },
  {
    email: 'moderator@demo.playliquid.com',
    username: 'moderator_demo',
    displayName: 'Riley Mod',
    password: 'demo12345',
    role: 'moderator',
    isPermanent: false,
    isDemo: true,
    country: 'NG',
  },
  {
    email: 'support@demo.playliquid.com',
    username: 'support_demo',
    displayName: 'Casey Support',
    password: 'demo12345',
    role: 'support',
    isPermanent: false,
    isDemo: true,
    country: 'KE',
  },
  {
    email: 'finance@demo.playliquid.com',
    username: 'finance_demo',
    displayName: 'Taylor Finance',
    password: 'demo12345',
    role: 'finance',
    isPermanent: false,
    isDemo: true,
    country: 'ZA',
  },
  {
    email: 'operations@demo.playliquid.com',
    username: 'operations_demo',
    displayName: 'Quinn Ops',
    password: 'demo12345',
    role: 'operations',
    isPermanent: false,
    isDemo: true,
    country: 'GH',
  },
  {
    email: 'developer@demo.playliquid.com',
    username: 'developer_demo',
    displayName: 'Dev Developer',
    password: 'demo12345',
    role: 'developer',
    isPermanent: false,
    isDemo: true,
    country: 'US',
  },
];

/** Hash a password using scryptSync (PHC-like format). */
function hashPassword(plaintext: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plaintext, salt, 64).toString('hex');
  return `$scrypt$${salt}$${hash}`;
}

async function seed() {
  console.log('🌱 Seeding PlayLiquid users...\n');

  for (const user of SEED_USERS) {
    // Check if already exists
    const existing = await prisma.waitlistEntry.findUnique({
      where: { email: user.email },
    });

    if (existing) {
      console.log(`  ✓ ${user.email} already exists (skipping)`);
      continue;
    }

    // Create waitlist entry with approved status
    await prisma.waitlistEntry.create({
      data: {
        email: user.email,
        username: user.username,
        status: 'approved',
        verificationToken: null,
        verifiedAt: new Date().toISOString(),
        approvalNotes: user.isPermanent ? 'Permanent administrator' : 'Demo account',
        rejectionReason: null,
        invitedById: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    // Create user read model
    await prisma.userReadModel.upsert({
      where: { userId: user.username },
      create: {
        userId: user.username,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        country: user.country,
        status: 'active',
        emailVerified: true,
        mfaEnabled: false,
        passwordHash: hashPassword(user.password),
        roles: JSON.stringify([user.role]),
        isDemo: user.isDemo,
        isPermanent: user.isPermanent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date(),
      },
      update: {},
    });

    console.log(`  ✓ Created ${user.email} (${user.role})${user.isDemo ? ' [DEMO]' : ''}`);
  }

  console.log('\n✅ Seed complete!');
  console.log(`  Permanent admin: ekontetevi@gmail / Payswap123456`);
  console.log(`  Demo accounts: player/creator/studio/marketplace/moderator/support/finance/operations/developer@demo.playliquid.com`);
  console.log(`  Demo password: demo12345`);
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
