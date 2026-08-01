import { POST_generate } from '../generate';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return POST_generate(req); }
