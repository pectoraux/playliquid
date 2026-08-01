'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useSession } from '@/lib/auth/use-session';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles, Rocket, Trash2, ExternalLink, Wand2, HardDrive } from 'lucide-react';

const EXAMPLE_PROMPTS = [
  'A simple whack-a-mole game where moles pop up from holes and you tap them',
  'A memory card game with emoji pairs on a 4x4 grid',
  'A snake game where you eat food and grow longer',
  'A brick breaker game with a paddle and bouncing ball',
];

export default function AiStudioPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [capacity, setCapacity] = useState<{ used: number; limit: number; remaining: number; gameCount: number; games: Array<{ gameId: string; title: string; size: number }> } | null>(null);
  const [generatedGame, setGeneratedGame] = useState<{ gameId: string; title: string; previewUrl: string; capacityRemaining: number; generatedBy?: string } | null>(null);

  useEffect(() => {
    if (session) loadCapacity();
  }, [session]);

  async function loadCapacity() {
    if (!session) return;
    try {
      const res = await fetch(`/api/game/capacity?userId=${session.userId}`);
      const data = await res.json();
      if (data.ok) setCapacity(data.data);
    } catch { /* ignore */ }
  }

  async function handleGenerate() {
    if (!session) return;
    if (!prompt.trim()) {
      toast({ title: 'Prompt required', description: 'Describe the game you want to create', variant: 'destructive' });
      return;
    }
    if ((capacity?.remaining ?? 0) <= 0) {
      toast({ title: 'Storage full', description: 'Delete some games to free up space', variant: 'destructive' });
      return;
    }

    setGenerating(true);
    setGeneratedGame(null);
    try {
      const res = await fetch('/api/game/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.userId,
          prompt: prompt.trim(),
          title: title.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setGeneratedGame({
          gameId: data.data.gameId,
          title: data.data.title,
          previewUrl: data.data.previewUrl,
          capacityRemaining: data.data.capacityRemaining,
          generatedBy: data.data.generatedBy,
        });
        const genBy = data.data.generatedBy === 'glm' ? 'GLM 5.2' : 'template engine';
        toast({ title: 'Game generated!', description: `"${data.data.title}" created by ${genBy}.` });
        loadCapacity(); // Refresh capacity
      } else {
        toast({ title: 'Generation failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network error', description: 'Could not reach AI service', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(gameId: string) {
    try {
      const { db } = await import('@/lib/db');
      // Note: In production this would be an API call, but for now we'll use a simple fetch
      toast({ title: 'Delete', description: 'Game deletion will be available in the next update.' });
    } catch { /* ignore */ }
  }

  const usedPercent = capacity ? (capacity.used / capacity.limit) * 100 : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/15">
          <Sparkles className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">AI Game Studio</h1>
          <p className="text-sm text-zinc-500">Create HTML5 games with AI — powered by GLM 5.2</p>
        </div>
      </div>

      {/* Storage Capacity */}
      {capacity && (
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <HardDrive className="h-5 w-5 text-cyan-400" />
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">Storage: {(capacity.used / 1024).toFixed(1)} KB / {(capacity.limit / 1024 / 1024).toFixed(0)} MB</span>
                  <span className="text-zinc-500">{capacity.gameCount} games</span>
                </div>
                <Progress value={usedPercent} className="mt-2 h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generation Form */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="p-6 space-y-4">
          <div>
            <Label htmlFor="title">Game Title (optional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Awesome Game"
              className="mt-1 border-white/10 bg-white/[0.03] text-zinc-100"
            />
          </div>

          <div>
            <Label htmlFor="prompt">Describe your game</Label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A simple whack-a-mole game where moles pop up from holes and you tap them..."
              rows={4}
              className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Example Prompts */}
          <div>
            <p className="mb-2 text-xs text-zinc-500">Try these examples:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(ex)}
                  className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-400 transition hover:border-emerald-500/30 hover:text-emerald-300"
                >
                  {ex.slice(0, 40)}...
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating game with AI...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-5 w-5" />
                Generate Game
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Game Result */}
      {generatedGame && (
        <Card className="border-emerald-500/30 bg-emerald-500/[0.03]">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
                <Rocket className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <h2 className="font-bold text-zinc-100">{generatedGame.title}</h2>
                <p className="text-sm text-zinc-500">
                  Game generated and deployed successfully!
                  {generatedGame.generatedBy === 'glm' ? (
                    <Badge className="ml-2 bg-emerald-500/20 text-emerald-300">GLM 5.2</Badge>
                  ) : (
                    <Badge className="ml-2 bg-amber-500/20 text-amber-300">Template (GLM unavailable on this server)</Badge>
                  )}
                </p>
              </div>
            </div>

            {/* Preview */}
            <div className="overflow-hidden rounded-xl border border-white/10">
              <iframe
                src={generatedGame.previewUrl}
                className="aspect-video w-full"
                title={generatedGame.title}
                sandbox="allow-scripts"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button asChild className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
                <a href={`/play/${generatedGame.gameId}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Play Game
                </a>
              </Button>
              <Button asChild variant="outline" className="border-white/10">
                <a href={`/games`}>View in Catalog</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Previously Generated Games */}
      {capacity && capacity.games.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-400">Your Generated Games</h2>
          <div className="space-y-2">
            {capacity.games.map((g) => (
              <Card key={g.gameId} className="border-white/5 bg-white/[0.02]">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium text-zinc-100">{g.title}</div>
                    <div className="text-xs text-zinc-500">{(g.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline" className="border-white/10">
                      <a href={`/play/${g.gameId}`}>Play</a>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="border-white/10">
                      <a href={`/api/game/content/${g.gameId}`} target="_blank">Preview</a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
