import { isEditMode } from '../../../lib/server/edit-mode';

export async function GET() {
  return new Response(
    JSON.stringify({ editEnabled: isEditMode() }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    }
  );
}