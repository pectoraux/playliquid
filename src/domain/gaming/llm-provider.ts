// @ts-nocheck
/**
 * LLM Provider Abstraction
 *
 * The app never knows which AI provider it's talking to.
 * Z.ai is just one adapter. OpenAI/DeepSeek/OpenRouter work anywhere.
 *
 * Provider is selected via LLM_PROVIDER env var:
 *   "zai"     → Z.ai SDK (works in sandbox)
 *   "openai"  → OpenAI-compatible API (works anywhere with LLM_API_KEY)
 *   "template" → Template generator (always works, no external dependency)
 *   "auto"    → Try OpenAI first, then Z.ai, then template (default)
 *
 * For OpenAI-compatible providers (DeepSeek, OpenRouter, etc.):
 *   LLM_PROVIDER=openai
 *   LLM_API_KEY=sk-...
 *   LLM_BASE_URL=https://api.deepseek.com/v1  (optional, defaults to OpenAI)
 *   LLM_MODEL=deepseek-chat  (optional, defaults to gpt-4o-mini)
 */

export interface GameSpec {
  title: string;
  description: string;
  gameType: 'arcade' | 'puzzle' | 'action' | 'strategy' | 'casual';
  mechanics: string[];
  winCondition: string;
  controls: string;
  theme: string;
}

export interface LlmProviderPort {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  generateGame(prompt: string, title?: string): Promise<{ html: string; spec: GameSpec }>;
}

// ─── Game Generation Prompt ────────────────────────────────────────────────

function buildSystemPrompt(prompt: string): string {
  return `You are an expert HTML5 game developer. Create complete, self-contained HTML5 games.

Rules:
1. Output ONLY valid HTML code — no markdown, no explanations, no code fences
2. Self-contained in a single <html> document with inline CSS and JS
3. Dark theme (background: #0f172a)
4. Include score display and Game Over screen with final score
5. Under 50KB, vanilla JS only, no external dependencies
6. Responsive — must work on both desktop and mobile
7. Call window.parent.postMessage({ type: 'gameOver', score: FINAL_SCORE }, '*') when game ends
8. Start the game automatically when the page loads
9. Make it genuinely fun and matching the description

Game request: ${prompt}`;
}

function inferSpec(prompt: string, title?: string): GameSpec {
  const lower = prompt.toLowerCase();
  let gameType: GameSpec['gameType'] = 'casual';
  if (/shoot|fight|race|run|jump|breakout|snake/.test(lower)) gameType = 'action';
  else if (/puzzle|match|memory|connect|sudoku/.test(lower)) gameType = 'puzzle';
  else if (/click|tap|pop|catch|whack/.test(lower)) gameType = 'arcade';
  else if (/build|manage|plan|strategy/.test(lower)) gameType = 'strategy';

  return {
    title: title || prompt.slice(0, 50),
    description: prompt,
    gameType,
    mechanics: [prompt],
    winCondition: 'Get the highest score',
    controls: 'Mouse, touch, or keyboard',
    theme: 'dark',
  };
}

// ─── Z.ai Provider (works in sandbox) ──────────────────────────────────────

class ZaiProvider implements LlmProviderPort {
  readonly name = 'zai';

  async isAvailable(): Promise<boolean> {
    try {
      const ZAIModule = await import('z-ai-web-dev-sdk');
      const ZAI = ZAIModule.default;
      await ZAI.create();
      return true;
    } catch {
      return false;
    }
  }

  async generateGame(prompt: string, title?: string): Promise<{ html: string; spec: GameSpec }> {
    const ZAIModule = await import('z-ai-web-dev-sdk');
    const ZAI = ZAIModule.default;
    let zai: { chat: { completions: { create: (p: unknown) => Promise<{ choices: Array<{ message: { content: string } }> }> } } };

    try {
      zai = await ZAI.create() as typeof zai;
    } catch {
      zai = new ZAI({
        baseUrl: process.env.ZAI_BASE_URL || 'https://internal-api.z.ai/v1',
        apiKey: process.env.ZAI_API_KEY || 'Z.ai',
        token: process.env.ZAI_TOKEN || '',
        chatId: process.env.ZAI_CHAT_ID || '',
        userId: process.env.ZAI_USER_ID || '',
      }) as typeof zai;
    }

    const systemPrompt = buildSystemPrompt(prompt);
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: `Create: ${prompt}. Title: ${title || prompt.slice(0, 30)}` },
      ],
      thinking: { type: 'disabled' },
    });

    const html = completion.choices[0]?.message?.content || '';
    return { html, spec: inferSpec(prompt, title) };
  }
}

