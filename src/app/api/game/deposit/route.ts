import { POST_deposit } from '../economy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return POST_deposit(req); }
