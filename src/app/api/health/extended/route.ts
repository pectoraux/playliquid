import { handleExtendedHealth } from '@/interfaces/api/handlers';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handleExtendedHealth();
}
