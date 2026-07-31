'use client';

import { RolePage } from '@/components/role-page';
import { LifeBuoy } from 'lucide-react';
export default function TicketsPage() {
  return <RolePage config={{ title: 'Tickets', description: 'Support tickets', icon: LifeBuoy, role: 'support', sections: [{ title: 'Open Tickets', type: 'table', data: { columns: ['Subject', 'Priority', 'Status', 'Created'], rows: [['Payment not received', 'High', 'Open', '10 min ago'], ['Game crashing on launch', 'Medium', 'In Progress', '30 min ago'], ['Cannot withdraw winnings', 'High', 'Open', '1 hour ago'], ['Account login issue', 'Low', 'Resolved', '2 hours ago']] } }] }} />;
}
