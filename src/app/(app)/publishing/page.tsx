'use client';

import { RolePage } from '@/components/role-page';
import { Rocket } from 'lucide-react';
export default function PublishingPage() {
  return <RolePage config={{ title: 'Publishing', description: 'Publication queue and schedule', icon: Rocket, role: 'studio', sections: [{ title: 'Publishing Queue', type: 'list', data: [{ id: 'q1', title: 'Untitled Game', subtitle: 'Reviewing', badge: { text: 'In Review', variant: 'secondary' } }, { id: 'q2', title: 'Liquid Tournament v2', subtitle: 'Scheduled for Mar 15', badge: { text: 'Scheduled', variant: 'default' } }] }] }} />;
}
