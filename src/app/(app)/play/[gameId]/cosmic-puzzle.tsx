'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RotateCcw, Zap, Trophy, Brain, Check } from 'lucide-react';

type GameState = 'idle' | 'playing' | 'gameOver';

interface Card {
  id: number;
  emoji: string;
  flipped: boolean;
  matched: boolean;
}

const EMOJIS = ['🚀', '🪐', '🌟', '👾', '🛸', '⚡', '🌌', '☄️'];

function shuffleCards(): Card[] {
  const pairs = [...EMOJIS, ...EMOJIS];
  const shuffled = pairs
    .map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }))
    .sort(() => Math.random() - 0.5)
    .map((c, i) => ({ ...c, id: i }));
  return shuffled;
}

export function CosmicPuzzle() {
  const [gameState, setGameState] = useState<GameState>('idle');
  const [cards, setCards] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [highScore, setHighScore] = useState<number | null>(null);
  const lockRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('cosmic_puzzle_best');
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  const startGame = useCallback(() => {
    setCards(shuffleCards());
    setFlipped([]);
    setMoves(0);
    setMatches(0);
    setTimeElapsed(0);
    setGameState('playing');
    lockRef.current = false;

    timerRef.current = setInterval(() => {
      setTimeElapsed((prev) => prev + 1);
    }, 1000);
  }, []);

  const endGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setGameState('idle');
    setCards([]);
  }, []);

  const flipCard = useCallback((id: number) => {
    if (lockRef.current) return;
    if (flipped.includes(id)) return;

    const card = cards.find((c) => c.id === id);
    if (!card || card.matched) return;

    const newFlipped = [...flipped, id];
    setFlipped(newFlipped);
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, flipped: true } : c)));

    if (newFlipped.length === 2) {
      lockRef.current = true;
      setMoves((prev) => prev + 1);

      const [first, second] = newFlipped;
      const firstCard = cards.find((c) => c.id === first);
      const secondCard = cards.find((c) => c.id === second);

      if (firstCard?.emoji === secondCard?.emoji) {
        // Match!
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === first || c.id === second ? { ...c, matched: true } : c,
            ),
          );
          setMatches((prev) => {
            const newMatches = prev + 1;
            if (newMatches === EMOJIS.length) {
              // Game won!
              if (timerRef.current) clearInterval(timerRef.current);
              setGameState('gameOver');
            }
            return newMatches;
          });
          setFlipped([]);
          lockRef.current = false;
        }, 500);
      } else {
        // No match
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === first || c.id === second ? { ...c, flipped: false } : c,
            ),
          );
          setFlipped([]);
          lockRef.current = false;
        }, 1000);
      }
    }
  }, [flipped, cards]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (gameState === 'gameOver') {
      // Score = moves * 10 + time bonus (lower is better)
      const finalScore = moves * 10 + timeElapsed;
      if (highScore === null || finalScore < highScore) {
        setHighScore(finalScore);
        localStorage.setItem('cosmic_puzzle_best', String(finalScore));
      }
    }
  }, [gameState, moves, timeElapsed, highScore]);

  if (gameState === 'idle') {
    return (
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-6xl">🧩</div>
          <h2 className="mt-4 text-2xl font-bold text-zinc-100">Cosmic Puzzle</h2>
          <p className="mt-2 max-w-md text-sm text-zinc-400">
            Match all 8 cosmic pairs! Flip cards to find matching pairs.
            Fewer moves and faster time = better score.
          </p>
          {highScore !== null && (
            <div className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
              <Trophy className="h-4 w-4 text-amber-400" />
              Best Score: {highScore} (moves × 10 + seconds)
            </div>
          )}
          <Button onClick={startGame} className="mt-8 bg-emerald-500 text-slate-950 hover:bg-emerald-400" size="lg">
            <Zap className="mr-2 h-5 w-5" />
            Start Puzzle
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (gameState === 'gameOver') {
    const finalScore = moves * 10 + timeElapsed;
    const isNewBest = highScore === finalScore;
    return (
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-6xl">{isNewBest ? '🎉' : '🌟'}</div>
          <h2 className="mt-4 text-2xl font-bold text-zinc-100">
            {isNewBest ? 'New Best Score!' : 'Puzzle Complete!'}
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-400">{moves}</div>
              <div className="text-sm text-zinc-500">Moves</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-cyan-400">{timeElapsed}s</div>
              <div className="text-sm text-zinc-500">Time</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-amber-400">{finalScore}</div>
              <div className="text-sm text-zinc-500">Score</div>
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
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <Badge className="bg-emerald-500/20 text-emerald-300">Moves: {moves}</Badge>
          <Badge className="bg-cyan-500/20 text-cyan-300">Matches: {matches}/{EMOJIS.length}</Badge>
        </div>
        <div className="text-sm text-zinc-400">{timeElapsed}s</div>
      </div>

      <div className="mx-auto grid max-w-lg grid-cols-4 gap-3">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => flipCard(card.id)}
            className="relative aspect-square rounded-xl border border-white/5 transition-all hover:border-emerald-500/30"
            style={{
              perspective: '1000px',
            }}
          >
            <div
              className="relative h-full w-full transition-transform duration-300"
              style={{
                transformStyle: 'preserve-3d',
                transform: card.flipped || card.matched ? 'rotateY(180deg)' : 'rotateY(0deg)',
              }}
            >
              {/* Back */}
              <div
                className="absolute inset-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-purple-900/50 to-cyan-900/50 text-2xl"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <Brain className="h-6 w-6 text-zinc-600" />
              </div>
              {/* Front */}
              <div
                className={`absolute inset-0 flex items-center justify-center rounded-xl text-4xl ${
                  card.matched ? 'bg-emerald-500/20' : 'bg-white/[0.05]'
                }`}
                style={{
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
              >
                {card.emoji}
                {card.matched && (
                  <div className="absolute right-1 top-1">
                    <Check className="h-4 w-4 text-emerald-400" />
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
