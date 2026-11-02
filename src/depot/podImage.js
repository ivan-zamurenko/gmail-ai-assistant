/**
 * src/depot/podImage.js
 * =====================
 * Fetches the proof-of-delivery photo for one delivered scan event.
 *
 * Runs in the extension (background), never in the depot page: the DPD API
 * credentials and access token must not enter the page's MAIN world, where page
 * scripts could patch fetch/btoa. The depot tab only supplies the event id.
 */

const AUTHORIZE_URL = 'https://api2.dpd.ie/common/api/authorize';
const POD_URL = 'https://papi.dpd.ie/pw/rs/mwcon/webresources/consignment/event/image/';

/**
 * @param {string} eventId - numeric depot scan event id of the delivered scan
 * @param {{ user?: string, password?: string, type?: string, basicAuthorization?: string }} [podAuth]
 * @returns {Promise<{ image: { mime: string, body: string } } | { error: string }>}
 */
export async function fetchPodImage(eventId, podAuth) {
  if (!eventId) return { error: 'POD event ID is missing' };
  if (!/^\d{1,20}$/.test(String(eventId))) return { error: 'POD event ID is invalid' };
  if (!podAuth?.user || !podAuth?.password) return { error: 'POD authorization is not configured' };
  try {
    // Provider client authorization is separate from the request-body user.
    const authorization = podAuth.basicAuthorization
      ?? `Basic ${globalThis.btoa(`${podAuth.user}:${podAuth.password}`)}`;
    if (typeof authorization !== 'string' || !/^Basic [A-Za-z0-9+/]+={0,2}$/.test(authorization)) {
      return { error: 'POD authorization is not configured' };
    }
    const authorize = await fetch(AUTHORIZE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
      },
      credentials: 'omit',
      body: JSON.stringify({
        User: podAuth.user,
        Password: podAuth.password,
        Type: podAuth.type || 'HO',
      }),
    });
    if (!authorize.ok) return { error: `POD authorize HTTP ${authorize.status}` };
    const authData = await authorize.json();
    if (!authData.AccessToken) return { error: 'POD authorization returned no access token' };

    const response = await fetch(POD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${authData.TokenType || 'Bearer'} ${authData.AccessToken}`,
      },
      credentials: 'omit',
      body: JSON.stringify({ ImgType: 'POD', EventID: String(eventId), Original: false }),
    });
    if (!response.ok) return { error: `POD request HTTP ${response.status}` };
    const data = await response.json();
    const images = Array.isArray(data.Image) ? data.Image : [];
    const image = images.find((item) => /^pod$/i.test(item.ImgType ?? '') && item.ImgBody);
    if (image) return { image: { mime: 'image/jpeg', body: image.ImgBody } };
    const status = String(data.Status ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
    return { error: `POD image unavailable (${status}, ${images.length} image records)` };
  } catch {
    return { error: 'POD request failed' };
  }
}

/** Fixed diagnostic vocabulary; never expose provider text or identifiers in logs. */
export function podFailureCode(error) {
  const fixed = new Map([
    ['POD event ID is missing', 'EVENT_ID_MISSING'],
    ['POD event ID is invalid', 'EVENT_ID_INVALID'],
    ['POD authorization is not configured', 'AUTH_NOT_CONFIGURED'],
    ['POD authorization returned no access token', 'AUTH_TOKEN_MISSING'],
    ['POD request failed', 'REQUEST_FAILED'],
  ]);
  if (fixed.has(error)) return fixed.get(error);
  if (typeof error !== 'string') return 'UNKNOWN';
  const http = /^POD (authorize|request) HTTP ([1-5][0-9]{2})$/.exec(error);
  if (http) return `${http[1] === 'authorize' ? 'AUTH' : 'IMAGE'}_HTTP_${http[2]}`;
  if (/^POD image unavailable \([A-Za-z0-9_-]{0,24}, \d+ image records\)$/.test(error)) return 'IMAGE_UNAVAILABLE';
  return 'UNKNOWN';
}
