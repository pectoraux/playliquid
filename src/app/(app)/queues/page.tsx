'use client';

import { RolePage } from '@/components/role-page';
import { Database } from 'lucide-react';
export default function QueuesPage() {
  return <RolePage config={{ title: 'Queues', description: 'Background queue monitoring', icon: Database, role: 'operations', sections: [{ title: 'Queue Depth', type: 'table', data: { columns: ['Queue', 'Depth', 'Processing'], rows: [['outbox', '0', '0'], ['projections', '0', '0'], ['webhooks', '3', '1']] } }] }} />;
}
