import { getDemoData } from '@/lib/demo/demo-data';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const role = url.searchParams.get('role') || 'player';
  const data = getDemoData(role);
  return NextResponse.json({ ok: true, data });
}
