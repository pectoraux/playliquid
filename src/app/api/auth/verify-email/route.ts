import { handleVerifyEmail } from '@/interfaces/api/identity/identity-handlers';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return handleVerifyEmail(req); }
