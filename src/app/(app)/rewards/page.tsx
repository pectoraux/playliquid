'use client';

import { RolePage } from '@/components/role-page';
import { Gift } from 'lucide-react';
export default function RewardsPage() {
  return <RolePage config={{ title: 'Rewards', description: 'Your achievements and bonuses', icon: Gift, role: 'player', sections: [{ title: 'Total Earned', type: 'stats', data: [{ label: 'Total Rewards', value: '3,200 GHS' }, { label: 'This Month', value: '500 GHS' }, { label: 'Streak', value: '7 days' }, { label: 'Rank', value: '#142' }] }, { title: 'Recent Rewards', type: 'list', data: [{ id: 'r1', title: 'Daily Login Bonus', subtitle: '+100 GHS · Today', badge: { text: 'Claimed', variant: 'default' } }, { id: 'r2', title: 'Tournament Participation', subtitle: '+250 GHS · Yesterday', badge: { text: 'Claimed', variant: 'default' } }, { id: 'r3', title: 'Achievement: Speed Demon', subtitle: '+500 GHS · 2 days ago', badge: { text: 'Claimed', variant: 'default' } }] }] }} />;
}
