'use client';

import { RolePage } from '@/components/role-page';
import { Code2 } from 'lucide-react';
export default function ApiDocsPage() {
  return <RolePage config={{ title: 'API Documentation', description: 'Developer API reference', icon: Code2, role: 'developer', sections: [{ title: 'Endpoints', type: 'table', data: { columns: ['Method', 'Path', 'Description'], rows: [['POST', '/api/auth/v2/login', 'Authenticate user'], ['GET', '/api/auth/v2/session', 'Get current session'], ['POST', '/api/commands', 'Dispatch a command'], ['POST', '/api/queries', 'Execute a query'], ['GET', '/api/health', 'Health check'], ['GET', '/api/metrics', 'Prometheus metrics']] } }] }} />;
}
