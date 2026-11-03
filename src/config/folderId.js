/** Accept only a folder ID or a Google Drive folder URL, before any API call. */
export function parseFolderId(input) {
  const invalid = () => { throw new Error('Config driveFolderId invalid — use a Drive folder ID or folder URL'); };
  if (typeof input !== 'string') return invalid();
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{1,200}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/(?:drive\/(?:u\/\d+\/)?)?folders\/([A-Za-z0-9_-]{1,200})\/?$/);
    if (url.protocol === 'https:' && url.hostname === 'drive.google.com' && !url.port
        && !url.username && !url.password && match) return match[1];
  } catch { /* Fixed error below, never echo input. */ }
  return invalid();
}
