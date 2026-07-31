import { handleGetPerformanceSummary } from '@/interfaces/api/launch/launch-handlers';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { return handleGetPerformanceSummary(req); }
