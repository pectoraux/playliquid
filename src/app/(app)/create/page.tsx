'use client';

import { RolePage } from '@/components/role-page';
import { Palette } from 'lucide-react';
export default function CreatePage() {
  return <RolePage config={{ title: 'Create', description: 'Build your next game', icon: Palette, role: 'creator', sections: [{ title: 'Quick Start', type: 'cards', data: [{ id: '1', title: 'AI Game Generator', description: 'Describe your idea and let AI build it', icon: '🤖' }, { id: '2', title: 'Empty Project', description: 'Start from scratch', icon: '📦' }, { id: '3', title: 'From Template', description: 'Use a pre-made template', icon: '📋' }] }] }} />;
}
