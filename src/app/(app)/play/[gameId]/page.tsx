'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Home, Trophy, Wallet, Clock, Play, Zap, RotateCcw, CheckCircle, TrendingUp } from 'lucide-react';
import { useSession } from '@/lib/auth/use-session';
import { useToast } from '@/hooks/use-toast';

const GAMES: Record<string, { title: string; description: string }> = {
  'liquid-tournament': { title: 'Liquid Tournament', description: 'Test your reflexes — tap targets fast!' },
  'bubble-pop': { title: 'Bubble Pop Mania', description: 'Pop bubbles before they float away!' },
  'neon-runner': { title: 'Neon Runner', description: 'Jump over obstacles in the neon city!' },
  'cosmic-puzzle': { title: 'Cosmic Puzzle', description: 'Match all cosmic pairs!' },
};

type GameState = 'checking' | 'needPurchase' | 'playing' | 'gameOver';
type GameMode = 'builtin' | 'catalog';

export default function GamePlayerPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const { session } = useSession();
  const { toast } = useToast();
  const [gameState, setGameState] = useState<GameState>('checking');
  const [sessionData, setSessionData] = useState<{ sessionId: string; minutesRemaining: number; walletBalance: number; walletCurrency: string } | null>(null);
  const [score, setScore] = useState(0);
  const [reward, setReward] = useState(0);
  const [leaderboardUpdated, setLeaderboardUpdated] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  const isBuiltin = GAMES[gameId] !== undefined;
  const gameTitle = GAMES[gameId]?.title || gameId;
  const gameDescription = GAMES[gameId]?.description || 'Play this game';

  // Check session status on mount
  useEffect(() => {
    if (!session) return;
    checkSessionStatus();
  }, [session]);

  async function checkSessionStatus() {
    if (!session) return;
    try {
      const res = await fetch(`/api/game/session-status?userId=${session.userId}&gameId=${gameId}`);
      const data = await res.json();
      if (data.ok) {
        setSessionData(data.data);
        if (data.data.hasActiveSession && data.data.minutesRemaining > 0) {
          setGameState('playing');
        } else {
          setGameState('needPurchase');
        }
      }
    } catch {
      setGameState('needPurchase');
    }
  }

  async function handlePurchase() {
    if (!session) return;
    setPurchasing(true);
    try {
      const res = await fetch('/api/game/purchase-minutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.userId, gameId, minutes: 5 }),
      });
      const data = await res.json();
      if (data.ok) {
        setSessionData({
          sessionId: data.data.sessionId,
          minutesRemaining: data.data.minutesRemaining,
          walletBalance: data.data.walletBalance,
          walletCurrency: 'GHS',
        });
        setGameState('playing');
        toast({ title: 'Session purchased!', description: `5 minutes purchased. ${data.data.walletBalance} GHS remaining.` });
      } else {
        if (data.code === 'INSUFFICIENT_BALANCE') {
          toast({ title: 'Insufficient balance', description: 'Deposit funds to your wallet first.', variant: 'destructive' });
        } else {
          toast({ title: 'Purchase failed', description: data.error, variant: 'destructive' });
        }
      }
    } catch {
      toast({ title: 'Network error', description: 'Could not reach server', variant: 'destructive' });
    } finally {
      setPurchasing(false);
    }
  }

  async function handleGameOver(finalScore: number) {
    setScore(finalScore);
    if (!sessionData?.sessionId) return;

    try {
      const res = await fetch('/api/game/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionData.sessionId, score: finalScore }),
      });
      const data = await res.json();
      if (data.ok) {
        setReward(data.data.reward);
        setLeaderboardUpdated(data.data.leaderboardUpdated);
      }
    } catch {
      // Score still recorded locally
    }
    setGameState('gameOver');
  }

  if (gameState === 'checking') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="text-zinc-400 hover:text-zinc-200">
          <Link href="/play"><ArrowLeft className="mr-2 h-4 w-4" />Back to Games</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild className="text-zinc-400 hover:text-zinc-200">
          <Link href="/home"><Home className="mr-2 h-4 w-4" />Home</Link>
        </Button>
      </div>

      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">{gameTitle}</h1>
        <p className="text-sm text-zinc-500">{gameDescription}</p>
      </div>

      {/* Need Purchase State */}
      {gameState === 'needPurchase' && (
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Wallet className="h-12 w-12 text-amber-400" />
            <h2 className="mt-4 text-xl font-bold text-zinc-100">Purchase Playtime</h2>
            <p className="mt-2 max-w-md text-sm text-zinc-400">
              You need playtime to play this game. Purchase 5 minutes for 50 GHS.
            </p>
            <div className="mt-4 flex gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">{sessionData?.walletBalance ?? 0}</div>
                <div className="text-xs text-zinc-500">Wallet Balance (GHS)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-400">5 min</div>
                <div className="text-xs text-zinc-500">Playtime</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-400">50 GHS</div>
                <div className="text-xs text-zinc-500">Cost</div>
              </div>
            </div>
            <Button
              onClick={handlePurchase}
              disabled={purchasing}
              className="mt-6 bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              size="lg"
            >
              {purchasing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Zap className="mr-2 h-5 w-5" />}
              Purchase & Play
            </Button>
            {(sessionData?.walletBalance ?? 0) < 50 && (
              <p className="mt-3 text-sm text-amber-400">
                Insufficient balance. <Link href="/wallet" className="underline">Deposit funds</Link> to your wallet.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Playing State */}
      {gameState === 'playing' && isBuiltin && (
        <GameWrapper gameId={gameId} onGameOver={handleGameOver} sessionData={sessionData} />
      )}

      {gameState === 'playing' && !isBuiltin && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <iframe
              src={`/api/game/content/${gameId}`}
              className="aspect-video w-full"
              title={gameTitle}
              sandbox="allow-scripts"
            />
          </div>
          <Button
            onClick={() => handleGameOver(sessionData?.minutesRemaining ? 100 : 50)}
            className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
          >
            End Game & Submit Score
          </Button>
        </div>
      )}

      {/* Game Over State */}
      {gameState === 'gameOver' && (
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Trophy className="h-12 w-12 text-amber-400" />
            <h2 className="mt-4 text-2xl font-bold text-zinc-100">Game Over!</h2>
            <div className="mt-6 flex gap-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-400">{score}</div>
                <div className="text-sm text-zinc-500">Final Score</div>
              </div>
              {reward > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold text-amber-400">+{reward}</div>
                  <div className="text-sm text-zinc-500">Reward (GHS)</div>
                </div>
              )}
            </div>
            {leaderboardUpdated && (
              <Badge className="mt-4 bg-emerald-500/20 text-emerald-300">
                <TrendingUp className="mr-1 h-3 w-3" /> Leaderboard updated!
              </Badge>
            )}
            <div className="mt-8 flex gap-3">
              <Button onClick={checkSessionStatus} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
                <RotateCcw className="mr-2 h-4 w-4" /> Play Again
              </Button>
              <Button asChild variant="outline" className="border-white/10">
                <Link href="/play">Back to Games</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Game Wrapper ──────────────────────────────────────────────────────────

function GameWrapper({ gameId, onGameOver, sessionData }: { gameId: string; onGameOver: (score: number) => void; sessionData: { sessionId: string; minutesRemaining: number } | null }) {
  // Dynamic import the actual game component
  if (gameId === 'liquid-tournament') return <LiquidTournamentGame onGameOver={onGameOver} sessionData={sessionData} />;
  if (gameId === 'bubble-pop') return <BubblePopGame onGameOver={onGameOver} sessionData={sessionData} />;
  if (gameId === 'neon-runner') return <NeonRunnerGame onGameOver={onGameOver} sessionData={sessionData} />;
  if (gameId === 'cosmic-puzzle') return <CosmicPuzzleGame onGameOver={onGameOver} sessionData={sessionData} />;

  return (
    <Card className="border-white/5 bg-white/[0.02]">
      <CardContent className="flex flex-col items-center py-12 text-center">
        <p className="text-zinc-400">Unknown game: {gameId}</p>
      </CardContent>
    </Card>
  );
}

// ─── Liquid Tournament Game ────────────────────────────────────────────────

function LiquidTournamentGame({ onGameOver, sessionData }: { onGameOver: (score: number) => void; sessionData: { sessionId: string; minutesRemaining: number } | null }) {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [targets, setTargets] = useState<Array<{ id: number; x: number; y: number; color: string }>>([]);
  const [playing, setPlaying] = useState(true);
  const targetId = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (spawnerRef.current) clearInterval(spawnerRef.current);
          setPlaying(false);
          onGameOver(score);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    spawnerRef.current = setInterval(() => {
      const id = targetId.current++;
      const colors = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b'];
      setTargets((prev) => [...prev, { id, x: Math.random() * 80 + 10, y: Math.random() * 70 + 15, color: colors[Math.floor(Math.random() * colors.length)] }]);
      setTimeout(() => setTargets((prev) => prev.filter((t) => t.id !== id)), 1500);
    }, 700);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (spawnerRef.current) clearInterval(spawnerRef.current);
    };
  }, [score, onGameOver]);

  function hit(id: number) {
    setTargets((prev) => prev.filter((t) => t.id !== id));
    setScore((prev) => prev + 10);
  }

  if (!playing) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge className="bg-emerald-500/20 text-emerald-300">Score: {score}</Badge>
        <div className="flex items-center gap-2 text-sm text-zinc-400"><Clock className="h-4 w-4 text-cyan-400" />{timeLeft}s</div>
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900 via-slate-950 to-black">
        {targets.map((t) => (
          <button key={t.id} onClick={() => hit(t.id)} className="absolute h-14 w-14 rounded-full" style={{ left: `${t.x}%`, top: `${t.y}%`, backgroundColor: t.color, boxShadow: `0 0 20px ${t.color}80`, transform: 'translate(-50%, -50%)' }} />
        ))}
      </div>
    </div>
  );
}

