/** Small transport for Google adapters. Callers explicitly declare read semantics.
 * No provider body, URL or credentials belong in an error. A cancelled write
 * can still finish remotely; only reconciliation can establish its outcome.
 */
export class ApiError extends Error {
  constructor(code, { status, attempts = 0, exhausted = false } = {}) {
    super(`API request failed${status ? ` (HTTP ${status})` : ''} [${code}]`);
    this.code = code;
    this.status = status;
    this.attempts = attempts;
    this.exhausted = exhausted;
  }
}

const TRANSIENT = new Set(['resource-exhausted', 'unavailable', 'deadline-exceeded']);
const statusCode = status => status === 401 ? 'unauthenticated'
  : status === 403 ? 'permission-denied'
    : status === 429 ? 'resource-exhausted'
      : status >= 500 ? 'unavailable' : 'request-rejected';

function wait(ms, signal, attempts) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(new ApiError('aborted', { attempts }));
    const timer = setTimeout(() => finish(), ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function fetchApi(url, {
  readOnly = false, parse = 'json', signal, timeoutMs = 15000,
  retryDelayMs = 250, ...init
} = {}) {
  // Limits remain bounded even when an internal caller supplies tuning options.
  timeoutMs = Number.isFinite(timeoutMs) ? Math.min(15000, Math.max(1, timeoutMs)) : 15000;
  retryDelayMs = Number.isFinite(retryDelayMs) ? Math.min(1000, Math.max(0, retryDelayMs)) : 250;
  const limit = readOnly ? 3 : 1;
  for (let attempts = 1; attempts <= limit; attempts++) {
    if (signal?.aborted) throw new ApiError('aborted', { attempts: attempts - 1 });
    const controller = new globalThis.AbortController();
    let timer;
    let abort;
    try {
      const interrupted = new Promise((_, reject) => {
        const stop = code => {
          reject(new ApiError(readOnly ? code : 'uncertain-write', { attempts }));
          controller.abort();
        };
        timer = setTimeout(() => stop('deadline-exceeded'), timeoutMs);
        abort = () => stop('aborted');
        signal?.addEventListener('abort', abort, { once: true });
      });
      const operation = (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!response.ok) {
          // A server failure after a write can follow a committed remote effect.
          const code = !readOnly && response.status >= 500 ? 'uncertain-write' : statusCode(response.status);
          throw new ApiError(code, { status: response.status, attempts });
        }
        return parse === 'none' ? undefined : response[parse]();
      })();
      return await Promise.race([operation, interrupted]);
    } catch (cause) {
      const error = cause instanceof ApiError ? cause : new ApiError(
        cause?.code === 'TEST_NETWORK_BLOCKED' ? 'TEST_NETWORK_BLOCKED'
          : readOnly ? 'unavailable' : 'uncertain-write', { attempts });
      if (!readOnly || !TRANSIENT.has(error.code)) throw error;
      if (attempts === limit) { error.exhausted = true; throw error; }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    await wait(retryDelayMs * attempts, signal, attempts);
  }
}
