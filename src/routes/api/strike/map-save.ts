import { json } from '@solidjs/router';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isEditMode } from '../../../lib/server/edit-mode';
import { parseLayout, serializeLayout } from '../../../lib/strike/map/map-format';

/**
 * Persists the current map layout inside the repo (src/lib/strike/map/kyoto.wsmap)
 * so the game picks it up on the next reload. Only reachable when the dev server
 * was launched with --edit.
 */
export async function POST(event: { request: Request }) {
  if (!isEditMode()) {
    return json({ success: false, error: 'Map editor is disabled' }, { status: 403 });
  }

  try {
    const body = await event.request.json();
    const raw = typeof body?.layout === 'string' ? body.layout : JSON.stringify(body);

    const layout = parseLayout(raw);
    const target = resolve(process.cwd(), 'src/lib/strike/map/kyoto.wsmap');

    await writeFile(target, serializeLayout(layout), 'utf8');

    return json({
      success: true,
      path: target,
      name: layout.name,
      objects: layout.objects.length,
      spawns: layout.spawns.length
    });
  } catch (err: any) {
    return json({ success: false, error: err?.message || 'Save failed' }, { status: 400 });
  }
}