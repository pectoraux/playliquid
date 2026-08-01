import { GET_comments, POST_comment } from '../route';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { return GET_comments(req); }
export async function POST(req: Request) { return POST_comment(req); }
