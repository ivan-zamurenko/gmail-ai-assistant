/**
 * utils/delay.js
 * ==============
 * Returns a Promise that resolves after the specified milliseconds.
 * Use for rate-limiting, retry back-off, or sequential timing.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
