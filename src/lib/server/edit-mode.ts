/**
 * Map editor gate. The editor is enabled only when the dev server was
 * launched with `--edit` / `--editor` (scripts/dev.mjs sets WAIFU_EDITOR=1)
 * or when the worker argv itself carries the flag. No user roles yet.
 */
export function isEditMode(): boolean {
  try {
    if (process.env.WAIFU_EDITOR === '1') return true;
    return process.argv.some((a) => a === '--edit' || a === '--editor');
  } catch {
    return false;
  }
}