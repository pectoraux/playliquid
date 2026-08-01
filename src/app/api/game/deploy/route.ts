import { POST_deployGame } from '../economy';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return POST_deployGame(req); }
