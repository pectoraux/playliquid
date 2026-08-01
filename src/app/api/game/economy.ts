/**
 * Game Economy API
 *
 * Complete end-to-end workflows for:
 * - Deposit funds to wallet
 * - Purchase playtime minutes
 * - Start/end game sessions
 * - Submit scores and update leaderboards
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Helper: get next stream version
async function nextStreamVersion(streamId: string): Promise<number> {
  const latest = await db.eventRecord.findFirst({
    where: { streamId },
    orderBy: { streamVersion: 'desc' },
    select: { streamVersion: true },
  });
  return (latest?.streamVersion ?? 0) + 1;
}

// Helper: create event record
async function createEvent(streamId: string, eventType: string, aggregateId: string, aggregateType: string, payload: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
  const version = await nextStreamVersion(streamId);
  await db.eventRecord.create({
    data: {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      streamId,
      streamVersion: version,
      eventType,
      aggregateId,
      aggregateType,
      aggregateVersion: version,
      payload: JSON.stringify(payload),
      metadata: JSON.stringify({ ...metadata, source: 'api' }),
      occurredAt: new Date().toISOString(),
      correlationId: null,
      causationId: null,
    },
  });
}

// ─── Deposit Funds ─────────────────────────────────────────────────────────

export async function POST_deposit(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.userId || !body?.amount || body.amount <= 0) {
    return NextResponse.json({ ok: false, error: 'userId and positive amount required' }, { status: 400 });
  }

  const amount = Math.floor(body.amount);
  const currency = body.currency || 'GHS';

  const wallet = await db.walletReadModel.upsert({
    where: { playerId: body.userId },
    create: { playerId: body.userId, balance: amount, currency },
    update: { balance: { increment: amount } },
  });

  await createEvent(
    `WalletAggregate-${body.userId}`,
    'WalletDeposited',
    body.userId,
    'WalletAggregate',
    { playerId: body.userId, amount, currency, reference: body.reference || 'deposit', depositedAt: new Date().toISOString() },
  );

  return NextResponse.json({ ok: true, data: { balance: wallet.balance, currency: wallet.currency } });
}

// ─── Purchase Minutes ──────────────────────────────────────────────────────

export async function POST_purchaseMinutes(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.userId || !body?.gameId || !body?.minutes || body.minutes <= 0) {
    return NextResponse.json({ ok: false, error: 'userId, gameId, and positive minutes required' }, { status: 400 });
  }

  const minutes = Math.floor(body.minutes);
  const costPerMinute = 10;
  const totalCost = minutes * costPerMinute;

  const wallet = await db.walletReadModel.findUnique({ where: { playerId: body.userId } });
  if (!wallet || wallet.balance < totalCost) {
    return NextResponse.json({
      ok: false,
      error: `Insufficient balance. Need ${totalCost} ${wallet?.currency || 'GHS'}, have ${wallet?.balance || 0}. Deposit funds to your wallet first.`,
      code: 'INSUFFICIENT_BALANCE',
    }, { status: 402 });
  }

  // Deduct from wallet
  const updatedWallet = await db.walletReadModel.update({
    where: { playerId: body.userId },
    data: { balance: { decrement: totalCost } },
  });

  // Record purchase event
  await createEvent(
    `WalletAggregate-${body.userId}`,
    'MinutesPurchased',
    body.userId,
    'WalletAggregate',
    { playerId: body.userId, gameId: body.gameId, minutes, amountPaid: totalCost, currency: wallet.currency, purchasedAt: new Date().toISOString() },
  );

  // Check for existing active session
  const existingSession = await db.sessionReadModel.findFirst({
    where: { gameId: body.gameId, playerId: body.userId, status: 'active' },
  });

  if (existingSession) {
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

  await createEvent(
    `SessionAggregate-${sessionId}`,
    'SessionStarted',
    sessionId,
    'SessionAggregate',
    { userId: body.userId, sessionId, gameId: body.gameId, startedAt: new Date().toISOString() },
  );

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

  const session = await db.sessionReadModel.findUnique({ where: { sessionId: body.sessionId } });
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
  }

  // End session
  await db.sessionReadModel.update({
    where: { sessionId: body.sessionId },
    data: { status: 'ended', endedAt: new Date().toISOString() },
  });

  await createEvent(
    `SessionAggregate-${body.sessionId}`,
    'SessionEnded',
    body.sessionId,
    'SessionAggregate',
    { userId: session.playerId, sessionId: body.sessionId, endedAt: new Date().toISOString(), reason: 'game_over' },
  );

  await createEvent(
    `ScoreAggregate-${body.sessionId}`,
    'ScoreVerified',
    body.sessionId,
    'ScoreAggregate',
    { sessionId: body.sessionId, gameId: session.gameId, playerId: session.playerId, score, verifiedBy: 'system', verifiedAt: new Date().toISOString() },
  );

  // Update leaderboard
  const existingEntry = await db.leaderboardEntry.findUnique({
    where: { gameId_playerId: { gameId: session.gameId, playerId: session.playerId } },
  });

  let leaderboardUpdated = false;
  if (!existingEntry) {
    await db.leaderboardEntry.create({
      data: { gameId: session.gameId, playerId: session.playerId, score },
    });
    leaderboardUpdated = true;
  } else if (score > existingEntry.score) {
    await db.leaderboardEntry.update({
      where: { gameId_playerId: { gameId: session.gameId, playerId: session.playerId } },
      data: { score },
    });
    leaderboardUpdated = true;
  }

  if (leaderboardUpdated) {
    await createEvent(
      `LeaderboardAggregate-${session.gameId}`,
      'LeaderboardUpdated',
      session.gameId,
      'LeaderboardAggregate',
      { gameId: session.gameId, playerId: session.playerId, score, updatedAt: new Date().toISOString() },
    );
  }

  // Calculate reward (10% of score, max 500)
  const reward = Math.min(500, Math.floor(score * 0.1));
  if (reward > 0) {
    await db.walletReadModel.upsert({
      where: { playerId: session.playerId },
      create: { playerId: session.playerId, balance: reward, currency: 'GHS' },
      update: { balance: { increment: reward } },
    });

    await createEvent(
      `WalletAggregate-${session.playerId}`,
      'WalletDeposited',
      session.playerId,
      'WalletAggregate',
      { playerId: session.playerId, amount: reward, currency: 'GHS', reference: 'game_reward', depositedAt: new Date().toISOString() },
      { reward: true },
    );
  }

  return NextResponse.json({
    ok: true,
    data: { score, reward, leaderboardUpdated, sessionId: body.sessionId },
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
      gameConfig = { template: body.template || 'liquid-tournament', type: 'template' };
      break;
    case 'upload':
      if (!body.fileData) {
        return NextResponse.json({ ok: false, error: 'fileData required for upload type' }, { status: 400 });
      }
      if (body.fileData.length > 1024 * 1024) {
        return NextResponse.json({ ok: false, error: 'File too large. Maximum size is 1MB.' }, { status: 400 });
      }
      gameConfig = { type: 'upload', fileName: body.fileName || 'game.html', fileSize: body.fileData.length };
      break;
    case 'external':
      if (!body.externalUrl) {
        return NextResponse.json({ ok: false, error: 'externalUrl required for external type' }, { status: 400 });
      }
      try { new URL(body.externalUrl); } catch {
        return NextResponse.json({ ok: false, error: 'Invalid URL' }, { status: 400 });
      }
      gameConfig = { type: 'external', url: body.externalUrl };
      break;
    default:
      return NextResponse.json({ ok: false, error: 'Invalid deployType' }, { status: 400 });
  }

  await db.gameReadModel.create({
    data: {
      gameId, title, creatorId: userId, status: 'published',
      publishedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      gameType: deployType, deployType,
    },
  });

  await createEvent(
    `GameAggregate-${gameId}`,
    'GamePublished',
    gameId,
    'GameAggregate',
    { gameId, title, creatorId: userId, publishedAt: new Date().toISOString(), gameConfig },
    { source: 'ai-studio', deployType },
  );

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

  const ranked = entries.map((entry, index) => ({
    rank: index + 1,
    playerId: entry.playerId,
    score: entry.score,
  }));

  return NextResponse.json({ ok: true, data: ranked });
}
