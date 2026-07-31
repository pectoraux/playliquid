'use client';

import { RolePage } from '@/components/role-page';
import { FileText } from 'lucide-react';
export default function AuditPage() {
  return <RolePage config={{ title: 'Audit Log', description: 'Immutable audit trail', icon: FileText, role: 'admin', sections: [{ title: 'Recent Audit Events', type: 'table', data: { columns: ['Action', 'Actor', 'Target', 'Time'], rows: [['User Approved', 'admin', 'user_123', '5 min ago'], ['API Key Created', 'creator_demo', 'key_456', '1 hour ago'], ['Role Assigned', 'admin', 'user_789', '2 hours ago']] } }] }} />;
}
