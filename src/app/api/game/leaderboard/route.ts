import { GET_leaderboard } from '../economy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { return GET_leaderboard(req); }
