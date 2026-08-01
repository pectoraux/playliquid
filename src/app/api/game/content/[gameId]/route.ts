import { GET_content } from '../../generate';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { return GET_content(req); }
