'use client';

import { RolePage } from '@/components/role-page';
import { Gamepad2 } from 'lucide-react';
export default function MyGamesPage() {
  return <RolePage config={{ title: 'My Games', description: 'Manage your published and draft games', icon: Gamepad2, role: 'creator', sections: [{ title: 'Published', type: 'table', data: { columns: ['Title', 'Plays', 'Revenue', 'Rating'], rows: [['Liquid Tournament', '12,450', '3,400 GHS', '4.6 ★'], ['Cosmic Puzzle', '8,200', '2,100 GHS', '4.3 ★']] } }, { title: 'Drafts', type: 'list', data: [{ id: 'd1', title: 'Untitled Game', subtitle: 'Last edited 2 hours ago', badge: { text: 'Draft', variant: 'secondary' } }] }] }} />;
}
