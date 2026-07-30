import { handleCreateOrganization } from '@/interfaces/api/identity/identity-handlers';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return handleCreateOrganization(req); }
