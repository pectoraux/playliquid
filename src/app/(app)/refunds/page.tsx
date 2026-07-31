'use client';

import { RolePage } from '@/components/role-page';
import { Receipt } from 'lucide-react';
export default function RefundsPage() {
  return <RolePage config={{ title: 'Refund Requests', description: 'Process refund requests', icon: Receipt, role: 'support', sections: [{ title: 'Pending Refunds', type: 'list', data: [{ id: 'rf1', title: 'Game Purchase Refund', subtitle: '250 GHS · player@demo', badge: { text: 'Pending', variant: 'secondary' } }, { id: 'rf2', title: 'Tournament Entry Fee', subtitle: '100 GHS · player@demo', badge: { text: 'Approved', variant: 'default' } }] }] }} />;
}
