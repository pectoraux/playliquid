import { GET_capacity } from '../generate';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { return GET_capacity(req); }
