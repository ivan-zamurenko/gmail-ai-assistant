/**
 * ai/gemini.js  (was openai.js)
 * ==============================
 * Low-level wrapper for the Google Gemini API.
 * All Gemini HTTP calls go through this file.
 *
 * Model: gemini-2.0-flash  (free tier: 1500 req/day)
 * Docs:  https://ai.google.dev/gemini-api/docs
 */

import { loadConfig } from '../config/config.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL       = 'gemini-2.0-flash';

/**
 * Sends a text prompt to Gemini and returns the response text.
 *
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export const gemini = {
  async complete(prompt) {
    const { geminiApiKey } = await loadConfig();
    if (!geminiApiKey) throw new Error('Gemini API key not set in Settings');

    const res = await fetch(
      `${GEMINI_BASE}/${MODEL}:generateContent?key=${geminiApiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.candidates[0].content.parts[0].text.trim();
  },
};
