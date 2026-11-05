/**
 * src/auth/mailAuth.js
 * ====================
 * Separate Google sign-in for the depot mailbox (owner decision 2026-11-05,
 * option B). Independent of the Chrome profile account: launchWebAuthFlow with a
 * Web OAuth client, then the token is accepted only if Gmail confirms it belongs
 * to the configured mailbox. Any other account is refused, never read.
 */
export const MAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const PROFILE = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
const KEY = 'depotMailToken';

export const MAIL_AUTH_MESSAGES = {
  not_configured: 'Пошта depot не налаштована (gmailClientId/gmailAccount у local.js)',
  signin_required: 'Потрібен вхід у робочу пошту: popup → Gmail → «Увійти в робочу пошту»',
  wrong_account: 'Увійшли не в той акаунт — потрібна робоча пошта depot',
};

const fail = code => Object.assign(new Error(MAIL_AUTH_MESSAGES[code]), { code });

export function createMailAuth({ identity, storage, fetchImpl = globalThis.fetch, clientId, account, redirectUri, now = Date.now }) {
  const expected = String(account ?? '').trim().toLowerCase();

  async function getToken({ interactive = false } = {}) {
    if (!clientId || !expected || !redirectUri) throw fail('not_configured');
    const cached = (await storage.get(KEY))?.[KEY];
    if (cached?.account === expected && cached.expiresAt - 60_000 > now()) return cached.token;
    const params = new globalThis.URLSearchParams({ client_id: clientId, response_type: 'token', redirect_uri: redirectUri,
      scope: MAIL_SCOPE, login_hint: expected, prompt: interactive ? 'select_account' : 'none' });
    let redirect;
    try {
      redirect = await identity.launchWebAuthFlow({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, interactive });
    } catch {
      throw fail('signin_required');
    }
    const fragment = new globalThis.URLSearchParams(String(redirect ?? '').split('#')[1] ?? '');
    const token = fragment.get('access_token');
    const seconds = Number(fragment.get('expires_in'));
    if (!token || fragment.get('error')) throw fail('signin_required');
    const res = await fetchImpl(PROFILE, { headers: { Authorization: `Bearer ${token}` } });
    const email = res.ok ? String((await res.json())?.emailAddress ?? '').toLowerCase() : '';
    if (email !== expected) {
      await storage.remove(KEY);
      throw fail('wrong_account');
    }
    await storage.set({ [KEY]: { token, account: expected, expiresAt: now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000 } });
    return token;
  }

  async function forget() { await storage.remove(KEY); }

  return { getToken, forget };
}
