import { handleLogin } from '@/lib/auth/auth-handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleLogin(req);
}
