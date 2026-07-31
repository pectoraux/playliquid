'use client';

import { RolePage } from '@/components/role-page';
import { Flag } from 'lucide-react';
export default function ReportsPage() {
  return <RolePage config={{ title: 'Reports', description: 'User and content reports', icon: Flag, role: 'moderator', sections: [{ title: 'Open Reports', type: 'table', data: { columns: ['Type', 'Severity', 'Status', 'Time'], rows: [['Cheating', 'High', 'Open', '5 min ago'], ['Harassment', 'Medium', 'Investigating', '1 hour ago'], ['Inappropriate Content', 'High', 'Open', '2 hours ago'], ['Spam', 'Low', 'Resolved', '3 hours ago']] } }] }} />;
}
