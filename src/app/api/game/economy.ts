/**
 * Game Economy API
 *
 * Complete end-to-end workflows for:
 * - Deposit funds to wallet
 * - Purchase playtime minutes
 * - Start/end game sessions
 * - Submit scores and update leaderboards
 *
 * All operations persist to the database and update read models.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ─── Deposit Funds ─────────────────────────────────────────────────────────

export async function POST_deposit(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.userId || !body?.amount || body.amount <= 0) {
    return NextResponse.json({ ok: false, error: 'userId and positive amount required' }, { status: 400 });
  }

  const amount = Math.floor(body.amount);
  const currency = body.currency || 'GHS';

  // Upsert wallet read model
  const wallet = await db.walletReadModel.upsert({
    where: { playerId: body.userId },
    create: { playerId: body.userId, balance: amount, currency },
    update: { balance: { increment: amount } },
  });

  // Record event in event store for audit trail
  await db.eventRecord.create({
    data: {
      eventId: `evt_dep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      streamId: `WalletAggregate-${body.userId}`,
      streamVersion: 1,
      eventType: 'WalletDeposited',
      aggregateId: body.userId,
      aggregateType: 'WalletAggregate',
      aggregateVersion: 1,
      payload: JSON.stringify({ playerId: body.userId, amount, currency, reference: body.reference || 'deposit', depositedAt: new Date().toISOString() }),
      metadata: JSON.stringify({ source: 'api', userId: body.userId }),
      occurredAt: new Date().toISOString(),
      correlationId: body.correlationId || null,
      causationId: null,
    },
  });

  return NextResponse.json({ ok: true, data: { balance: wallet.balance, currency: wallet.currency } });
}

// ─── Purchase Minutes ──────────────────────────────────────────────────────

export async function POST_purchaseMinutes(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.userId || !body?.gameId || !body?.minutes || body.minutes <= 0) {
    return NextResponse.json({ ok: false, error: 'userId, gameId, and positive minutes required' }, { status: 400 });
  }

  const minutes = Math.floor(body.minutes);
  const costPerMinute = 10; // 10 GHS per minute
  const totalCost = minutes * costPerMinute;

  // Check wallet balance
  const wallet = await db.walletReadModel.findUnique({ where: { playerId: body.userId } });
  if (!wallet || wallet.balance < totalCost) {
    return NextResponse.json({
      ok: false,
      error: `Insufficient balance. Need ${totalCost} ${wallet?.currency || 'GHS'}, have ${wallet?.balance || 0}.`,
      code: 'INSUFFICIENT_BALANCE',
    }, { status: 402 });
  }

  // Deduct from wallet
  const updatedWallet = await db.walletReadModel.update({
    where: { playerId: body.userId },
    data: { balance: { decrement: totalCost } },
  });

  // Record purchase event
  await db.eventRecord.create({
    data: {
      eventId: `evt_min_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      streamId: `WalletAggregate-${body.userId}`,
      streamVersion: 2,
      eventType: 'MinutesPurchased',
      aggregateId: body.userId,
      aggregateType: 'WalletAggregate',
      aggregateVersion: 2,
      payload: JSON.stringify({ playerId: body.userId, gameId: body.gameId, minutes, amountPaid: totalCost, currency: wallet.currency, purchasedAt: new Date().toISOString() }),
      metadata: JSON.stringify({ source: 'api', userId: body.userId }),
      occurredAt: new Date().toISOString(),
      correlationId: body.correlationId || null,
      causationId: null,
    },
  });

  // Create or update a "minutes balance" record
  const existingSession = await db.sessionReadModel.findFirst({
    where: { gameId: body.gameId, playerId: body.userId, status: 'active' },
  });

  if (existingSession) {
    // Extend existing session
    const updated = await db.sessionReadModel.update({
      where: { id: existingSession.id },
      data: { durationMinutes: { increment: minutes } },
    });
    return NextResponse.json({ ok: true, data: { sessionId: updated.sessionId, minutesRemaining: updated.durationMinutes, walletBalance: updatedWallet.balance } });
  }

  // Create new session
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.sessionReadModel.create({
    data: {
      sessionId,
      gameId: body.gameId,
      playerId: body.userId,
      status: 'active',
      durationMinutes: minutes,
      startedAt: new Date().toISOString(),
    },
  });

  // Record session started event
  await db.eventRecord.create({
    data: {
      eventId: `evt_sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      streamId: `SessionAggregate-${sessionId}`,
      streamVersion: 1,
      eventType: 'SessionStarted',
      aggregateId: sessionId,
      aggregateType: 'SessionAggregate',
      aggregateVersion: 1,
      payload: JSON.stringify({ userId: body.userId, sessionId, gameId: body.gameId, deviceFingerprint: 'web', ipAddress: '', userAgent: '', startedAt: new Date().toISOString() }),
      metadata: JSON.stringify({ source: 'api', userId: body.userId }),
      occurredAt: new Date().toISOString(),
      correlationId: body.correlationId || null,
      causationId: null,
    },
  });

  return NextResponse.json({ ok: true, data: { sessionId, minutesRemaining: minutes, walletBalance: updatedWallet.balance } });
}

// ─── Get Session Status ────────────────────────────────────────────────────

export async function GET_sessionStatus(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  const gameId = url.searchParams.get('gameId');

  if (!userId || !gameId) {
    return NextResponse.json({ ok: false, error: 'userId and gameId required' }, { status: 400 });
  }

  const session = await db.sessionReadModel.findFirst({
    where: { gameId, playerId: userId, status: 'active' },
    orderBy: { startedAt: 'desc' },
  });

  const wallet = await db.walletReadModel.findUnique({ where: { playerId: userId } });

  return NextResponse.json({
    ok: true,
    data: {
      hasActiveSession: !!session,
      sessionId: session?.sessionId || null,
      minutesRemaining: session?.durationMinutes || 0,
      walletBalance: wallet?.balance || 0,
      walletCurrency: wallet?.currency || 'GHS',
    },
  });
}

// ─── End Session & Submit Score ────────────────────────────────────────────

export async function POST_endSession(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.sessionId || body?.score === undefined) {
    return NextResponse.json({ ok: false, error: 'sessionId and score required' }, { status: 400 });
  }

  const score = Math.floor(body.score);
  const sessionId = body.sessionId;

  // Find session
  const session = await db.sessionReadModel.findUnique({ where: { sessionId } });
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
  }

  // End session
  await db.sessionReadModel.update({
    where: { sessionId },
    data: { status: 'ended', endedAt: new Date().toISOString() },
  });

  // Record session ended event
  await db.eventRecord.create({
    data: {
      eventId: `evt_sessend_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      streamId: `SessionAggregate-${sessionId}`,
      streamVersion: 2,
      eventType: 'SessionEnded',
      aggregateId: sessionId,
      aggregateType: 'SessionAggregate',
      aggregateVersion: 2,
      payload: JSON.stringify({ userId: session.playerId, sessionId, endedAt: new Date().toISOString(), reason: 'game_over' }),
      metadata: JSON.stringify({ source: 'api' }),
      occurredAt: new Date().toISOString(),
      correlationId: body.correlationId || null,
      causationId: null,
    },
  });

  // Record score verified event
  await db.eventRecord.create({
    data: {
      eventId: `evt_score_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      streamId: `ScoreAggregate-${sessionId}`,
      streamVersion: 1,
      eventType: 'ScoreVerified',
      aggregateId: sessionId,
      aggregateType: 'ScoreAggregate',
      aggregateVersion: 1,
      payload: JSON.stringify({ sessionId, gameId: session.gameId, playerId: session.playerId, score, verifiedBy: 'system', verifiedAt: new Date().toISOString() }),
      metadata: JSON.stringify({ source: 'api' }),
      occurredAt: new Date().toISOString(),
      correlationId: body.correlationId || null,
      causationId: null,
    },
  });

  // Update leaderboard
  const existingEntry = await db.leaderboardEntry.findUnique({
    where: { gameId_playerId: { gameId: session.gameId, playerId: session.playerId } },
  });

  let leaderboardUpdated = false;
  if (!existingEntry) {
    // New entry
    await db.leaderboardEntry.create({
      data: { gameId: session.gameId, playerId: session.playerId, score },
    });
    leaderboardUpdated = true;
  } else if (score > existingEntry.score) {
    // Better score
    await db.leaderboardEntry.update({
      where: { gameId_playerId: { gameId: session.gameId, playerId: session.playerId } },
      data: { score },
    });
    leaderboardUpdated = true;
  }

  // Record leaderboard updated event
  if (leaderboardUpdated) {
    await db.eventRecord.create({
      data: {
        eventId: `evt_lb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        streamId: `LeaderboardAggregate-${session.gameId}`,
        streamVersion: 1,
        eventType: 'LeaderboardUpdated',
        aggregateId: session.gameId,
        aggregateType: 'LeaderboardAggregate',
        aggregateVersion: 1,
        payload: JSON.stringify({ gameId: session.gameId, playerId: session.playerId, rank: 0, score, updatedAt: new Date().toISOString() }),
        metadata: JSON.stringify({ source: 'api' }),
        occurredAt: new Date().toISOString(),
        correlationId: body.correlationId || null,
        causationId: null,
      },
    });
  }

  // Calculate reward (10% of score as wallet credit, max 500)
  const reward = Math.min(500, Math.floor(score * 0.1));
  if (reward > 0) {
    await db.walletReadModel.upsert({
      where: { playerId: session.playerId },
      create: { playerId: session.playerId, balance: reward, currency: 'GHS' },
      update: { balance: { increment: reward } },
    });

    // Record wallet debited (reward)
    await db.eventRecord.create({
      data: {
        eventId: `evt_reward_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        streamId: `WalletAggregate-${session.playerId}`,
        streamVersion: 3,
        eventType: 'WalletDeposited',
        aggregateId: session.playerId,
        aggregateType: 'WalletAggregate',
        aggregateVersion: 3,
        payload: JSON.stringify({ playerId: session.playerId, amount: reward, currency: 'GHS', reference: 'game_reward', depositedAt: new Date().toISOString() }),
        metadata: JSON.stringify({ source: 'api', reward: true }),
        occurredAt: new Date().toISOString(),
        correlationId: body.correlationId || null,
        causationId: null,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      score,
      reward,
      leaderboardUpdated,
      sessionId,
    },
  });
}

// ─── Deploy Game (AI Studio) ──────────────────────────────────────────────

export async function POST_deployGame(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.userId || !body?.title || !body?.deployType) {
    return NextResponse.json({ ok: false, error: 'userId, title, and deployType required' }, { status: 400 });
  }

  const { userId, title, deployType } = body;
  const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let gameConfig: Record<string, unknown> = {};

  switch (deployType) {
    case 'template':
      // Deploy from existing platform template
      gameConfig = {
        template: body.template || 'liquid-tournament',
        type: 'template',
      };
      break;
    case 'upload':
      // Deploy from user's uploaded template
      if (!body.fileData) {
        return NextResponse.json({ ok: false, error: 'fileData required for upload type' }, { status: 400 });
      }
      // Check size limit (1MB)
      if (body.fileData.length > 1024 * 1024) {
        return NextResponse.json({ ok: false, error: 'File too large. Maximum size is 1MB.' }, { status: 400 });
      }
      gameConfig = {
        type: 'upload',
        fileName: body.fileName || 'game.html',
        fileSize: body.fileData.length,
        fileData: body.fileData.substring(0, 100), // Store preview only
      };
      break;
    case 'external':
      // Deploy external game link
      if (!body.externalUrl) {
        return NextResponse.json({ ok: false, error: 'externalUrl required for external type' }, { status: 400 });
      }
      try {
        new URL(body.externalUrl);
      } catch {
        return NextResponse.json({ ok: false, error: 'Invalid URL' }, { status: 400 });
      }
      gameConfig = {
        type: 'external',
        url: body.externalUrl,
      };
      break;
    default:
      return NextResponse.json({ ok: false, error: 'Invalid deployType. Use: template, upload, or external' }, { status: 400 });
  }

  // Create game in read model
  await db.gameReadModel.create({
    data: {
      gameId,
      title,
      creatorId: userId,
      status: 'published',
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  });

  // Record game published event
  await db.eventRecord.create({
    data: {
      eventId: `evt_pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      streamId: `GameAggregate-${gameId}`,
      streamVersion: 1,
      eventType: 'GamePublished',
      aggregateId: gameId,
      aggregateType: 'GameAggregate',
      aggregateVersion: 1,
      payload: JSON.stringify({ gameId, title, creatorId: userId, publishedAt: new Date().toISOString(), gameConfig }),
      metadata: JSON.stringify({ source: 'ai-studio', deployType }),
      occurredAt: new Date().toISOString(),
      correlationId: body.correlationId || null,
      causationId: null,
    },
  });

  return NextResponse.json({ ok: true, data: { gameId, title, status: 'published', deployType } });
}

// ─── Get Leaderboard ───────────────────────────────────────────────────────

export async function GET_leaderboard(req: Request) {
  const url = new URL(req.url);
  const gameId = url.searchParams.get('gameId');

  if (!gameId) {
    return NextResponse.json({ ok: false, error: 'gameId required' }, { status: 400 });
  }

  const entries = await db.leaderboardEntry.findMany({
    where: { gameId },
    orderBy: { score: 'desc' },
    take: 20,
  });

  // Assign ranks
  const ranked = entries.map((entry, index) => ({
    rank: index + 1,
    playerId: entry.playerId,
    score: entry.score,
  }));

  return NextResponse.json({ ok: true, data: ranked });
}
