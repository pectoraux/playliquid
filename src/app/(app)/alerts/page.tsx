'use client';

import { RolePage } from '@/components/role-page';
import { Bell } from 'lucide-react';
export default function AlertsPage() {
  return <RolePage config={{ title: 'Alerts', description: 'System alerts and notifications', icon: Bell, role: 'operations', sections: [{ title: 'Recent Alerts', type: 'list', data: [{ id: 'a1', title: 'Deployment completed successfully', subtitle: '10 min ago', badge: { text: 'Info', variant: 'secondary' } }, { id: 'a2', title: 'Redis memory at 72%', subtitle: '1 hour ago', badge: { text: 'Warning', variant: 'destructive' } }] }] }} />;
}
