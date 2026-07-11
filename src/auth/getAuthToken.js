/**
 * auth/getAuthToken.js
 * ====================
 * Wraps chrome.identity.getAuthToken in a Promise.
 *
 * Responsibility: obtain a Google OAuth access token for the current user.
 * All Gmail/Google API calls import this — never call chrome.identity directly.
 *
 * interactive: true  → shows Google sign-in UI if the user is not yet signed in
 * interactive: false → returns null silently (useful for background checks)
 */

/**
 * Returns a valid OAuth access token for the signed-in Google account.
 *
 * @param {{ interactive?: boolean }} [options]
 * @returns {Promise<string>} OAuth access token
 */
export function getAuthToken({ interactive = true } = {}) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Removes a token from Chrome's cache, forcing a fresh token on the next getAuthToken() call.
 * Call this when an API returns 401 or 403 — the cached token may be stale or missing a scope.
 *
 * @param {string} token
 */
export function removeCachedAuthToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}
