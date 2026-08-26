// Template for the gitignored local.js. Copy this file to local.js and fill it
// in — local.js holds secrets/contacts and never reaches the repo.
export const LOCAL = {
  geminiApiKey:  '',
  driveFolderId: '',
  // Shared task queue with the Discord bot. Firebase console → Project settings →
  // General → Your apps → Web app config. apiKey is a public identifier, not a
  // secret — the tasks collection is protected by Firebase security rules.
  firebase: {
    apiKey:    '',
    projectId: '',
  },
  contact: {
    brand: 'Powered by You',
    email: '',
    phone: '',
  },
};
