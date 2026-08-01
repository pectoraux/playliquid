import { POST_follow, GET_followers } from '../route';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return POST_follow(req); }
export async function GET(req: Request) { return GET_followers(req); }
