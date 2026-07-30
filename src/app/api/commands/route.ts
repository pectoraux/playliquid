import { handleCommandDispatch } from '@/interfaces/api/handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleCommandDispatch(req);
}
