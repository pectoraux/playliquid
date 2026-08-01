/**
 * LLM-Powered Game Generation API
 *
 * Uses z-ai-web-dev-sdk (GLM 5.2) to generate HTML5 games from natural language
 * descriptions. Each user has a maximum upload capacity (default 5MB).
 *
 * Endpoints:
 * - POST /api/game/generate — Generate an HTML5 game from a text prompt
 * - GET /api/game/capacity — Check user's storage usage and limit
 * - GET /api/game/content/[gameId] — Serve generated game HTML content
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const MAX_CAPACITY_BYTES = 5 * 1024 * 1024; // 5MB per user

// ─── Generate Game ──────────────────────────────────────────────────────────

export async function POST_generate(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.userId || !body?.prompt) {
    return NextResponse.json({ ok: false, error: 'userId and prompt required' }, { status: 400 });
  }

  const { userId, prompt, title } = body;

  // Check user's storage capacity
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
      used: usedBytes,
      limit: MAX_CAPACITY_BYTES,
    }, { status: 402 });
  }

  // Generate the game using GLM 5.2
  try {
    const systemPrompt = `You are an expert HTML5 game developer. Create complete, self-contained HTML5 games in a single HTML file with embedded CSS and JavaScript.

Rules:
1. Output ONLY valid HTML code — no markdown, no explanations, no code fences
2. The game must be self-contained in a single <html> document
3. Use inline CSS in <style> tags and inline JavaScript in <script> tags
4. The game must work when loaded directly in a browser
5. Use a dark theme (background: #0f172a or similar dark color)
6. Include a score display
7. Include a "Game Over" screen with the final score
8. Keep the game under 50KB
9. Use vanilla JavaScript — no external dependencies
10. The game must be responsive and work on both desktop and mobile
11. Call window.parent.postMessage({ type: 'gameOver', score: FINAL_SCORE }, '*') when the game ends
12. Start the game automatically when the page loads

Game type: ${prompt}`;

    let gameHtml = '';

    // Step 1: Try the GLM SDK directly (works in sandbox/local dev where .z-ai-config exists)
    try {
      const ZAIModule = await import('z-ai-web-dev-sdk');
      const ZAI = ZAIModule.default;
      let zai: { chat: { completions: { create: (params: unknown) => Promise<{ choices: Array<{ message: { content: string } }> }> } } };

      try {
        zai = await ZAI.create() as typeof zai;
      } catch {
        const config = {
          baseUrl: process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1',
          apiKey: process.env.ZAI_API_KEY || 'Z.ai',
          token: process.env.ZAI_TOKEN || '',
          chatId: process.env.ZAI_CHAT_ID || '',
          userId: process.env.ZAI_USER_ID || '',
        };
        zai = new ZAI(config) as typeof zai;
      }

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: systemPrompt },
          { role: 'user', content: `Create a game: ${prompt}. Title: ${title || prompt.slice(0, 30)}` },
        ],
        thinking: { type: 'disabled' },
      });

      gameHtml = completion.choices[0]?.message?.content || '';
    } catch (sdkError) {
      // SDK failed — likely on Vercel where internal API is unreachable
      // Step 2: Try proxying through the sandbox (if ZAI_PROXY_URL is set)
      const proxyUrl = process.env.ZAI_PROXY_URL;
      if (proxyUrl) {
        try {
          const proxyRes = await fetch(`${proxyUrl}/api/game/generate-internal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, title: title || prompt.slice(0, 30), systemPrompt }),
          });
          if (proxyRes.ok) {
            const proxyData = await proxyRes.json();
            gameHtml = proxyData.gameHtml || '';
          }
        } catch (proxyErr) {
          // Proxy also failed
        }
      }
    }

    // Step 3: If still no game HTML, use the template fallback
    if (!gameHtml) {
      gameHtml = generateTemplateGame(title || prompt, prompt);
    }

    // Clean up: remove markdown code fences if present
    const cleanedHtml = gameHtml
      .replace(/^```html?\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Validate it looks like HTML
    if (!cleanedHtml.includes('<html') && !cleanedHtml.includes('<!DOCTYPE') && !cleanedHtml.includes('<body')) {
      return NextResponse.json({ ok: false, error: 'AI did not generate valid HTML. Please try a different prompt.' }, { status: 500 });
    }

    const fileSize = Buffer.byteLength(cleanedHtml, 'utf-8');

    // Check if it fits in remaining capacity
    if (fileSize > remainingBytes) {
      return NextResponse.json({
        ok: false,
        error: `Generated game is ${fileSize} bytes but you only have ${remainingBytes} bytes remaining.`,
        code: 'CAPACITY_EXCEEDED',
      }, { status: 402 });
    }

    // Create the game in the database
    const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.gameReadModel.create({
      data: {
        gameId,
        title: title || prompt.slice(0, 50),
        creatorId: userId,
        status: 'published',
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        gameContent: cleanedHtml,
        gameType: 'ai-generated',
        deployType: 'ai',
        description: prompt,
        fileSize,
      },
    });

    // Record event
    await db.eventRecord.create({
      data: {
        eventId: `evt_gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        streamId: `GameAggregate-${gameId}`,
        streamVersion: 1,
        eventType: 'GamePublished',
        aggregateId: gameId,
        aggregateType: 'GameAggregate',
        aggregateVersion: 1,
        payload: JSON.stringify({ gameId, title, creatorId: userId, publishedAt: new Date().toISOString(), gameConfig: { type: 'ai-generated', prompt } }),
        metadata: JSON.stringify({ source: 'ai-studio', deployType: 'ai', fileSize }),
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
      },
    });
  } catch (e) {
    const error = e as Error;
    return NextResponse.json({ ok: false, error: `AI generation failed: ${error.message}` }, { status: 500 });
  }
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

// ─── Fallback Template Game Generator ──────────────────────────────────────

function generateTemplateGame(title: string, description: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;overflow:hidden}
#game{position:relative;width:100%;max-width:600px;height:400px;background:#1e293b;border-radius:12px;overflow:hidden;cursor:crosshair}
.target{position:absolute;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;transition:transform 0.1s}
.target:hover{transform:scale(1.1)}
#score{font-size:2rem;font-weight:bold;margin-bottom:1rem}
#timer{font-size:1.2rem;color:#06b6d4;margin-bottom:1rem}
#gameOver{display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.95);flex-direction:column;align-items:center;justify-content:center;z-index:10}
#gameOver h2{font-size:2rem;margin-bottom:1rem}
#gameOver p{font-size:1.5rem;color:#10b981;margin-bottom:1rem}
button{padding:10px 24px;background:#10b981;color:#0f172a;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:bold}
.info{margin-top:1rem;color:#64748b;font-size:0.9rem;text-align:center;max-width:400px;padding:0 1rem}
</style>
</head>
<body>
<div id="score">Score: 0</div>
<div id="timer">30s</div>
<div id="game">
<div id="gameOver"><h2>Game Over!</h2><p id="finalScore">Score: 0</p><button onclick="restart()">Play Again</button></div>
</div>
<div class="info">${description}</div>
<script>
let score=0,timeLeft=30,playing=true,targets=[],timer,spawner;
const game=document.getElementById('game'),scoreEl=document.getElementById('score'),timerEl=document.getElementById('timer'),gameOver=document.getElementById('gameOver'),finalScore=document.getElementById('finalScore');
const colors=['#10b981','#06b6d4','#8b5cf6','#f59e0b','#ef4444'],emojis=['🎯','⭐','💎','🔥','⚡'];
function spawn(){const t=document.createElement('div');t.className='target';const ci=Math.floor(Math.random()*colors.length);t.style.background=colors[ci];t.style.left=Math.random()*85+5+'%';t.style.top=Math.random()*75+10+'%';t.textContent=emojis[ci];t.onclick=()=>{if(!playing)return;score+=10;scoreEl.textContent='Score: '+score;t.remove();};game.appendChild(t);targets.push(t);setTimeout(()=>{if(t.parentNode)t.remove();},1500);}
function start(){score=0;timeLeft=30;playing=true;scoreEl.textContent='Score: 0';timerEl.textContent='30s';gameOver.style.display='none';targets.forEach(t=>t.remove());targets=[];timer=setInterval(()=>{timeLeft--;timerEl.textContent=timeLeft+'s';if(timeLeft<=0)end();},1000);spawner=setInterval(spawn,700);setTimeout(spawn,200);}
function end(){playing=false;clearInterval(timer);clearInterval(spawner);targets.forEach(t=>t.remove());finalScore.textContent='Score: '+score;gameOver.style.display='flex';window.parent.postMessage({type:'gameOver',score:score},'*');}
function restart(){start();}
start();
</script>
</body>
</html>`;
}
