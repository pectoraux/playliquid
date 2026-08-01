'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Trophy, Medal, Crown, Zap, Gamepad2 } from 'lucide-react';
import { useSession } from '@/lib/auth/use-session';
import Link from 'next/link';

interface LeaderboardEntry {
  rank: number;
  playerId: string;
  score: number;
  isPaid?: boolean;
}

export default function CompetePage() {
  const { session } = useSession();
  const [games, setGames] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [globalEntries, setGlobalEntries] = useState<LeaderboardEntry[]>([]);
  const [competitiveEntries, setCompetitiveEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'global' | 'competitive'>('global');

  useEffect(() => {
    fetch('/api/games').then(r => r.json()).then(d => {
      if (d.ok && d.data.length > 0) {
        const gameList = d.data.map((g: { id: string; title: string }) => ({ id: g.id, title: g.title }));
        setGames(gameList);
        setSelectedGame(gameList[0].id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedGame) return;
    fetch(`/api/game/leaderboard?gameId=${selectedGame}`).then(r => r.json()).then(d => {
      if (d.ok) {
        setGlobalEntries(d.data);
        // For competitive, filter only paid sessions (marked in GameSession table)
        // For now, same data since we track isPreview in GameSession
        setCompetitiveEntries(d.data.filter((e: LeaderboardEntry) => !e.playerId.includes('preview')));
      }
    }).catch(() => {});
  }, [selectedGame]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/15 to-emerald-500/15">
          <Trophy className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Compete</h1>
          <p className="text-sm text-zinc-500">Leaderboards, tournaments, and challenges</p>
        </div>
      </div>

      {/* Game selector */}
      <div className="flex flex-wrap gap-2">
        {games.map(g => (
          <Button
            key={g.id}
            onClick={() => setSelectedGame(g.id)}
            variant={selectedGame === g.id ? 'default' : 'outline'}
            className={selectedGame === g.id ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'border-white/10 text-zinc-400'}
            size="sm"
          >
            {g.title}
          </Button>
        ))}
      </div>

      {/* Leaderboard tabs */}
      <div className="flex gap-2">
        <Button onClick={() => setTab('global')} variant={tab === 'global' ? 'default' : 'outline'}
          className={tab === 'global' ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'border-white/10 text-zinc-400'}>
          <Trophy className="mr-2 h-4 w-4" /> Global
        </Button>
        <Button onClick={() => setTab('competitive')} variant={tab === 'competitive' ? 'default' : 'outline'}
          className={tab === 'competitive' ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'border-white/10 text-zinc-400'}>
          <Medal className="mr-2 h-4 w-4" /> Competitive
        </Button>
      </div>

      {/* Leaderboard */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="p-0">
          {tab === 'global' && (
            <LeaderboardList entries={globalEntries} currentUserId={session?.userId} type="global" />
          )}
          {tab === 'competitive' && (
            <LeaderboardList entries={competitiveEntries} currentUserId={session?.userId} type="competitive" />
          )}
        </CardContent>
      </Card>

      {/* Play link */}
      {selectedGame && (
        <div className="text-center">
          <Link href={`/play/${selectedGame}`}>
            <Button className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
              <Gamepad2 className="mr-2 h-4 w-4" /> Play {games.find(g => g.id === selectedGame)?.title}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function LeaderboardList({ entries, currentUserId, type }: { entries: LeaderboardEntry[]; currentUserId?: string; type: 'global' | 'competitive' }) {
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-zinc-500">No {type} scores yet.</p>
        <p className="text-xs text-zinc-600">Be the first to set a record!</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-white/5">
      {entries.map((entry, index) => (
        <div key={index} className={`flex items-center gap-4 p-4 ${entry.playerId === currentUserId ? 'bg-emerald-500/5' : ''}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold">
            {entry.rank === 1 ? <Crown className="h-5 w-5 text-amber-400" /> : 
             entry.rank === 2 ? <Medal className="h-5 w-5 text-zinc-300" /> :
             entry.rank === 3 ? <Medal className="h-5 w-5 text-amber-700" /> :
             <span className="text-zinc-500">{entry.rank}</span>}
          </div>
          <div className="flex-1">
            <div className="font-medium text-zinc-100">{entry.playerId}</div>
            {entry.playerId === currentUserId && <Badge className="mt-0.5 bg-emerald-500/20 text-emerald-300 text-xs">You</Badge>}
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 font-bold text-emerald-400">
              <Zap className="h-4 w-4" /> {entry.score}
            </div>
            <div className="text-xs text-zinc-500">points</div>
          </div>
        </div>
      ))}
    </div>
  );
}