// ─── Bubble Pop Game ───────────────────────────────────────────────────────

function BubblePopGame({ onGameOver, sessionData }: { onGameOver: (score: number) => void; sessionData: { sessionId: string; minutesRemaining: number } | null }) {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(45);
  const [bubbles, setBubbles] = useState<Array<{ id: number; x: number; y: number; color: string; points: number }>>([]);
  const [playing, setPlaying] = useState(true);
  const bubbleId = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (spawnerRef.current) clearInterval(spawnerRef.current);
          setPlaying(false);
          onGameOver(score);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    spawnerRef.current = setInterval(() => {
      const id = bubbleId.current++;
      const colors = [['#10b981', 10], ['#06b6d4', 15], ['#8b5cf6', 20], ['#ef4444', 50]] as const;
      const [color, points] = colors[Math.random() < 0.1 ? 3 : Math.floor(Math.random() * 3)];
      setBubbles((prev) => [...prev, { id, x: Math.random() * 85 + 7, y: Math.random() * 70 + 15, color, points }]);
      setTimeout(() => setBubbles((prev) => prev.filter((b) => b.id !== id)), 2500);
    }, 600);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (spawnerRef.current) clearInterval(spawnerRef.current);
    };
  }, [score, onGameOver]);

  function pop(id: number, points: number) {
    setBubbles((prev) => prev.filter((b) => b.id !== id));
    setScore((prev) => prev + points);
  }

  if (!playing) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge className="bg-emerald-500/20 text-emerald-300">Score: {score}</Badge>
        <div className="flex items-center gap-2 text-sm text-zinc-400"><Clock className="h-4 w-4 text-cyan-400" />{timeLeft}s</div>
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-cyan-950 via-slate-950 to-emerald-950">
        {bubbles.map((b) => (
          <button key={b.id} onClick={() => pop(b.id, b.points)} className="absolute flex items-center justify-center rounded-full text-xs font-bold text-white/70" style={{ left: `${b.x}%`, top: `${b.y}%`, width: '45px', height: '45px', backgroundColor: b.color, boxShadow: `0 0 15px ${b.color}80`, transform: 'translate(-50%, -50%)' }}>{b.points}</button>
        ))}
      </div>
    </div>
  );
}

