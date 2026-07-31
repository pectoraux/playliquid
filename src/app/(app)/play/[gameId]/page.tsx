'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home } from 'lucide-react';
import { LiquidTournament } from './liquid-tournament';
import { BubblePopMania } from './bubble-pop';
import { NeonRunner } from './neon-runner';
import { CosmicPuzzle } from './cosmic-puzzle';

const GAMES: Record<string, { title: string; description: string; Component: React.ComponentType }> = {
  'liquid-tournament': {
    title: 'Liquid Tournament',
    description: 'Test your reflexes — tap targets fast!',
    Component: LiquidTournament,
  },
  'bubble-pop': {
    title: 'Bubble Pop Mania',
    description: 'Pop bubbles before they float away!',
    Component: BubblePopMania,
  },
  'neon-runner': {
    title: 'Neon Runner',
    description: 'Jump over obstacles in the neon city!',
    Component: NeonRunner,
  },
  'cosmic-puzzle': {
    title: 'Cosmic Puzzle',
    description: 'Match all cosmic pairs!',
    Component: CosmicPuzzle,
  },
};

export default function GamePlayerPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const game = GAMES[gameId];

  if (!game) {
    notFound();
  }

  const GameComponent = game.Component;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="text-zinc-400 hover:text-zinc-200">
          <Link href="/play">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Games
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild className="text-zinc-400 hover:text-zinc-200">
          <Link href="/home">
            <Home className="mr-2 h-4 w-4" />
            Home
          </Link>
        </Button>
      </div>

      {/* Game title */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">{game.title}</h1>
        <p className="text-sm text-zinc-500">{game.description}</p>
      </div>

      {/* Game component */}
      <GameComponent />
    </div>
  );
}
