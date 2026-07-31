import { handleQueryDispatch } from '@/interfaces/api/handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleQueryDispatch(req);
}
