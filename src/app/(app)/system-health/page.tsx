'use client';

import { RolePage } from '@/components/role-page';
import { Activity } from 'lucide-react';
export default function SystemHealthPage() {
  return <RolePage config={{ title: 'System Health', description: 'Platform health monitoring', icon: Activity, role: 'operations', sections: [{ title: 'Health', type: 'stats', data: [{ label: 'Status', value: 'Healthy' }, { label: 'Uptime', value: '99.97%' }, { label: 'Incidents', value: 0 }, { label: 'Active Users', value: '3,420' }] }] }} />;
}
