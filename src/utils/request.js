/**
 * utils/request.js
 * ================
 * Thin fetch wrapper used by all modules that make HTTP calls.
 *
 * Responsibility:
 *  – sets JSON Content-Type header by default
 *  – throws a descriptive error on non-2xx responses
 *  – parses and returns JSON
 *
 * All network calls go through here — never call fetch() directly.
 */

export const request = {
  /**
   * @param {string} url
   * @param {{ headers?: Record<string,string> }} [options]
   * @returns {Promise<any>}
   */
  async get(url, options = {}) {
    const res = await fetch(url, {
      method:  'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    if (!res.ok) {
      throw new Error(`request.get → HTTP ${res.status} ${res.statusText}: ${url}`);
    }
    return res.json();
  },

  /**
   * @param {string} url
   * @param {{ headers?: Record<string,string>, body?: object }} [options]
   * @returns {Promise<any>}
   */
  async post(url, options = {}) {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body:    JSON.stringify(options.body ?? {}),
    });
    if (!res.ok) {
      throw new Error(`request.post → HTTP ${res.status} ${res.statusText}: ${url}`);
    }
    return res.json();
  },
};
