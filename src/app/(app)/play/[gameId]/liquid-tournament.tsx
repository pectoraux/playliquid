'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Trophy, Clock, Target, Zap, RotateCcw } from 'lucide-react';

type GameState = 'idle' | 'playing' | 'gameOver';

interface Target {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
}

const GAME_DURATION = 30; // seconds

export function LiquidTournament() {
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [targets, setTargets] = useState<Target[]>([]);
  const [highScore, setHighScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const targetIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('liquid_tournament_highscore');
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  const spawnTarget = useCallback(() => {
    const colors = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444'];
    const id = targetIdRef.current++;
    const target: Target = {
      id,
      x: Math.random() * 80 + 10, // 10% to 90%
      y: Math.random() * 70 + 15, // 15% to 85%
      size: Math.random() * 30 + 40, // 40px to 70px
      color: colors[Math.floor(Math.random() * colors.length)],
    };
    setTargets((prev) => [...prev, target]);

    // Remove target after 1.5s if not clicked
    setTimeout(() => {
      setTargets((prev) => prev.filter((t) => t.id !== id));
    }, 1500);
  }, []);

  const startGame = useCallback(() => {
    setScore(0);
    setCombo(0);
    setTimeLeft(GAME_DURATION);
    setTargets([]);
    setGameState('playing');

    // Timer
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (spawnerRef.current) clearInterval(spawnerRef.current);
          setGameState('gameOver');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Spawn targets
    spawnerRef.current = setInterval(spawnTarget, 700);
    // Spawn first immediately
    setTimeout(spawnTarget, 200);
  }, [spawnTarget]);

  const hitTarget = useCallback((id: number) => {
    setTargets((prev) => prev.filter((t) => t.id !== id));
    setCombo((prev) => prev + 1);
    setScore((prev) => prev + 10 + combo * 2);
  }, [combo]);

  const endGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (spawnerRef.current) clearInterval(spawnerRef.current);
    setGameState('idle');
    setTargets([]);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (spawnerRef.current) clearInterval(spawnerRef.current);
    };
  }, []);

  // Save high score
  useEffect(() => {
    if (gameState === 'gameOver' && score > highScore) {
      setHighScore(score);
      localStorage.setItem('liquid_tournament_highscore', String(score));
    }
  }, [gameState, score, highScore]);

  if (gameState === 'idle') {
    return (
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Trophy className="h-16 w-16 text-emerald-400" />
          <h2 className="mt-4 text-2xl font-bold text-zinc-100">Liquid Tournament</h2>
          <p className="mt-2 max-w-md text-sm text-zinc-400">
            Test your reflexes! Tap the targets as fast as you can in 30 seconds.
            Build combos for bonus points.
          </p>
          <div className="mt-6 flex gap-4">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Trophy className="h-4 w-4 text-amber-400" />
              Best: {highScore}
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Clock className="h-4 w-4 text-cyan-400" />
              {GAME_DURATION}s rounds
            </div>
          </div>
          <Button onClick={startGame} className="mt-8 bg-emerald-500 text-slate-950 hover:bg-emerald-400" size="lg">
            <Zap className="mr-2 h-5 w-5" />
            Start Playing
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
          <Trophy className={`h-16 w-16 ${isNewHigh ? 'text-amber-400' : 'text-emerald-400'}`} />
          <h2 className="mt-4 text-2xl font-bold text-zinc-100">
            {isNewHigh ? 'New High Score!' : 'Game Over'}
          </h2>
          <div className="mt-4 flex items-center gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-400">{score}</div>
              <div className="text-sm text-zinc-500">Score</div>
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

  // Playing state
  return (
    <div className="space-y-4">
      {/* HUD */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Badge className="bg-emerald-500/20 text-emerald-300">Score: {score}</Badge>
          {combo > 1 && (
            <Badge className="bg-amber-500/20 text-amber-300">Combo x{combo}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Clock className="h-4 w-4 text-cyan-400" />
          {timeLeft}s
        </div>
      </div>
      <Progress value={(timeLeft / GAME_DURATION) * 100} className="h-2" />

      {/* Game Area */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900 via-slate-950 to-black">
        {targets.map((target) => (
          <button
            key={target.id}
            onClick={() => hitTarget(target.id)}
            className="absolute flex items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-90"
            style={{
              left: `${target.x}%`,
              top: `${target.y}%`,
              width: `${target.size}px`,
              height: `${target.size}px`,
              backgroundColor: target.color,
              boxShadow: `0 0 20px ${target.color}80, inset 0 0 10px rgba(255,255,255,0.3)`,
              transform: 'translate(-50%, -50%)',
              animation: 'pop-in 0.2s ease-out',
            }}
          >
            <Target className="h-1/2 w-1/2 text-white/80" />
          </button>
        ))}
        {targets.length === 0 && (
          <div className="flex h-full items-center justify-center text-zinc-600">
            Get ready...
          </div>
        )}
      </div>

      <style>{`
        @keyframes pop-in {
          from { transform: translate(-50%, -50%) scale(0); }
          to { transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  );
}
