import { handleListFeedback, handleSubmitFeedback } from '@/interfaces/api/launch/launch-handlers';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { return handleListFeedback(req); }
export async function POST(req: Request) { return handleSubmitFeedback(req); }