// ─── Neon Runner Game ─────────────────────────────────────────────────────

function NeonRunnerGame({ onGameOver, sessionData }: { onGameOver: (score: number) => void; sessionData: { sessionId: string; minutesRemaining: number } | null }) {
  const [score, setScore] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [playerY, setPlayerY] = useState(0);
  const [obstacles, setObstacles] = useState<Array<{ id: number; x: number; type: string }>>([]);
  const velRef = useRef(0);
  const pyRef = useRef(0);
  const obsRef = useRef<Array<{ id: number; x: number; type: string }>>([]);
  const scoreRef = useRef(0);
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const obsId = useRef(0);

  useEffect(() => {
    frameRef.current = setInterval(() => {
      velRef.current += 0.6;
      pyRef.current += velRef.current;
      if (pyRef.current > 0) { pyRef.current = 0; velRef.current = 0; }
      setPlayerY(pyRef.current);

      obsRef.current = obsRef.current.map(o => ({ ...o, x: o.x - 3 })).filter(o => o.x > -10);

      // Collision
      for (const obs of obsRef.current) {
        if (obs.x > 10 && obs.x < 25) {
          if (obs.type === 'low' && pyRef.current > -15) {
            if (frameRef.current) clearInterval(frameRef.current);
            if (spawnRef.current) clearInterval(spawnRef.current);
            setPlaying(false);
            onGameOver(scoreRef.current);
            return;
          }
        }
      }

      setObstacles([...obsRef.current]);
      scoreRef.current += 1;
      setScore(scoreRef.current);
    }, 30);

    spawnRef.current = setInterval(() => {
      obsRef.current.push({ id: obsId.current++, x: 100, type: 'low' });
    }, 1800);

    return () => {
      if (frameRef.current) clearInterval(frameRef.current);
      if (spawnRef.current) clearInterval(spawnRef.current);
    };
  }, [onGameOver]);

  function jump() {
    if (pyRef.current >= 0) velRef.current = -12;
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!playing) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge className="bg-emerald-500/20 text-emerald-300">Score: {score}</Badge>
        <div className="text-sm text-zinc-400">Press SPACE to jump</div>
      </div>
      <div className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-purple-950 via-slate-950 to-emerald-950" onClick={jump}>
        <div className="absolute bottom-0 h-2 w-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-400" style={{ boxShadow: '0 0 20px rgba(16,185,129,0.6)' }} />
        <div className="absolute text-3xl" style={{ left: '12%', bottom: `calc(8px + ${-playerY}px)` }}>🏃</div>
        {obstacles.map((o) => (
          <div key={o.id} className="absolute h-8 w-6 rounded bg-red-500/80" style={{ left: `${o.x}%`, bottom: '8px', boxShadow: '0 0 10px rgba(239,68,68,0.6)' }} />
        ))}
      </div>
    </div>
  );
}

