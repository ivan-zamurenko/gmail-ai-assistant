/**
 * ai/openai.js
 * ============
 * Low-level wrapper for the OpenAI Chat Completions API.
 * All OpenAI HTTP calls go through this file.
 *
 * Responsibility: one method per API endpoint.
 * Does NOT build prompts — that is buildPrompt's job.
 */

import { request }    from '../utils/request.js';
import { loadConfig } from '../config/config.js';

export const openai = {
  /**
   * Sends a single user message to the chat completions endpoint
   * and returns the assistant's reply text.
   *
   * TODO: replace stub with real OpenAI call.
   *
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async complete(prompt) {
    const { openaiApiKey, openaiModel } = await loadConfig();

    // const response = await request.post('https://api.openai.com/v1/chat/completions', {
    //   headers: { Authorization: `Bearer ${openaiApiKey}` },
    //   body: {
    //     model:    openaiModel,
    //     messages: [{ role: 'user', content: prompt }],
    //   },
    // });
    // return response.choices[0].message.content;

    return '[AI reply stub — implement openai.complete() with a real API call]';
  },
};
