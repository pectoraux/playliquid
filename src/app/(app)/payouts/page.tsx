'use client';

import { RolePage } from '@/components/role-page';
import { DollarSign } from 'lucide-react';
export default function PayoutsPage() {
  return <RolePage config={{ title: 'Payout Queue', description: 'Pending creator payouts', icon: DollarSign, role: 'finance', sections: [{ title: 'Pending Payouts', type: 'table', data: { columns: ['Payee', 'Amount', 'Status'], rows: [['Creator Studio A', '12,000 GHS', 'Pending'], ['Indie Dev B', '3,400 GHS', 'Processing'], ['Studio C', '8,900 GHS', 'Pending']] } }] }} />;
}
