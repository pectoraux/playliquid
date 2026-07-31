import { handleRebuild } from '@/interfaces/workers/handlers';

export const dynamic = 'force-dynamic';

export async function POST() {
  return handleRebuild();
}
