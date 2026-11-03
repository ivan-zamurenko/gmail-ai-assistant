/** Node-only configuration. A broken/missing local module must not print secrets. */
let LOCAL;
try {
  ({ LOCAL } = await import('./local.js'));
} catch {
  throw new Error('Config bot/config/local.js unavailable — copy local.example.js and check its syntax');
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = key => { throw new Error(`Config ${key} invalid — check bot/config/local.js`); };
const required = (value, key) => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()
      || /^YOUR_/i.test(value) || /[\x00-\x1f\x7f]/.test(value)) fail(key);
};

export function loadConfig() {
  if (!record(LOCAL)) fail('shape');
  for (const key of ['discordToken', 'applicationId', 'guildId']) required(LOCAL[key], key);
  for (const key of ['applicationId', 'guildId']) {
    if (!/^\d{17,20}$/.test(LOCAL[key])) fail(key);
  }
  if (!record(LOCAL.firebase)) fail('firebase');
  for (const key of ['serviceAccountPath', 'executorUid']) required(LOCAL.firebase[key], `firebase.${key}`);
  if (LOCAL.firebase.executorUid.length > 128) fail('firebase.executorUid');
  if (LOCAL.googleMapsApiKey !== undefined && LOCAL.googleMapsApiKey !== '') {
    required(LOCAL.googleMapsApiKey, 'googleMapsApiKey');
  }
  // Preserve legacy/unknown fields; validation never edits the source file.
  return LOCAL;
}
