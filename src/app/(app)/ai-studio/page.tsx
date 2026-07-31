'use client';

import { RolePage } from '@/components/role-page';
import { Sparkles } from 'lucide-react';
export default function AiStudioPage() {
  return <RolePage config={{ title: 'AI Studio', description: 'Generate game assets with AI', icon: Sparkles, role: 'creator', sections: [{ title: 'AI Tools', type: 'cards', data: [{ id: '1', title: 'Game Generator', description: 'Create a complete game from a description', icon: '🎮' }, { id: '2', title: 'Art Generator', description: 'Generate sprites and backgrounds', icon: '🎨' }, { id: '3', title: 'Music Generator', description: 'Create soundtracks and effects', icon: '🎵' }, { id: '4', title: 'Level Generator', description: 'Auto-generate levels and maps', icon: '🗺️' }] }] }} />;
}
