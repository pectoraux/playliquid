import { handleStartValidation } from '@/interfaces/api/launch/launch-handlers';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return handleStartValidation(req); }
