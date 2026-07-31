import { handleWorkerHealth } from '@/interfaces/workers/handlers';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handleWorkerHealth();
}
