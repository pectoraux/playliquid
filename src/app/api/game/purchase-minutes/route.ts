import { POST_purchaseMinutes } from '../economy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return POST_purchaseMinutes(req); }
