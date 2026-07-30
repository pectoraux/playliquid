import { handleListWaitlist } from '@/interfaces/api/identity/identity-handlers';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { return handleListWaitlist(req); }
