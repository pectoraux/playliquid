import { handleRevokeInvitation } from '@/interfaces/api/launch/launch-handlers';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return handleRevokeInvitation(req); }
