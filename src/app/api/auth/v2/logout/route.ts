import { handleLogout } from '@/lib/auth/auth-handlers';

export const dynamic = 'force-dynamic';

export async function POST() {
  return handleLogout();
}
