'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gamepad2, Trophy, Clock, Zap, Users, Star, ArrowUpRight } from 'lucide-react';

interface GameCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  players: string;
  rating: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  badge?: { text: string; variant: 'default' | 'secondary' };
  gradient: string;
}

const GAMES: GameCard[] = [
  {
    id: 'liquid-tournament',
    title: 'Liquid Tournament',
    description: 'Test your reflexes! Tap targets as fast as you can in 30 seconds. Build combos for bonus points.',
    icon: '🏆',
    category: 'Arcade',
    players: '12.4K playing',
    rating: 4.8,
    difficulty: 'Medium',
    badge: { text: 'Live', variant: 'default' },
    gradient: 'from-emerald-600/20 to-cyan-600/20',
  },
  {
    id: 'bubble-pop',
    title: 'Bubble Pop Mania',
    description: 'Pop bubbles before they float away! Rare red bubbles are worth 50 points. How many can you pop?',
    icon: '🫧',
    category: 'Casual',
    players: '8.2K playing',
    rating: 4.6,
    difficulty: 'Easy',
    gradient: 'from-cyan-600/20 to-blue-600/20',
  },
  {
    id: 'neon-runner',
    title: 'Neon Runner',
    description: 'Run through the neon city! Jump over low obstacles and duck under high ones. Speed increases over time.',
    icon: '🏃',
    category: 'Action',
    players: '5.6K playing',
    rating: 4.5,
    difficulty: 'Hard',
    badge: { text: 'Trending', variant: 'secondary' },
    gradient: 'from-purple-600/20 to-pink-600/20',
  },
  {
    id: 'cosmic-puzzle',
    title: 'Cosmic Puzzle',
    description: 'Match all 8 cosmic pairs! Fewer moves and faster time = better score. Train your memory!',
    icon: '🧩',
    category: 'Puzzle',
    players: '3.4K playing',
    rating: 4.7,
    difficulty: 'Medium',
    gradient: 'from-indigo-600/20 to-purple-600/20',
  },
];

export default function PlayPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/15">
          <Gamepad2 className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Play Games</h1>
          <p className="text-sm text-zinc-500">Pick a game and start playing instantly — no download needed</p>
        </div>
      </div>

      {/* Featured Games Grid */}
      <div>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-400">Featured Games</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {GAMES.map((game) => (
            <Link key={game.id} href={`/play/${game.id}`}>
              <Card className={`group cursor-pointer border-white/5 bg-gradient-to-br ${game.gradient} transition-all hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-4xl backdrop-blur-sm">
                      {game.icon}
                    </div>
                    {game.badge && (
                      <Badge variant={game.badge.variant} className={game.badge.variant === 'default' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}>
                        {game.badge.text}
                      </Badge>
                    )}
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-zinc-100">{game.title}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{game.description}</p>

                  <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-400" />
                      {game.rating}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-cyan-400" />
                      {game.players}
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3 text-emerald-400" />
                      {game.difficulty}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-300 opacity-0 transition-opacity group-hover:opacity-100">
                    Play Now
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Coming Soon */}
      <div>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-400">Coming Soon</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: '💎', title: 'Crystal Caverns', desc: 'RPG adventure' },
            { icon: '🏎️', title: 'Speed Racer X', desc: 'Racing' },
            { icon: '⚔️', title: 'Pixel Dungeon', desc: 'Roguelike' },
            { icon: '🌊', title: 'Ocean Tycoon', desc: 'Simulation' },
          ].map((g) => (
            <Card key={g.title} className="border-white/5 bg-white/[0.01] opacity-50">
              <CardContent className="p-4 text-center">
                <div className="text-3xl">{g.icon}</div>
                <div className="mt-2 text-sm font-medium text-zinc-300">{g.title}</div>
                <div className="text-xs text-zinc-600">{g.desc}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
