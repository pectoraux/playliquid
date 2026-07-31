'use client';

import { RolePage } from '@/components/role-page';
import { Users } from 'lucide-react';
export default function UsersPage() {
  return <RolePage config={{ title: 'Users', description: 'Manage all platform users', icon: Users, role: 'admin', sections: [{ title: 'User Stats', type: 'stats', data: [{ label: 'Total Users', value: '12,480' }, { label: 'Active', value: '11,200' }, { label: 'Suspended', value: 23 }, { label: 'Pending', value: 12 }] }] }} />;
}
