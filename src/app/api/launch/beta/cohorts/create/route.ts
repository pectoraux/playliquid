import { handleCreateCohort } from '@/interfaces/api/launch/launch-handlers';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) { return handleCreateCohort(req); }
