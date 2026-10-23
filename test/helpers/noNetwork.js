// Preloaded for every test file via `node --test --import`. Any fetch that a test
// did not explicitly fake is rejected, so a forgotten stub can never reach a
// real Google, Firebase or depot endpoint.

import { blockedFetch } from './networkGuard.js';

globalThis.fetch = blockedFetch;
