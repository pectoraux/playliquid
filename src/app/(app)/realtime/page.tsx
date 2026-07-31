'use client';

import { RolePage } from '@/components/role-page';
import { Radio } from 'lucide-react';
export default function RealtimePage() {
  return <RolePage config={{ title: 'Realtime', description: 'Live platform metrics', icon: Radio, role: 'operations', sections: [{ title: 'Realtime', type: 'stats', data: [{ label: 'Active Users', value: '3,420' }, { label: 'API Latency', value: '45ms' }, { label: 'Error Rate', value: '0.02%' }, { label: 'Requests/min', value: '12,400' }] }] }} />;
}
