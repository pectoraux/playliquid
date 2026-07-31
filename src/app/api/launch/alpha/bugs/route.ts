import { handleListBugs, handleReportBug } from '@/interfaces/api/launch/launch-handlers';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { return handleListBugs(req); }
export async function POST(req: Request) { return handleReportBug(req); }
