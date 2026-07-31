'use client';

import { RolePage } from '@/components/role-page';
import { Users } from 'lucide-react';
export default function DevelopersPage() {
  return <RolePage config={{ title: 'Developers', description: 'Team members and roles', icon: Users, role: 'studio', sections: [{ title: 'Team', type: 'table', data: { columns: ['Name', 'Role', 'Status'], rows: [['Alex Chen', 'Lead Developer', 'Active'], ['Sam Patel', 'Game Designer', 'Active'], ['Jordan Lee', 'Artist', 'On Leave']] } }] }} />;
}
