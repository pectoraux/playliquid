import { GET_sessionStatus } from '../economy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { return GET_sessionStatus(req); }
