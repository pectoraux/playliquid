'use client';

import { RolePage } from '@/components/role-page';
import { TrendingUp } from 'lucide-react';
export default function SalesPage() {
  return <RolePage config={{ title: 'Sales', description: 'Sales analytics', icon: TrendingUp, role: 'marketplace', sections: [{ title: 'Sales', type: 'stats', data: [{ label: 'Today', value: '1,240' }, { label: 'This Week', value: '8,900' }, { label: 'This Month', value: '34,200' }, { label: 'Revenue', value: '89,000 GHS' }] }] }} />;
}
