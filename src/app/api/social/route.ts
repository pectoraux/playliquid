/**
 * Social API — likes, comments, follows, and personalized feed.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// ─── Like/Unlike a game ────────────────────────────────────────────────────

export async function POST_like(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.userId || !body?.gameId) {
    return NextResponse.json({ ok: false, error: 'userId and gameId required' }, { status: 400 });
  }

  const existing = await db.gameLike.findUnique({
    where: { gameId_userId: { gameId: body.gameId, userId: body.userId } },
  });

  if (existing) {
    await db.gameLike.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, data: { liked: false } });
  }

  await db.gameLike.create({
    data: { gameId: body.gameId, userId: body.userId },
  });
  return NextResponse.json({ ok: true, data: { liked: true } });
}

export async function GET_likes(req: Request) {
  const url = new URL(req.url);
  const gameId = url.searchParams.get('gameId');
  const userId = url.searchParams.get('userId');

  if (!gameId) {
    return NextResponse.json({ ok: false, error: 'gameId required' }, { status: 400 });
  }

  const count = await db.gameLike.count({ where: { gameId } });
  let liked = false;
  if (userId) {
    const existing = await db.gameLike.findUnique({
      where: { gameId_userId: { gameId, userId } },
    });
    liked = !!existing;
  }

  return NextResponse.json({ ok: true, data: { count, liked } });
}

// ─── Comments ──────────────────────────────────────────────────────────────

export async function GET_comments(req: Request) {
  const url = new URL(req.url);
  const gameId = url.searchParams.get('gameId');

  if (!gameId) {
    return NextResponse.json({ ok: false, error: 'gameId required' }, { status: 400 });
  }

  const comments = await db.gameComment.findMany({
    where: { gameId, parentId: null },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 50,
  });

  return NextResponse.json({ ok: true, data: comments });
}

export async function POST_comment(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.userId || !body?.gameId || !body?.content?.trim()) {
    return NextResponse.json({ ok: false, error: 'userId, gameId, and content required' }, { status: 400 });
  }

  const comment = await db.gameComment.create({
    data: {
      gameId: body.gameId,
      userId: body.userId,
      content: body.content.trim(),
      parentId: body.parentId || null,
    },
  });

  return NextResponse.json({ ok: true, data: comment });
}

// ─── Follow/Unfollow ───────────────────────────────────────────────────────

export async function POST_follow(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.followerId || !body?.followingId) {
    return NextResponse.json({ ok: false, error: 'followerId and followingId required' }, { status: 400 });
  }

  if (body.followerId === body.followingId) {
    return NextResponse.json({ ok: false, error: 'Cannot follow yourself' }, { status: 400 });
  }

  const existing = await db.userFollow.findUnique({
    where: { followerId_followingId: { followerId: body.followerId, followingId: body.followingId } },
  });

  if (existing) {
    await db.userFollow.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, data: { following: false } });
  }

  await db.userFollow.create({
    data: { followerId: body.followerId, followingId: body.followingId },
  });
  return NextResponse.json({ ok: true, data: { following: true } });
}

export async function GET_followers(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 });
  }

  const [followers, following] = await Promise.all([
    db.userFollow.count({ where: { followingId: userId } }),
    db.userFollow.count({ where: { followerId: userId } }),
  ]);

  return NextResponse.json({ ok: true, data: { followers, following } });
}
