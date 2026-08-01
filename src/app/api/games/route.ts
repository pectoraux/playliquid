import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const where: Record<string, unknown> = { status: 'published' };
  if (search) where.title = { contains: search, mode: 'insensitive' };

  const games = await db.gameReadModel.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
  return NextResponse.json({ ok: true, data: games.map(g => ({ id: g.gameId, title: g.title, creatorId: g.creatorId, status: g.status, publishedAt: g.publishedAt, thumbnail: '🎮' })) });
}
