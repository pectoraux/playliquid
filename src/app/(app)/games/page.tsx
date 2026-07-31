'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Rocket, Star, Users, TrendingUp, Filter } from 'lucide-react';

interface Game {
  id: string;
  title: string;
  lastPlayed: string;
  progress: number;
  thumbnail: string;
}

interface DemoResponse {
  ok: boolean;
  data: {
    recentGames: Game[];
  };
}

const EXTRA_GAMES: Game[] = [
  { id: 'extra1', title: 'Crystal Caverns', lastPlayed: 'Never', progress: 0, thumbnail: '💎' },
  { id: 'extra2', title: 'Speed Racer X', lastPlayed: 'Never', progress: 0, thumbnail: '🏎️' },
  { id: 'extra3', title: 'Pixel Dungeon', lastPlayed: 'Never', progress: 0, thumbnail: '⚔️' },
  { id: 'extra4', title: 'Ocean Tycoon', lastPlayed: 'Never', progress: 0, thumbnail: '🌊' },
  { id: 'extra5', title: 'Sky Fortress', lastPlayed: 'Never', progress: 0, thumbnail: '🏰' },
  { id: 'extra6', title: 'Mystic Garden', lastPlayed: 'Never', progress: 0, thumbnail: '🌿' },
  { id: 'extra7', title: 'Gladiator Arena', lastPlayed: 'Never', progress: 0, thumbnail: '🛡️' },
  { id: 'extra8', title: 'Time Traveler', lastPlayed: 'Never', progress: 0, thumbnail: '⏳' },
];

const CATEGORIES = ['All', 'Action', 'Puzzle', 'Adventure', 'Strategy', 'Arcade'];

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/demo-data?role=player')
      .then((r) => r.json())
      .then((data: DemoResponse) => {
        if (cancelled) return;
        if (data.ok && data.data?.recentGames) {
          setGames([...data.data.recentGames, ...EXTRA_GAMES]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const filtered = games.filter((g) => {
    if (query && !g.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-emerald-400">
            <Rocket className="h-3.5 w-3.5" />Discover
          </div>
          <h1 className="mt-1 text-2xl font-bold text-zinc-100 sm:text-3xl">Games</h1>
          <p className="mt-1 text-sm text-zinc-500">Browse and play from our library of games.</p>
        </div>
        <Button className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
          <TrendingUp className="h-4 w-4" />
          Top Charts
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Search games…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-white/10 bg-white/[0.03] pl-9 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Filter className="h-4 w-4 shrink-0 text-zinc-500" />
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                category === c
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-4">
                <div className="mb-3 h-20 animate-pulse rounded-lg bg-white/5" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-white/5" />
                <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-white/5" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((g) => (
            <Card key={g.id} className="group cursor-pointer border-white/5 bg-white/[0.02] transition hover:border-emerald-500/30 hover:bg-white/[0.04]">
              <CardContent className="p-4">
                <div className="mb-3 flex h-20 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/15 to-cyan-500/15 text-4xl transition group-hover:scale-105">
                  {g.thumbnail}
                </div>
                <div className="truncate text-sm font-medium text-zinc-100">{g.title}</div>
                <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-400" />4.{Math.floor(Math.random() * 9)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {Math.floor(Math.random() * 9000 + 1000)}
                  </span>
                </div>
                {g.progress > 0 && (
                  <div className="mt-2">
                    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                      {g.progress}% complete
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <Card className="border-dashed border-white/10 bg-white/[0.01]">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Search className="h-8 w-8 text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-400">No games match your search.</p>
            <Button variant="ghost" size="sm" className="mt-2 text-emerald-400 hover:text-emerald-300" onClick={() => setQuery('')}>
              Clear filters
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center pt-4">
        <Button variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-300 hover:border-emerald-500/40 hover:text-white">
          <Loader2 className="h-4 w-4" />
          Load more games
        </Button>
      </div>
    </div>
  );
}
