'use client';

import { RolePage } from '@/components/role-page';
import { Gamepad2 } from 'lucide-react';
export default function PlayPage() {
  return <RolePage config={{ title: 'Play', description: 'Discover and play games', icon: Gamepad2, role: 'player', sections: [{ title: 'Trending Games', type: 'cards', data: [{ id: 'g1', title: 'Liquid Tournament', description: 'Compete in real-time', icon: '🏆', badge: { text: 'Live', variant: 'default' } }, { id: 'g2', title: 'Bubble Pop Mania', description: 'Casual puzzle fun', icon: '🫧' }, { id: 'g3', title: 'Neon Runner', description: 'Endless runner', icon: '🏃' }, { id: 'g4', title: 'Cosmic Puzzle', description: 'Mind-bending puzzles', icon: '🧩' }] }] }} />;
}
