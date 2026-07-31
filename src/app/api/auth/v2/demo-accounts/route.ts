import { handleDemoAccounts } from '@/lib/auth/auth-handlers';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handleDemoAccounts();
}
