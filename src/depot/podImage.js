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
 * @param {{ user?: string, password?: string, type?: string }} [podAuth]
 * @returns {Promise<{ image: { mime: string, body: string } } | { error: string }>}
 */
export async function fetchPodImage(eventId, podAuth) {
  if (!eventId) return { error: 'POD event ID is missing' };
  if (!/^\d{1,20}$/.test(String(eventId))) return { error: 'POD event ID is invalid' };
  if (!podAuth?.user || !podAuth?.password) return { error: 'POD authorization is not configured' };
  try {
    const basic = globalThis.btoa(`${podAuth.user}:${podAuth.password}`);
    const authorize = await fetch(AUTHORIZE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basic}`,
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
