'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useSession } from '@/lib/auth/use-session';
import { useToast } from '@/hooks/use-toast';
import { Heart, MessageCircle, Share2, User, Play, Zap, ChevronUp, ChevronDown, Gamepad2, Sparkles, Eye, DollarSign, Monitor, Smartphone, Send, Users } from 'lucide-react';

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

interface Comment {
  id: string;
  gameId: string;
  userId: string;
  content: string;
  createdAt: string;
}

type ViewMode = 'immersive' | 'browse';

export default function FeedPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [sessionData, setSessionData] = useState<Record<string, { hasSession: boolean; walletBalance: number }>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('immersive');
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [following, setFollowing] = useState<Set<string>>(new Set());

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

  useEffect(() => { loadFeed(true); }, []);

  // Load view mode preference
  useEffect(() => {
    const saved = localStorage.getItem('playliquid_viewmode');
    if (saved === 'browse') setViewMode('browse');
  }, []);

  useEffect(() => {
    localStorage.setItem('playliquid_viewmode', viewMode);
  }, [viewMode]);

  // Check session status for current game
  useEffect(() => {
    if (!session || !items[currentIndex]) return;
    const gameId = items[currentIndex].id;
    if (sessionData[gameId]) return;

    fetch(`/api/game/session-status?userId=${session.userId}&gameId=${gameId}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setSessionData(prev => ({ ...prev, [gameId]: { hasSession: d.data.hasActiveSession, walletBalance: d.data.walletBalance } }));
        }
      })
      .catch(() => {});
  }, [session, currentIndex, items]);

  // Load likes for current game
  useEffect(() => {
    if (!session || !items[currentIndex]) return;
    const gameId = items[currentIndex].id;

    fetch(`/api/social/like?gameId=${gameId}&userId=${session.userId}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.data.liked) {
          setLiked(prev => new Set(prev).add(gameId));
        }
      })
      .catch(() => {});

    // Load comments
    fetch(`/api/social/comments?gameId=${gameId}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setComments(d.data);
      })
      .catch(() => {});
  }, [session, currentIndex, items]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'ArrowDown' || e.code === 'KeyJ') { e.preventDefault(); setCurrentIndex(p => Math.min(p + 1, items.length - 1)); }
      else if (e.code === 'ArrowUp' || e.code === 'KeyK') { e.preventDefault(); setCurrentIndex(p => Math.max(p - 1, 0)); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items.length]);

  // Load more when near end
  useEffect(() => {
    if (currentIndex >= items.length - 3 && items.length > 0) loadFeed();
  }, [currentIndex, items.length, loadFeed]);

  function handlePlay(gameId: string, preview: boolean = false) {
    setIsPreview(preview);
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
        toast({ title: "Let's play!", description: '5 minutes purchased. Game starting...' });
        setSessionData(prev => ({ ...prev, [gameId]: { hasSession: true, walletBalance: data.data.walletBalance } }));
        setIsPreview(false);
        setPlaying(gameId);
      } else {
        toast({ title: data.code === 'INSUFFICIENT_BALANCE' ? 'Need funds' : 'Purchase failed', description: data.error, variant: 'destructive' });
      }
    } catch { toast({ title: 'Network error', variant: 'destructive' }); }
  }

  async function handleLike(gameId: string) {
    if (!session) return;
    setLiked(prev => { const n = new Set(prev); n.has(gameId) ? n.delete(gameId) : n.add(gameId); return n; });
    try {
      await fetch('/api/social/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.userId, gameId }),
      });
    } catch {}
  }

  async function handleFollow(creatorId: string) {
    if (!session) return;
    setFollowing(prev => { const n = new Set(prev); n.has(creatorId) ? n.delete(creatorId) : n.add(creatorId); return n; });
    try {
      await fetch('/api/social/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followerId: session.userId, followingId: creatorId }),
      });
    } catch {}
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !items[currentIndex] || !commentText.trim()) return;
    try {
      const res = await fetch('/api/social/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.userId, gameId: items[currentIndex].id, content: commentText.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setComments(prev => [data.data, ...prev]);
        setCommentText('');
      }
    } catch {}
  }

  function handleGameOver(score?: number) {
    if (!isPreview && playing && sessionData[playing]?.hasSession && score !== undefined) {
      // Submit score
      fetch('/api/game/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionData[playing], score }),
      }).catch(() => {});
    }
    setPlaying(null);
    setSessionData(prev => ({ ...prev, [playing!]: { hasSession: false, walletBalance: prev[playing!]?.walletBalance ?? 0 } }));
  }

  if (loading) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <Sparkles className="h-8 w-8 animate-bounce text-emerald-400" />
        <p className="ml-3 text-sm text-zinc-500">Loading your feed...</p>
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
  const isBuiltin = ['liquid-tournament', 'bubble-pop', 'neon-runner', 'cosmic-puzzle'].includes(current.id);

  return (
    <div className={viewMode === 'browse' ? 'flex h-[calc(100vh-4rem)] gap-0' : ''}>
      {/* Left sidebar (browse mode) */}
      {viewMode === 'browse' && (
        <div className="hidden w-48 shrink-0 border-r border-white/5 p-3 lg:block">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Discover</h3>
          <nav className="space-y-1">
            <Link href="/feed" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              <Play className="h-4 w-4" /> For You
            </Link>
            <Link href="/play" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-200">
              <Gamepad2 className="h-4 w-4" /> All Games
            </Link>
            <Link href="/wallet" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-200">
              <DollarSign className="h-4 w-4" /> Wallet
            </Link>
          </nav>
        </div>
      )}

      {/* Main feed */}
      <div className="relative flex-1 overflow-hidden">
        {/* View mode toggle */}
        <div className="absolute right-3 top-3 z-20 flex gap-1 rounded-lg bg-black/40 p-1 backdrop-blur">
          <button onClick={() => setViewMode('immersive')} className={`rounded p-1.5 ${viewMode === 'immersive' ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500'}`}>
            <Smartphone className="h-4 w-4" />
          </button>
          <button onClick={() => setViewMode('browse')} className={`rounded p-1.5 ${viewMode === 'browse' ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500'}`}>
            <Monitor className="h-4 w-4" />
          </button>
        </div>

        {/* Feed items */}
        <div className={viewMode === 'immersive' ? 'h-[calc(100vh-4rem)]' : 'h-[calc(100vh-4rem)] overflow-y-auto'} style={viewMode === 'immersive' ? { transform: `translateY(-${currentIndex * 100}%)`, transition: 'transform 300ms ease-out' } : {}}>
          {items.map((item, index) => (
            <FeedCard
              key={item.id}
              item={item}
              isActive={index === currentIndex}
              isPlaying={playing === item.id}
              isPreview={isPreview}
              liked={liked.has(item.id)}
              following={following.has(item.creatorId)}
              sessionInfo={sessionData[item.id]}
              likeCount={item.likeCount + (liked.has(item.id) ? 1 : 0)}
              comments={index === currentIndex ? comments : []}
              commentText={commentText}
              showComments={showComments}
              viewMode={viewMode}
              onPlay={(preview) => handlePlay(item.id, preview)}
              onPurchase={() => handlePurchase(item.id)}
              onLike={() => handleLike(item.id)}
              onFollow={() => handleFollow(item.creatorId)}
              onGameOver={handleGameOver}
              onCommentSubmit={handleComment}
              onCommentChange={setCommentText}
              onToggleComments={() => setShowComments(!showComments)}
            />
          ))}
        </div>

        {/* Navigation arrows (immersive mode) */}
        {viewMode === 'immersive' && (
          <>
            <button onClick={() => setCurrentIndex(p => Math.max(p - 1, 0))} disabled={currentIndex === 0}
              className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60 disabled:opacity-0">
              <ChevronUp className="h-5 w-5" />
            </button>
            <button onClick={() => setCurrentIndex(p => Math.min(p + 1, items.length - 1))} disabled={currentIndex === items.length - 1}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60 disabled:opacity-0">
              <ChevronDown className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Right panel (browse mode) */}
      {viewMode === 'browse' && (
        <div className="hidden w-72 shrink-0 border-l border-white/5 p-3 xl:block">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Comments</h3>
          {showComments && comments.length > 0 ? (
            <div className="space-y-2">
              {comments.map(c => (
                <div key={c.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <div className="text-xs text-zinc-500">{c.userId}</div>
                  <div className="mt-1 text-sm text-zinc-300">{c.content}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-600">No comments yet. Be the first!</p>
          )}
          <form onSubmit={handleComment} className="mt-3 flex gap-2">
            <Input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment..." className="border-white/10 bg-white/[0.03] text-sm text-zinc-100" />
            <Button type="submit" size="sm" className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Feed Card ─────────────────────────────────────────────────────────────

function FeedCard({
  item, isActive, isPlaying, isPreview, liked, following, sessionInfo, likeCount, comments, commentText, showComments, viewMode,
  onPlay, onPurchase, onLike, onFollow, onGameOver, onCommentSubmit, onCommentChange, onToggleComments,
}: {
  item: FeedItem; isActive: boolean; isPlaying: boolean; isPreview: boolean; liked: boolean; following: boolean;
  sessionInfo?: { hasSession: boolean; walletBalance: number }; likeCount: number; comments: Comment[]; commentText: string;
  showComments: boolean; viewMode: ViewMode;
  onPlay: (preview?: boolean) => void; onPurchase: () => void; onLike: () => void; onFollow: () => void;
  onGameOver: (score?: number) => void; onCommentSubmit: (e: React.FormEvent) => void; onCommentChange: (v: string) => void;
  onToggleComments: () => void;
}) {
  const isBuiltin = ['liquid-tournament', 'bubble-pop', 'neon-runner', 'cosmic-puzzle'].includes(item.id);
  const cardHeight = viewMode === 'immersive' ? 'h-[calc(100vh-4rem)]' : 'min-h-[600px]';

  return (
    <div className={`relative ${cardHeight} w-full flex items-center justify-center bg-slate-950`}>
      <div className="relative w-full max-w-2xl">
        {!isPlaying ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex h-32 w-32 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 text-6xl">
              {item.thumbnail}
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">{item.title}</h2>
            <p className="mt-1 text-sm text-zinc-500">{item.description}</p>

            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400">
              <User className="h-4 w-4" />
              <span>by {item.creatorId}</span>
              {item.isAiGenerated && <Badge className="bg-purple-500/20 text-purple-300"><Sparkles className="mr-1 h-3 w-3" /> AI</Badge>}
              <button onClick={onFollow} className={`ml-2 rounded-full px-3 py-0.5 text-xs font-medium ${following ? 'bg-emerald-500/20 text-emerald-300' : 'border border-white/10 text-zinc-400 hover:text-zinc-200'}`}>
                {following ? 'Following' : 'Follow'}
              </button>
            </div>

            <div className="mt-4 flex gap-6 text-sm text-zinc-500">
              <span className="flex items-center gap-1"><Play className="h-4 w-4" /> {item.playCount} plays</span>
              {item.topScore > 0 && <span className="flex items-center gap-1"><Zap className="h-4 w-4 text-amber-400" /> Top: {item.topScore}</span>}
            </div>

            <div className="mt-6 flex gap-3">
              {isBuiltin || sessionInfo?.hasSession ? (
                <Button onClick={() => onPlay(false)} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" size="lg">
                  <Play className="mr-2 h-5 w-5" /> Play Now
                </Button>
              ) : (
                <>
                  <Button onClick={() => onPlay(true)} variant="outline" className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10" size="lg">
                    <Eye className="mr-2 h-5 w-5" /> Preview
                  </Button>
                  <Button onClick={onPurchase} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400" size="lg">
                    <Zap className="mr-2 h-5 w-5" /> Play (50 GHS)
                  </Button>
                </>
              )}
            </div>

            {sessionInfo && !sessionInfo.hasSession && !isBuiltin && (
              <p className="mt-2 text-xs text-zinc-600">
                Wallet: {sessionInfo.walletBalance} GHS · <Link href="/wallet" className="text-emerald-400 underline">Add funds</Link>
              </p>
            )}
          </div>
        ) : (
          <div className="h-full">
            {isBuiltin ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-zinc-400">Loading game...</p>
                <script dangerouslySetInnerHTML={{ __html: `window.location.href='/play/${item.id}'` }} />
              </div>
            ) : item.contentUrl ? (
              <div className="flex h-full flex-col">
                <iframe src={item.contentUrl} className="w-full flex-1" style={{ minHeight: '400px' }} title={item.title} sandbox="allow-scripts" />
                <div className="p-2">
                  <Button onClick={() => onGameOver(0)} className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400">
                    End Game {isPreview ? '' : '& Submit Score'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Social sidebar */}
      {!isPlaying && (
        <div className="absolute bottom-8 right-4 flex flex-col gap-3">
          <button onClick={onLike} className="flex flex-col items-center gap-1">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition ${liked ? 'bg-red-500/20 text-red-400' : 'bg-black/40 text-white hover:bg-black/60'}`}>
              <Heart className={`h-6 w-6 ${liked ? 'fill-current' : ''}`} />
            </div>
            <span className="text-xs text-white">{likeCount}</span>
          </button>
          <button onClick={onToggleComments} className="flex flex-col items-center gap-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60">
              <MessageCircle className="h-6 w-6" />
            </div>
            <span className="text-xs text-white">{comments.length}</span>
          </button>
          <button className="flex flex-col items-center gap-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60">
              <Share2 className="h-6 w-6" />
            </div>
            <span className="text-xs text-white">Share</span>
          </button>
        </div>
      )}

      {/* Comments overlay (immersive mode) */}
      {!isPlaying && showComments && viewMode === 'immersive' && (
        <div className="absolute bottom-24 right-4 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-slate-900/95 p-4 backdrop-blur">
          <h3 className="mb-3 text-sm font-medium text-zinc-200">Comments</h3>
          <div className="mb-3 max-h-40 space-y-2 overflow-y-auto">
            {comments.length > 0 ? comments.map(c => (
              <div key={c.id} className="rounded-lg bg-white/[0.03] p-2">
                <div className="text-xs text-zinc-500">{c.userId}</div>
                <div className="text-sm text-zinc-300">{c.content}</div>
              </div>
            )) : <p className="text-sm text-zinc-600">No comments yet.</p>}
          </div>
          <form onSubmit={onCommentSubmit} className="flex gap-2">
            <Input value={commentText} onChange={(e) => onCommentChange(e.target.value)} placeholder="Comment..." className="border-white/10 bg-white/[0.03] text-sm text-zinc-100" />
            <Button type="submit" size="sm" className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      )}

      {/* Swipe hint */}
      {isActive && !isPlaying && viewMode === 'immersive' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-bounce text-xs text-zinc-600">
          ↑ swipe for next game ↓
        </div>
      )}
    </div>
  );
}
