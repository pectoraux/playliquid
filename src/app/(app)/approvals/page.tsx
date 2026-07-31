'use client';

import { RolePage } from '@/components/role-page';
import { CheckCircle } from 'lucide-react';
export default function ApprovalsPage() {
  return <RolePage config={{ title: 'Approvals', description: 'Pending game and content approvals', icon: CheckCircle, role: 'moderator', sections: [{ title: 'Pending Approvals', type: 'list', data: [{ id: 'a1', title: 'New Game: Space Adventure', subtitle: 'Submitted by creator_demo', badge: { text: 'Pending', variant: 'secondary' } }, { id: 'a2', title: 'Content Update: Liquid Tournament', subtitle: 'Submitted by creator_demo', badge: { text: 'Pending', variant: 'secondary' } }] }] }} />;
}
