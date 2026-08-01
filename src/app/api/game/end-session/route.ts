import { POST_endSession } from '../economy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return POST_endSession(req); }
