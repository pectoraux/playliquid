'use client';

import { RolePage } from '@/components/role-page';
import { AlertTriangle } from 'lucide-react';
export default function FlaggedGamesPage() {
  return <RolePage config={{ title: 'Flagged Games', description: 'Games with community flags', icon: AlertTriangle, role: 'moderator', sections: [{ title: 'Flagged', type: 'list', data: [{ id: 'fg1', title: 'Questionable Game', subtitle: '15 flags · 3 different users', badge: { text: 'High', variant: 'destructive' } }, { id: 'fg2', title: 'Another Game', subtitle: '8 flags · 2 different users', badge: { text: 'Medium', variant: 'secondary' } }] }] }} />;
}
