'use client';

import { RolePage } from '@/components/role-page';
import { Users } from 'lucide-react';
export default function CommunityPage() {
  return <RolePage config={{ title: 'Community', description: 'Friends, clans, and social', icon: Users, role: 'player', sections: [{ title: 'Friends Online', type: 'stats', data: [{ label: 'Online Now', value: 8 }, { label: 'Total Friends', value: 42 }, { label: 'Pending Requests', value: 3 }, { label: 'Clan Members', value: 24 }] }, { title: 'Recent Activity', type: 'list', data: [{ id: '1', title: 'Alex finished Liquid Tournament', subtitle: 'Score: 15,200 · 2 hours ago' }, { id: '2', title: 'Jordan joined your clan', subtitle: '3 hours ago' }, { id: '3', title: 'Sam sent you a friend request', subtitle: '5 hours ago' }] }] }} />;
}
