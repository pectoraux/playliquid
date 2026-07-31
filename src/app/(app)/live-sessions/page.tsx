'use client';

import { RolePage } from '@/components/role-page';
import { Radio } from 'lucide-react';
export default function LiveSessionsPage() {
  return <RolePage config={{ title: 'Live Sessions', description: 'Active support sessions', icon: Radio, role: 'support', sections: [{ title: 'Active', type: 'stats', data: [{ label: 'Live Sessions', value: 12 }, { label: 'Avg Wait Time', value: '2 min' }, { label: 'Avg Resolution', value: '8 min' }, { label: 'Satisfaction', value: '4.4 ★' }] }] }} />;
}
