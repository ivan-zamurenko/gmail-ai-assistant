// Paste the built dist/console/lookup.js into the depot tab's console to try
// the real module by hand — no duplicated snippet to drift out of sync.
import { depotLookup } from './lookup.js';

window.depotLookup = depotLookup;
console.log('depotLookup ready. Try:  await depotLookup(["131787155", "633582029"])');
