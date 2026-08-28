/**
 * bot/config/local.example.js
 * ===========================
 * Copy this file to `local.js` and fill in real values.
 * `local.js` and `serviceAccount.json` are gitignored — never commit secrets.
 */
export const LOCAL = {
  // ── Discord ──────────────────────────────────────────────────────────────
  // From https://discord.com/developers/applications
  //   discordToken  → Bot tab → Reset Token
  //   applicationId → General Information → Application ID
  //   guildId       → your Discord server → right-click → Copy Server ID
  //                   (needs User Settings → Advanced → Developer Mode = on)
  discordToken:  'YOUR_BOT_TOKEN',
  applicationId: 'YOUR_APPLICATION_ID',
  guildId:       'YOUR_SERVER_ID',

  // ── Firebase (the shared task queue) ─────────────────────────────────────
  // Firebase console → Project settings → Service accounts →
  //   "Generate new private key" → save the JSON as bot/config/serviceAccount.json
  // The project id is read from that file automatically — nothing else to set.
  firebase: {
    serviceAccountPath: 'config/serviceAccount.json',
    // Stable anonymous Firebase UID printed by the extension's offscreen console.
    // This binds queue tasks to this one Chrome profile without a separate login.
    executorUid: 'YOUR_EXTENSION_EXECUTOR_UID',
  },

  // ── Google Maps (optional) ───────────────────────────────────────────────
  // Only Google resolves Irish Eircodes → coordinates. Without this, /find
  // still works but skips the Eircode-to-scan distance line.
  // Google Cloud console → APIs & Services → Credentials → Create API key,
  // then enable "Geocoding API" + "Maps Static API". Free within the monthly credit.
  googleMapsApiKey: '',
};
