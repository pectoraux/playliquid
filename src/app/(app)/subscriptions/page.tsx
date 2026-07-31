'use client';

import { RolePage } from '@/components/role-page';
import { Repeat } from 'lucide-react';
export default function SubscriptionsPage() {
  return <RolePage config={{ title: 'Subscriptions', description: 'Active subscribers and revenue', icon: Repeat, role: 'marketplace', sections: [{ title: 'Subscriptions', type: 'stats', data: [{ label: 'Active', value: '4,200' }, { label: 'Revenue', value: '21,000 GHS' }, { label: 'Churn Rate', value: '2.1%' }, { label: 'Avg Duration', value: '4.2 months' }] }] }} />;
}