// ─── Cosmic Puzzle Game ────────────────────────────────────────────────────

function CosmicPuzzleGame({ onGameOver, sessionData }: { onGameOver: (score: number) => void; sessionData: { sessionId: string; minutesRemaining: number } | null }) {
  const [cards, setCards] = useState<Array<{ id: number; emoji: string; flipped: boolean; matched: boolean }>>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [playing, setPlaying] = useState(true);
  const lockRef = useRef(false);

  useEffect(() => {
    const emojis = ['🚀', '🪐', '🌟', '👾', '🛸', '⚡', '🌌', '☄️'];
    const pairs = [...emojis, ...emojis];
    setCards(pairs.sort(() => Math.random() - 0.5).map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false })));
  }, []);

  function flip(id: number) {
    if (lockRef.current || flipped.includes(id)) return;
    const card = cards.find(c => c.id === id);
    if (!card || card.matched) return;

    const newFlipped = [...flipped, id];
    setFlipped(newFlipped);
    setCards(prev => prev.map(c => c.id === id ? { ...c, flipped: true } : c));

    if (newFlipped.length === 2) {
      lockRef.current = true;
      setMoves(prev => prev + 1);
      const [first, second] = newFlipped;
      const firstCard = cards.find(c => c.id === first);
      const secondCard = cards.find(c => c.id === second);

      if (firstCard?.emoji === secondCard?.emoji) {
        setTimeout(() => {
          setCards(prev => prev.map(c => (c.id === first || c.id === second) ? { ...c, matched: true } : c));
          setMatches(prev => {
            const newMatches = prev + 1;
            if (newMatches === 8) {
              setPlaying(false);
              onGameOver(Math.max(100 - moves * 5, 10));
            }
            return newMatches;
          });
          setFlipped([]);
          lockRef.current = false;
        }, 500);
      } else {
        setTimeout(() => {
          setCards(prev => prev.map(c => (c.id === first || c.id === second) ? { ...c, flipped: false } : c));
          setFlipped([]);
          lockRef.current = false;
        }, 1000);
      }
    }
  }

  if (!playing) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge className="bg-emerald-500/20 text-emerald-300">Moves: {moves}</Badge>
        <Badge className="bg-cyan-500/20 text-cyan-300">Matches: {matches}/8</Badge>
      </div>
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-3">
        {cards.map((card) => (
          <button key={card.id} onClick={() => flip(card.id)} className="relative aspect-square rounded-xl border border-white/5 bg-gradient-to-br from-purple-900/50 to-cyan-900/50 text-4xl">
            {card.flipped || card.matched ? card.emoji : '🃏'}
          </button>
        ))}
      </div>
    </div>
  );
}