// ─── OpenAI-compatible Provider (works anywhere) ────────────────────────────

class OpenAIProvider implements LlmProviderPort {
  readonly name = 'openai';
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
    this.baseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    this.model = process.env.LLM_MODEL || 'gpt-4o-mini';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async generateGame(prompt: string, title?: string): Promise<{ html: string; spec: GameSpec }> {
    const systemPrompt = buildSystemPrompt(prompt);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Create: ${prompt}. Title: ${title || prompt.slice(0, 30)}` },
        ],
        max_tokens: 8000,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`LLM API error ${res.status}: ${error}`);
    }

    const data = await res.json();
    const html = data.choices?.[0]?.message?.content || '';
    return { html, spec: inferSpec(prompt, title) };
  }
}

// ─── Template Fallback Provider (always works) ──────────────────────────────

class TemplateProvider implements LlmProviderPort {
  readonly name = 'template';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generateGame(prompt: string, title?: string): Promise<{ html: string; spec: GameSpec }> {
    return { html: this.generateHtml(title || prompt, prompt), spec: inferSpec(prompt, title) };
  }

  private generateHtml(title: string, description: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;overflow:hidden}
#game{position:relative;width:100%;max-width:600px;height:500px;background:#1e293b;border-radius:12px;overflow:hidden;cursor:crosshair}
.target{position:absolute;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;transition:transform 0.1s}
.target:hover{transform:scale(1.1)}
#score{font-size:2rem;font-weight:bold;margin-bottom:0.5rem}
#timer{font-size:1.2rem;color:#06b6d4;margin-bottom:0.5rem}
#gameOver{display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.95);flex-direction:column;align-items:center;justify-content:center;z-index:10}
#gameOver h2{font-size:2rem;margin-bottom:0.5rem}
#gameOver p{font-size:1.5rem;color:#10b981;margin-bottom:1rem}
button{padding:10px 24px;background:#10b981;color:#0f172a;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:bold}
.info{margin-top:0.5rem;color:#64748b;font-size:0.8rem;text-align:center;max-width:400px;padding:0 1rem}
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
}

// ─── Provider Registry with Failover ───────────────────────────────────────

let cachedProviders: LlmProviderPort[] | null = null;

function getProviders(): LlmProviderPort[] {
  if (cachedProviders) return cachedProviders;

  const providerName = process.env.LLM_PROVIDER || 'auto';
  const providers: LlmProviderPort[] = [];

  switch (providerName) {
    case 'zai':
      providers.push(new ZaiProvider());
      providers.push(new TemplateProvider()); // fallback
      break;
    case 'openai':
      providers.push(new OpenAIProvider());
      providers.push(new TemplateProvider()); // fallback
      break;
    case 'template':
      providers.push(new TemplateProvider());
      break;
    case 'auto':
    default:
      // Try OpenAI first (if configured), then Z.ai, then template
      if (process.env.LLM_API_KEY || process.env.OPENAI_API_KEY) {
        providers.push(new OpenAIProvider());
      }
      providers.push(new ZaiProvider());
      providers.push(new TemplateProvider()); // always last as fallback
      break;
  }

  cachedProviders = providers;
  return providers;
}

// ─── Game Generation Service with Retry/Failover ──────────────────────────

export class GameGenerationService {
  constructor(private providers: LlmProviderPort[] = getProviders()) {}

  async generate(prompt: string, title?: string): Promise<{ html: string; spec: GameSpec; provider: string }> {
    let lastError: Error | null = null;

    for (const provider of this.providers) {
      try {
        // Check if provider is available
        const available = await provider.isAvailable();
        if (!available) continue;

        const result = await provider.generateGame(prompt, title);

        // Validate result
        if (result.html && result.html.length > 100) {
          // Clean markdown fences
          const cleaned = result.html
            .replace(/^```html?\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

          if (cleaned.includes('<html') || cleaned.includes('<!DOCTYPE') || cleaned.includes('<body')) {
            return { html: cleaned, spec: result.spec, provider: provider.name };
          }
        }
      } catch (e) {
        lastError = e as Error;
        console.error(`Provider ${provider.name} failed:`, (e as Error).message);
      }
    }

    // All providers failed — this should never happen since template always works
    throw lastError || new Error('All providers failed');
  }
}
