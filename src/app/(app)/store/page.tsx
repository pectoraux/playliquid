'use client';

import { RolePage } from '@/components/role-page';
import { Store } from 'lucide-react';
export default function StorePage() {
  return <RolePage config={{ title: 'Store', description: 'Marketplace overview', icon: Store, role: 'marketplace', sections: [{ title: 'Performance', type: 'stats', data: [{ label: 'Total Sales', value: '34,200' }, { label: 'Revenue', value: '89,000 GHS' }, { label: 'Conversion', value: '4.2%' }, { label: 'Active Listings', value: '156' }] }] }} />;
}
