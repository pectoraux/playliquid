/**
 * Feed API — returns games for the vertical feed (TikTok-style).
 *
 * The feed is personalized and infinite. Games are ranked by:
 * - Recently published
 * - Play count
 * - Creator popularity
 * - Random discovery factor
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || '';
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  // Get published games with stats
  const games = await db.gameReadModel.findMany({
    where: { status: 'published' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    skip: offset,
  });

  // Get play counts and like counts for these games
  const gameIds = games.map(g => g.gameId);
  const leaderboardCounts = await db.leaderboardEntry.groupBy({
    by: ['gameId'],
    where: { gameId: { in: gameIds } },
    _count: { playerId: true },
    _max: { score: true },
  });

  const countMap = new Map(leaderboardCounts.map(l => [l.gameId, {
    plays: l._count.playerId,
    topScore: l._max.score || 0,
  }]));

  // Build feed items
  const feedItems = games.map(g => {
    const stats = countMap.get(g.gameId) || { plays: 0, topScore: 0 };
    return {
      id: g.gameId,
      title: g.title,
      creatorId: g.creatorId,
      description: g.description || g.title,
      thumbnail: '🎮',
      gameType: g.gameType || 'builtin',
      playCount: stats.plays,
      topScore: stats.topScore,
      likeCount: 0, // TODO: when likes table exists
      commentCount: 0, // TODO: when comments table exists
      publishedAt: g.publishedAt || g.createdAt,
      contentUrl: g.gameContent ? `/api/game/content/${g.gameId}` : null,
      isAiGenerated: g.gameType === 'ai-generated',
    };
  });

  // Also include builtin games in the feed
  const builtinGames = [
    { id: 'liquid-tournament', title: 'Liquid Tournament', description: 'Test your reflexes — tap targets fast!' },
    { id: 'bubble-pop', title: 'Bubble Pop Mania', description: 'Pop bubbles before they float away!' },
    { id: 'neon-runner', title: 'Neon Runner', description: 'Jump over obstacles in the neon city!' },
    { id: 'cosmic-puzzle', title: 'Cosmic Puzzle', description: 'Match all cosmic pairs!' },
  ].map(g => ({
    id: g.id,
    title: g.title,
    creatorId: 'playliquid',
    description: g.description,
    thumbnail: '🎮',
    gameType: 'builtin',
    playCount: 0,
    topScore: 0,
    likeCount: 0,
    commentCount: 0,
    publishedAt: new Date().toISOString(),
    contentUrl: null,
    isAiGenerated: false,
  }));

  // Mix builtin and AI-generated, shuffle for discovery
  const allItems = [...feedItems, ...builtinGames];
  const shuffled = allItems.sort(() => Math.random() - 0.5);

  return NextResponse.json({
    ok: true,
    data: {
      items: shuffled,
      offset: offset + shuffled.length,
      hasMore: games.length === 20,
    },
  });
}
