'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, Zap, Trophy, Play } from 'lucide-react';

type GameState = 'idle' | 'playing' | 'gameOver';

interface Obstacle {
  id: number;
  x: number; // percentage from left
  type: 'low' | 'high';
}

const PLAYER_SIZE = 40;
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const GAME_SPEED_START = 3;
const GAME_SPEED_MAX = 8;

export function NeonRunner() {
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [playerY, setPlayerY] = useState(0); // 0 = ground, negative = jumping
  const [velocity, setVelocity] = useState(0);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [gameSpeed, setGameSpeed] = useState(GAME_SPEED_START);
  const [isJumping, setIsJumping] = useState(false);

  const velRef = useRef(0);
  const pyRef = useRef(0);
  const obsRef = useRef<Obstacle[]>([]);
  const scoreRef = useRef(0);
  const speedRef = useRef(GAME_SPEED_START);
  const obsIdRef = useRef(0);
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('neon_runner_highscore');
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  const jump = useCallback(() => {
    if (gameState !== 'playing') return;
    if (pyRef.current >= 0) {
      // On ground, can jump
      velRef.current = JUMP_FORCE;
      setIsJumping(true);
    }
  }, [gameState]);

  const startGame = useCallback(() => {
    setScore(0);
    setPlayerY(0);
    setVelocity(0);
    setObstacles([]);
    setGameSpeed(GAME_SPEED_START);
    setGameState('playing');
    scoreRef.current = 0;
    velRef.current = 0;
    pyRef.current = 0;
    obsRef.current = [];
    speedRef.current = GAME_SPEED_START;

    // Game loop
    frameRef.current = setInterval(() => {
      // Physics
      velRef.current += GRAVITY;
      pyRef.current += velRef.current;
      if (pyRef.current > 0) {
        pyRef.current = 0;
        velRef.current = 0;
        setIsJumping(false);
      }
      setPlayerY(pyRef.current);

      // Move obstacles
      obsRef.current = obsRef.current
        .map((o) => ({ ...o, x: o.x - speedRef.current }))
        .filter((o) => o.x > -10);

      // Collision check
      const playerHitbox = { x: 15, y: pyRef.current, w: 8, h: 15 };
      for (const obs of obsRef.current) {
        if (obs.x > 10 && obs.x < 25) {
          // In player's lane
          if (obs.type === 'low' && pyRef.current > -15) {
            // Hit a low obstacle while not jumping high enough
            if (frameRef.current) clearInterval(frameRef.current);
            if (spawnRef.current) clearInterval(spawnRef.current);
            setGameState('gameOver');
            return;
          }
          if (obs.type === 'high' && pyRef.current < -20) {
            // Hit a high obstacle while jumping
            if (frameRef.current) clearInterval(frameRef.current);
            if (spawnRef.current) clearInterval(spawnRef.current);
            setGameState('gameOver');
            return;
          }
        }
      }
      setObstacles([...obsRef.current]);

      // Score
      scoreRef.current += 1;
      setScore(scoreRef.current);

      // Increase speed
      if (scoreRef.current % 200 === 0 && speedRef.current < GAME_SPEED_MAX) {
        speedRef.current += 0.5;
        setGameSpeed(speedRef.current);
      }
    }, 30);

    // Spawn obstacles
    spawnRef.current = setInterval(() => {
      const type = Math.random() > 0.6 ? 'high' : 'low';
      obsRef.current.push({
        id: obsIdRef.current++,
        x: 100,
        type,
      });
    }, 1800);
  }, []);

  const endGame = useCallback(() => {
    if (frameRef.current) clearInterval(frameRef.current);
    if (spawnRef.current) clearInterval(spawnRef.current);
    setGameState('idle');
    setObstacles([]);
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current) clearInterval(frameRef.current);
      if (spawnRef.current) clearInterval(spawnRef.current);
    };
  }, []);

  useEffect(() => {
    if (gameState === 'gameOver' && score > highScore) {
      setHighScore(score);
      localStorage.setItem('neon_runner_highscore', String(score));
    }
  }, [gameState, score, highScore]);

  // Keyboard controls
  useEffect(() => {
    if (gameState !== 'playing') return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gameState, jump]);

  if (gameState === 'idle') {
    return (
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-6xl">🏃</div>
          <h2 className="mt-4 text-2xl font-bold text-zinc-100">Neon Runner</h2>
          <p className="mt-2 max-w-md text-sm text-zinc-400">
            Run through the neon city! Jump over low obstacles and duck under high ones.
            Press SPACE or tap to jump. Speed increases as you progress.
          </p>
          <div className="mt-6 flex gap-4">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Trophy className="h-4 w-4 text-amber-400" />
              Best: {highScore}
            </div>
          </div>
          <Button onClick={startGame} className="mt-8 bg-emerald-500 text-slate-950 hover:bg-emerald-400" size="lg">
            <Zap className="mr-2 h-5 w-5" />
            Start Running
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
          <div className="text-6xl">{isNewHigh ? '🎉' : '💥'}</div>
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
              Try Again
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
      <div className="flex items-center justify-between">
        <Badge className="bg-emerald-500/20 text-emerald-300">Score: {score}</Badge>
        <Badge className="bg-cyan-500/20 text-cyan-300">Speed: {gameSpeed.toFixed(1)}x</Badge>
      </div>

      <div
        className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-purple-950 via-slate-950 to-emerald-950"
        onClick={jump}
      >
        {/* Neon ground */}
        <div className="absolute bottom-0 h-2 w-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-400" style={{ boxShadow: '0 0 20px rgba(16,185,129,0.6)' }} />

        {/* Player */}
        <div
          className="absolute flex items-center justify-center text-3xl transition-none"
          style={{
            left: '12%',
            bottom: `calc(8px + ${-playerY}px)`,
            transform: isJumping ? 'rotate(-15deg)' : 'rotate(0deg)',
            filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.8))',
          }}
        >
          🏃
        </div>

        {/* Obstacles */}
        {obstacles.map((obs) => (
          <div
            key={obs.id}
            className="absolute"
            style={{
              left: `${obs.x}%`,
              bottom: obs.type === 'low' ? '8px' : '60px',
            }}
          >
            {obs.type === 'low' ? (
              <div className="h-8 w-6 rounded bg-red-500/80" style={{ boxShadow: '0 0 10px rgba(239,68,68,0.6)' }} />
            ) : (
              <div className="h-6 w-8 rounded bg-amber-500/80" style={{ boxShadow: '0 0 10px rgba(245,158,11,0.6)' }} />
            )}
          </div>
        ))}

        {/* Instructions */}
        <div className="absolute right-4 top-4 rounded-lg bg-black/40 px-3 py-1 text-xs text-zinc-400">
          Press SPACE or tap to jump
        </div>
      </div>
    </div>
  );
}
