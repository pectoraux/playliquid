'use client';

import { RolePage } from '@/components/role-page';
import { Building2 } from 'lucide-react';
export default function StudiosPage() {
  return <RolePage config={{ title: 'Studios', description: 'Manage your game studios', icon: Building2, role: 'studio', sections: [{ title: 'Your Studios', type: 'cards', data: [{ id: 's1', title: 'Liquid Games Studio', description: '12 members · 5 projects', icon: '🏢', badge: { text: 'Active', variant: 'default' } }, { id: 's2', title: 'Neon Interactive', description: '8 members · 3 projects', icon: '🏢', badge: { text: 'Active', variant: 'default' } }] }] }} />;
}
