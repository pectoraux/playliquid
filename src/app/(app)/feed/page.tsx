'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/lib/auth/use-session';
import { useToast } from '@/hooks/use-toast';
import { Heart, MessageCircle, Share2, User, Play, Zap, ChevronUp, ChevronDown, Gamepad2, Sparkles } from 'lucide-react';

interface FeedItem {
  id: string;
  title: string;
  creatorId: string;
  description: string;
  thumbnail: string;
  gameType: string;
  playCount: number;
  topScore: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  contentUrl: string | null;
  isAiGenerated: boolean;
}

export default function FeedPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<Record<string, { hasSession: boolean; walletBalance: number }>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Load feed
  const loadFeed = useCallback((reset = false) => {
    const newOffset = reset ? 0 : offset;
    fetch(`/api/feed?userId=${session?.userId || ''}&offset=${newOffset}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setItems(prev => reset ? d.data.items : [...prev, ...d.data.items]);
          setOffset(d.data.offset);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session, offset]);

  useEffect(() => {
    loadFeed(true);
  }, []);

  // Check session status for current game
  useEffect(() => {
    if (!session || !items[currentIndex]) return;
    const gameId = items[currentIndex].id;
    if (sessionData[gameId]) return;

    fetch(`/api/game/session-status?userId=${session.userId}&gameId=${gameId}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setSessionData(prev => ({
            ...prev,
            [gameId]: {
              hasSession: d.data.hasActiveSession,
              walletBalance: d.data.walletBalance,
            },
          }));
        }
      })
      .catch(() => {});
  }, [session, currentIndex, items]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyJ') {
        e.preventDefault();
        setCurrentIndex(prev => Math.min(prev + 1, items.length - 1));
      } else if (e.code === 'ArrowUp' || e.code === 'KeyK') {
        e.preventDefault();
        setCurrentIndex(prev => Math.max(prev - 1, 0));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items.length]);

  // Load more when near the end
  useEffect(() => {
    if (currentIndex >= items.length - 3 && items.length > 0) {
      loadFeed();
    }
  }, [currentIndex, items.length]);

  function handlePlay(gameId: string) {
    setPlaying(gameId);
  }

  async function handlePurchase(gameId: string) {
    if (!session) return;
    try {
      const res = await fetch('/api/game/purchase-minutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.userId, gameId, minutes: 5 }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: 'Let\'s play!', description: '5 minutes purchased. Game starting...' });
        setSessionData(prev => ({ ...prev, [gameId]: { hasSession: true, walletBalance: data.data.walletBalance } }));
        setPlaying(gameId);
      } else {
        if (data.code === 'INSUFFICIENT_BALANCE') {
          toast({ title: 'Need funds', description: 'Deposit GHS to your wallet first', variant: 'destructive' });
        } else {
          toast({ title: 'Purchase failed', description: data.error, variant: 'destructive' });
        }
      }
    } catch {
      toast({ title: 'Network error', variant: 'destructive' });
    }
  }

  function handleLike(gameId: string) {
    setLiked(prev => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  }

  function handleGameOver() {
    setPlaying(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="animate-pulse text-emerald-400">
          <Sparkles className="h-8 w-8 animate-bounce" />
          <p className="mt-2 text-sm text-zinc-500">Loading your feed...</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center text-center">
        <Gamepad2 className="h-12 w-12 text-zinc-600" />
        <p className="mt-4 text-zinc-400">No games in your feed yet.</p>
        <p className="text-sm text-zinc-600">Games will appear here as creators publish them.</p>
      </div>
    );
  }

  const current = items[currentIndex];

  return (
    <div className="relative h-[calc(100vh-4rem)] overflow-hidden" ref={containerRef}>
      {/* Feed container */}
      <div
        className="h-full transition-transform duration-300 ease-out"
        style={{ transform: `translateY(-${currentIndex * 100}%)` }}
      >
        {items.map((item, index) => (
          <FeedCard
            key={item.id}
            item={item}
            isActive={index === currentIndex}
            isPlaying={playing === item.id}
            liked={liked.has(item.id)}
            sessionInfo={sessionData[item.id]}
            onPlay={() => handlePlay(item.id)}
            onPurchase={() => handlePurchase(item.id)}
            onLike={() => handleLike(item.id)}
            onGameOver={handleGameOver}
          />
        ))}
      </div>

      {/* Navigation arrows */}
      <button
        onClick={() => setCurrentIndex(prev => Math.max(prev - 1, 0))}
        disabled={currentIndex === 0}
        className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60 disabled:opacity-0"
      >
        <ChevronUp className="h-5 w-5" />
      </button>
      <button
        onClick={() => setCurrentIndex(prev => Math.min(prev + 1, items.length - 1))}
        disabled={currentIndex === items.length - 1}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60 disabled:opacity-0"
      >
        <ChevronDown className="h-5 w-5" />
      </button>

      {/* Progress indicator */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1">
        {items.slice(Math.max(0, currentIndex - 2), currentIndex + 3).map((_, i) => {
          const realIndex = Math.max(0, currentIndex - 2) + i;
          return (
            <div
              key={realIndex}
              className={`w-1 rounded-full transition-all ${
                realIndex === currentIndex ? 'h-8 bg-emerald-400' : 'h-2 bg-white/20'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Feed Card ──────────────────────────────────────────────────────────────

function FeedCard({
  item,
  isActive,
  isPlaying,
  liked,
  sessionInfo,
  onPlay,
  onPurchase,
  onLike,
  onGameOver,
}: {
  item: FeedItem;
  isActive: boolean;
  isPlaying: boolean;
  liked: boolean;
  sessionInfo?: { hasSession: boolean; walletBalance: number };
  onPlay: () => void;
  onPurchase: () => void;
  onLike: () => void;
  onGameOver: () => void;
}) {
  const isBuiltin = ['liquid-tournament', 'bubble-pop', 'neon-runner', 'cosmic-puzzle'].includes(item.id);

  return (
    <div className="relative h-full w-full flex items-center justify-center bg-slate-950">
      {/* Game area */}
      <div className="relative h-full w-full max-w-2xl">
        {!isPlaying ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            {/* Game thumbnail */}
            <div className="mb-4 flex h-32 w-32 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 text-6xl">
              {item.thumbnail}
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-zinc-100">{item.title}</h2>
            <p className="mt-1 text-sm text-zinc-500">{item.description}</p>

            {/* Creator */}
            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
              <User className="h-4 w-4" />
              <span>by {item.creatorId}</span>
              {item.isAiGenerated && (
                <Badge className="bg-purple-500/20 text-purple-300">
                  <Sparkles className="mr-1 h-3 w-3" /> AI
                </Badge>
              )}
            </div>

            {/* Stats */}
            <div className="mt-4 flex gap-6 text-sm text-zinc-500">
              <span className="flex items-center gap-1">
                <Play className="h-4 w-4" /> {item.playCount} plays
              </span>
              {item.topScore > 0 && (
                <span className="flex items-center gap-1">
                  <Zap className="h-4 w-4 text-amber-400" /> Top: {item.topScore}
                </span>
              )}
            </div>

            {/* Play button */}
            <div className="mt-6 flex gap-3">
              {isBuiltin || sessionInfo?.hasSession ? (
                <Button onClick={onPlay} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" size="lg">
                  <Play className="mr-2 h-5 w-5" /> Play Now
                </Button>
              ) : (
                <>
                  <Button onClick={onPlay} variant="outline" className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10" size="lg">
                    <Play className="mr-2 h-5 w-5" /> Preview
                  </Button>
                  <Button onClick={onPurchase} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" size="lg">
                    <Zap className="mr-2 h-5 w-5" /> Play (50 GHS)
                  </Button>
                </>
              )}
            </div>
            {sessionInfo && !sessionInfo.hasSession && !isBuiltin && (
              <p className="mt-2 text-xs text-zinc-600">
                Wallet: {sessionInfo.walletBalance} GHS ·{' '}
                <Link href="/wallet" className="text-emerald-400 underline">Add funds</Link>
              </p>
            )}
          </div>
        ) : (
          /* Game playing */
          <div className="h-full w-full">
            {isBuiltin ? (
              <BuiltinGame gameId={item.id} onGameOver={onGameOver} />
            ) : item.contentUrl ? (
              <div className="flex h-full flex-col">
                <iframe
                  src={item.contentUrl}
                  className="w-full flex-1"
                  style={{ minHeight: '400px' }}
                  title={item.title}
                  sandbox="allow-scripts"
                />
                <div className="p-2">
                  <Button onClick={onGameOver} className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400">
                    End Game
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Social sidebar */}
      {!isPlaying && (
        <div className="absolute bottom-8 right-4 flex flex-col gap-4">
          <button onClick={onLike} className="flex flex-col items-center gap-1">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition ${
              liked ? 'bg-red-500/20 text-red-400' : 'bg-black/40 text-white hover:bg-black/60'
            }`}>
              <Heart className={`h-6 w-6 ${liked ? 'fill-current' : ''}`} />
            </div>
            <span className="text-xs text-white">{item.likeCount + (liked ? 1 : 0)}</span>
          </button>
          <button className="flex flex-col items-center gap-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60">
              <MessageCircle className="h-6 w-6" />
            </div>
            <span className="text-xs text-white">{item.commentCount}</span>
          </button>
          <button className="flex flex-col items-center gap-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60">
              <Share2 className="h-6 w-6" />
            </div>
            <span className="text-xs text-white">Share</span>
          </button>
        </div>
      )}

      {/* Swipe hint */}
      {isActive && !isPlaying && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-bounce text-xs text-zinc-600">
          ↑ swipe for next game ↓
        </div>
      )}
    </div>
  );
}

// ─── Builtin Game Component ────────────────────────────────────────────────

function BuiltinGame({ gameId, onGameOver }: { gameId: string; onGameOver: () => void }) {
  // For simplicity, we redirect to the full game player page
  useEffect(() => {
    // The feed plays builtin games by navigating to the game player
    window.location.href = `/play/${gameId}`;
  }, [gameId]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-zinc-400">Loading game...</p>
    </div>
  );
}
