'use client';

import { RolePage } from '@/components/role-page';
import { DollarSign } from 'lucide-react';
export default function RevenuePage() {
  return <RolePage config={{ title: 'Revenue', description: 'Track your earnings', icon: DollarSign, role: 'creator', sections: [{ title: 'Earnings', type: 'stats', data: [{ label: 'Total Revenue', value: '5,500 GHS' }, { label: 'This Month', value: '1,200 GHS' }, { label: 'Total Plays', value: '20,650' }, { label: 'Avg Rating', value: '4.6 ★' }] }, { title: 'Revenue by Game', type: 'table', data: { columns: ['Game', 'Plays', 'Revenue', 'Avg / Play'], rows: [['Liquid Tournament', '12,450', '3,400 GHS', '0.27'], ['Cosmic Puzzle', '8,200', '2,100 GHS', '0.26']] } }] }} />;
}
