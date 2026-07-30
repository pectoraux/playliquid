import { handleListAuditLog } from '@/interfaces/api/identity/identity-handlers';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { return handleListAuditLog(req); }
