/**
 * LLM-Powered Game Generation API
 *
 * Uses the LlmProviderPort abstraction — the app never knows which AI provider
 * it's talking to. Provider is selected via LLM_PROVIDER env var.
 *
 * Endpoints:
 * - POST /api/game/generate — Generate an HTML5 game from a text prompt
 * - GET /api/game/capacity — Check user's storage usage and limit
 * - GET /api/game/content/[gameId] — Serve generated game HTML content
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { GameGenerationService } from '@/domain/gaming/llm-provider';

const MAX_CAPACITY_BYTES = 5 * 1024 * 1024; // 5MB per user

// ─── Generate Game ──────────────────────────────────────────────────────────

export async function POST_generate(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.userId || !body?.prompt) {
    return NextResponse.json({ ok: false, error: 'userId and prompt required' }, { status: 400 });
  }

  const { userId, prompt, title } = body;

  // Check capacity
  const userGames = await db.gameReadModel.findMany({
    where: { creatorId: userId, gameType: 'ai-generated' },
    select: { fileSize: true },
  });
  const usedBytes = userGames.reduce((sum, g) => sum + g.fileSize, 0);
  const remainingBytes = MAX_CAPACITY_BYTES - usedBytes;

  if (remainingBytes <= 0) {
    return NextResponse.json({
      ok: false,
      error: 'Storage capacity exceeded. Delete some games to free up space.',
      code: 'CAPACITY_EXCEEDED',
    }, { status: 402 });
  }

  // Generate via LLM provider abstraction
  const service = new GameGenerationService();
  const result = await service.generate(prompt, title);

  let gameHtml = result.html;

  // Clean up markdown fences if present
  gameHtml = gameHtml
    .replace(/^```html?\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Validate HTML
  if (!gameHtml.includes('<html') && !gameHtml.includes('<!DOCTYPE') && !gameHtml.includes('<body')) {
    return NextResponse.json({ ok: false, error: 'AI did not generate valid HTML. Please try a different prompt.' }, { status: 500 });
  }

  const fileSize = Buffer.byteLength(gameHtml, 'utf-8');

  if (fileSize > remainingBytes) {
    return NextResponse.json({
      ok: false,
      error: `Generated game is ${fileSize} bytes but you only have ${remainingBytes} bytes remaining.`,
      code: 'CAPACITY_EXCEEDED',
    }, { status: 402 });
  }

  // Create game in database
  const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.gameReadModel.create({
    data: {
      gameId,
      title: title || prompt.slice(0, 50),
      creatorId: userId,
      status: 'published',
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      gameContent: gameHtml,
      gameType: 'ai-generated',
      deployType: 'ai',
      description: prompt,
      fileSize,
    },
  });

  // Record event
  const streamId = `GameAggregate-${gameId}`;
  const latestEvent = await db.eventRecord.findFirst({
    where: { streamId },
    orderBy: { streamVersion: 'desc' },
    select: { streamVersion: true },
  });
  const version = (latestEvent?.streamVersion ?? 0) + 1;

  await db.eventRecord.create({
    data: {
      eventId: `evt_gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      streamId,
      streamVersion: version,
      eventType: 'GamePublished',
      aggregateId: gameId,
      aggregateType: 'GameAggregate',
      aggregateVersion: version,
      payload: JSON.stringify({ gameId, title, creatorId: userId, publishedAt: new Date().toISOString() }),
      metadata: JSON.stringify({ source: 'ai-studio', provider: result.provider, fileSize }),
      occurredAt: new Date().toISOString(),
      correlationId: null,
      causationId: null,
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      gameId,
      title: title || prompt.slice(0, 50),
      fileSize,
      capacityUsed: usedBytes + fileSize,
      capacityLimit: MAX_CAPACITY_BYTES,
      capacityRemaining: MAX_CAPACITY_BYTES - usedBytes - fileSize,
      previewUrl: `/api/game/content/${gameId}`,
      generatedBy: result.provider,
    },
  });
}

// ─── Get Capacity ──────────────────────────────────────────────────────────

export async function GET_capacity(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 });
  }

  const userGames = await db.gameReadModel.findMany({
    where: { creatorId: userId, gameType: 'ai-generated' },
    select: { fileSize: true, gameId: true, title: true },
  });

  const usedBytes = userGames.reduce((sum, g) => sum + g.fileSize, 0);

  return NextResponse.json({
    ok: true,
    data: {
      used: usedBytes,
      limit: MAX_CAPACITY_BYTES,
      remaining: MAX_CAPACITY_BYTES - usedBytes,
      gameCount: userGames.length,
      games: userGames.map(g => ({ gameId: g.gameId, title: g.title, size: g.fileSize })),
    },
  });
}

// ─── Serve Game Content ──────────────────────────────────────────────────────

export async function GET_content(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/');
  const gameId = parts[parts.length - 1];

  if (!gameId) {
    return new NextResponse('Game ID required', { status: 400 });
  }

  const game = await db.gameReadModel.findUnique({ where: { gameId } });

  if (!game || !game.gameContent) {
    return new NextResponse('Game not found', { status: 404 });
  }

  return new NextResponse(game.gameContent, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
