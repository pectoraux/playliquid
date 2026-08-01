import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.prompt || !body?.systemPrompt) {
    return NextResponse.json({ ok: false, error: 'prompt and systemPrompt required' }, { status: 400 });
  }

  try {
    const ZAIModule = await import('z-ai-web-dev-sdk');
    const ZAI = ZAIModule.default;
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: body.systemPrompt },
        { role: 'user', content: `Create a game: ${body.prompt}. Title: ${body.title || body.prompt.slice(0, 30)}` },
      ],
      thinking: { type: 'disabled' },
    });

    const gameHtml = completion.choices[0]?.message?.content || '';
    return NextResponse.json({ ok: true, gameHtml });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
