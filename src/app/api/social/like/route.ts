import { POST_like, GET_likes } from '../route';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return POST_like(req); }
export async function GET(req: Request) { return GET_likes(req); }
