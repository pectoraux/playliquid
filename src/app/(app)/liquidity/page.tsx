'use client';

import { RolePage } from '@/components/role-page';
import { Activity } from 'lucide-react';
export default function LiquidityPage() {
  return <RolePage config={{ title: 'Liquidity', description: 'Platform liquidity management', icon: Activity, role: 'finance', sections: [{ title: 'Liquidity', type: 'stats', data: [{ label: 'Available', value: '580,000 GHS' }, { label: 'Reserved', value: '120,000 GHS' }, { label: 'Pending Settlements', value: 14 }, { label: 'Completed Today', value: 89 }] }] }} />;
}
