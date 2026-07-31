'use client';

import { RolePage } from '@/components/role-page';
import { Wallet } from 'lucide-react';
export default function WalletPage() {
  return <RolePage config={{ title: 'Wallet', description: 'Your balance and transactions', icon: Wallet, role: 'player', sections: [{ title: 'Balance', type: 'stats', data: [{ label: 'Available', value: '12,500 GHS' }, { label: 'Pending', value: '500 GHS' }, { label: 'Total Rewards', value: '3,200 GHS' }, { label: 'This Month', value: '+1,100 GHS' }] }, { title: 'Recent Activity', type: 'table', data: { columns: ['Date', 'Description', 'Amount'], rows: [['Today', 'Tournament Win', '+500'], ['Yesterday', 'Daily Bonus', '+100'], ['2 days ago', 'Game Purchase', '-250'], ['3 days ago', 'Achievement Reward', '+500']] } }] }} />;
}
