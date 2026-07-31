'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RotateCcw, Zap, Trophy, Wind } from 'lucide-react';

type GameState = 'idle' | 'playing' | 'gameOver';

interface Bubble {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  points: number;
  vx: number;
  vy: number;
}

const COLORS = [
  { color: '#10b981', points: 10 },
  { color: '#06b6d4', points: 15 },
  { color: '#8b5cf6', points: 20 },
  { color: '#f59e0b', points: 25 },
  { color: '#ef4444', points: 50 }, // rare red bubble
];

const GAME_DURATION = 45; // seconds

export function BubblePopMania() {
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [highScore, setHighScore] = useState(0);
  const [pops, setPops] = useState(0);
  const bubbleIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('bubble_pop_highscore');
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  const spawnBubble = useCallback(() => {
    const isRed = Math.random() < 0.1;
    const colorData = isRed ? COLORS[4] : COLORS[Math.floor(Math.random() * 4)];
    const id = bubbleIdRef.current++;
    const bubble: Bubble = {
      id,
      x: Math.random() * 85 + 7,
      y: Math.random() * 70 + 15,
      size: isRed ? 35 : Math.random() * 25 + 35,
      color: colorData.color,
      points: colorData.points,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
    };
    setBubbles((prev) => [...prev, bubble]);

    setTimeout(() => {
      setBubbles((prev) => prev.filter((b) => b.id !== id));
    }, 2500);
  }, []);

  const popBubble = useCallback((id: number, points: number) => {
    setBubbles((prev) => prev.filter((b) => b.id !== id));
    setScore((prev) => prev + points);
    setPops((prev) => prev + 1);
  }, []);

  const startGame = useCallback(() => {
    setScore(0);
    setPops(0);
    setTimeLeft(GAME_DURATION);
    setBubbles([]);
    setGameState('playing');

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (spawnerRef.current) clearInterval(spawnerRef.current);
          if (moveRef.current) clearInterval(moveRef.current);
          setGameState('gameOver');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    spawnerRef.current = setInterval(spawnBubble, 600);
    setTimeout(spawnBubble, 100);

    // Move bubbles slightly
    moveRef.current = setInterval(() => {
      setBubbles((prev) =>
        prev.map((b) => ({
          ...b,
          x: Math.max(5, Math.min(95, b.x + b.vx)),
          y: Math.max(10, Math.min(85, b.y + b.vy)),
        })),
      );
    }, 50);
  }, [spawnBubble]);

  const endGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (spawnerRef.current) clearInterval(spawnerRef.current);
    if (moveRef.current) clearInterval(moveRef.current);
    setGameState('idle');
    setBubbles([]);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (spawnerRef.current) clearInterval(spawnerRef.current);
      if (moveRef.current) clearInterval(moveRef.current);
    };
  }, []);

  useEffect(() => {
    if (gameState === 'gameOver' && score > highScore) {
      setHighScore(score);
      localStorage.setItem('bubble_pop_highscore', String(score));
    }
  }, [gameState, score, highScore]);

  if (gameState === 'idle') {
    return (
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-6xl">🫧</div>
          <h2 className="mt-4 text-2xl font-bold text-zinc-100">Bubble Pop Mania</h2>
          <p className="mt-2 max-w-md text-sm text-zinc-400">
            Pop bubbles before they float away! Green = 10pts, Cyan = 15pts, Purple = 20pts,
            Amber = 25pts, and rare Red = 50pts!
          </p>
          <div className="mt-6 flex gap-4">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Trophy className="h-4 w-4 text-amber-400" />
              Best: {highScore}
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Wind className="h-4 w-4 text-cyan-400" />
              {GAME_DURATION}s rounds
            </div>
          </div>
          <Button onClick={startGame} className="mt-8 bg-emerald-500 text-slate-950 hover:bg-emerald-400" size="lg">
            <Zap className="mr-2 h-5 w-5" />
            Start Popping
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (gameState === 'gameOver') {
    const isNewHigh = score >= highScore;
    return (
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-6xl">{isNewHigh ? '🎉' : '🫧'}</div>
          <h2 className="mt-4 text-2xl font-bold text-zinc-100">
            {isNewHigh ? 'New High Score!' : 'Time\'s Up!'}
          </h2>
          <div className="mt-4 flex items-center gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-400">{score}</div>
              <div className="text-sm text-zinc-500">Score</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-cyan-400">{pops}</div>
              <div className="text-sm text-zinc-500">Pops</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-amber-400">{highScore}</div>
              <div className="text-sm text-zinc-500">Best</div>
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <Button onClick={startGame} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
              <RotateCcw className="mr-2 h-4 w-4" />
              Play Again
            </Button>
            <Button onClick={endGame} variant="outline" className="border-white/10">
              Back
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Badge className="bg-emerald-500/20 text-emerald-300">Score: {score}</Badge>
          <Badge className="bg-cyan-500/20 text-cyan-300">Pops: {pops}</Badge>
        </div>
        <div className="text-sm text-zinc-400">{timeLeft}s</div>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-cyan-950 via-slate-950 to-emerald-950">
        {bubbles.map((bubble) => (
          <button
            key={bubble.id}
            onClick={() => popBubble(bubble.id, bubble.points)}
            className="absolute flex items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-50"
            style={{
              left: `${bubble.x}%`,
              top: `${bubble.y}%`,
              width: `${bubble.size}px`,
              height: `${bubble.size}px`,
              backgroundColor: bubble.color,
              boxShadow: `0 0 15px ${bubble.color}80, inset 0 -5px 10px rgba(0,0,0,0.2), inset 0 5px 10px rgba(255,255,255,0.3)`,
              transform: 'translate(-50%, -50%)',
              animation: 'float-in 0.3s ease-out',
            }}
          >
            <span className="text-xs font-bold text-white/70">{bubble.points}</span>
          </button>
        ))}
        {bubbles.length === 0 && (
          <div className="flex h-full items-center justify-center text-zinc-600">
            Get ready to pop!
          </div>
        )}
      </div>

      <style>{`
        @keyframes float-in {
          from { transform: translate(-50%, -50%) scale(0); opacity: 0; }
          to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
