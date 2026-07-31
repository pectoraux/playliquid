import { handleCreatePermission } from '@/interfaces/api/identity/identity-handlers';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return handleCreatePermission(req); }
