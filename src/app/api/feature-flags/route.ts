import { NextResponse } from 'next/server';
import { getContainer } from '@/infrastructure/di/composition-root';
import { TOKENS } from '@/infrastructure/di/tokens';
import type { FeatureFlagService } from '@/infrastructure/feature-flags/feature-flags';

export const dynamic = 'force-dynamic';

export async function GET() {
  const container = await getContainer();
  const flags = container.resolve<FeatureFlagService>(TOKENS.FeatureFlagService);
  return NextResponse.json({ flags: flags.listFlags() });
}

export async function POST(req: Request) {
  const container = await getContainer();
  const flags = container.resolve<FeatureFlagService>(TOKENS.FeatureFlagService);
  const body = await req.json().catch(() => null);

  if (!body || !body.action) {
    return NextResponse.json({ ok: false, error: 'Missing action' }, { status: 400 });
  }

  if (body.action === 'evaluate') {
    if (!body.key) {
      return NextResponse.json({ ok: false, error: 'Missing key' }, { status: 400 });
    }
    const result = flags.evaluate(body.key, body.context ?? {});
    return NextResponse.json(result);
  }

  if (body.action === 'set') {
    if (!body.flag || !body.flag.key) {
      return NextResponse.json({ ok: false, error: 'Missing flag or flag.key' }, { status: 400 });
    }
    await flags.setFlag(body.flag);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'delete') {
    if (!body.key) {
      return NextResponse.json({ ok: false, error: 'Missing key' }, { status: 400 });
    }
    await flags.deleteFlag(body.key);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
}
