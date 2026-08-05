/**
 * ai/gemini.js
 * ============
 * Low-level wrapper for the Google Gemini API.
 * All Gemini text HTTP calls go through this file.
 *
 * Docs: https://ai.google.dev/gemini-api/docs
 */

import { loadConfig } from '../config/config.js';
import { CONSTANTS }  from '../utils/constants.js';

const GEMINI_BASE = CONSTANTS.GEMINI_BASE_URL;
const MODEL       = CONSTANTS.GEMINI_TEXT_MODEL;

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
