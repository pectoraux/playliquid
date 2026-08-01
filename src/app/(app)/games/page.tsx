'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Gamepad2, ArrowUpRight } from 'lucide-react';

interface Game {
  id: string;
  title: string;
  creatorId: string;
  status: string;
  thumbnail: string;
}

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchGames = (query: string) => {
    setLoading(true);
    fetch(`/api/games${query ? `?search=${encodeURIComponent(query)}` : ''}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setGames(d.data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchGames('');
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchGames(search);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/15">
          <Gamepad2 className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Game Catalog</h1>
          <p className="text-sm text-zinc-500">Browse and play published games</p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search games…"
            className="border-white/10 bg-white/[0.03] pl-9 text-zinc-100"
          />
        </div>
      </form>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
        </div>
      ) : games.length === 0 ? (
        <Card className="border-white/5 bg-white/[0.02]">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Gamepad2 className="h-12 w-12 text-zinc-600" />
            <p className="mt-4 text-zinc-400">No games published yet.</p>
            <p className="text-sm text-zinc-600">Games will appear here once creators publish them.</p>
            <Link href="/play" className="mt-4 text-sm font-medium text-emerald-300 hover:text-emerald-200">
              Play built-in games →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <Link key={game.id} href={`/play/${game.id}`}>
              <Card className="group cursor-pointer border-white/5 bg-white/[0.02] transition-all hover:border-emerald-500/30">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-2xl">
                      {game.thumbnail}
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-300">Published</Badge>
                  </div>
                  <h3 className="mt-3 font-bold text-zinc-100">{game.title}</h3>
                  <p className="text-xs text-zinc-500">by {game.creatorId}</p>
                  <div className="mt-3 flex items-center gap-1 text-sm font-medium text-emerald-300 opacity-0 transition-opacity group-hover:opacity-100">
                    Play Now <ArrowUpRight className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
