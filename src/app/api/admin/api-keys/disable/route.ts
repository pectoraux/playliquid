import { handleDisableApiKey } from '@/interfaces/api/identity/identity-handlers';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return handleDisableApiKey(req); }
