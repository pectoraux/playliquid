'use client';

import { RolePage } from '@/components/role-page';
import { Shield } from 'lucide-react';
export default function AntiCheatPage() {
  return <RolePage config={{ title: 'Anti-Cheat', description: 'Cheat detection and enforcement', icon: Shield, role: 'moderator', sections: [{ title: 'Stats', type: 'stats', data: [{ label: 'Flagged Players', value: 23 }, { label: 'Banned Today', value: 4 }, { label: 'Active Investigations', value: 7 }, { label: 'False Positives', value: '0.3%' }] }] }} />;
}
