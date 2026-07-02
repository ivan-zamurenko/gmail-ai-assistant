/**
 * ai/buildPrompt.js
 * =================
 * Constructs the prompt string that is sent to the AI model.
 *
 * Responsibility: pure function — takes data, returns a string.
 * No network calls. No imports from other modules.
 * Change the prompt here without touching any other file.
 */

/**
 * Builds a complete instruction prompt for the AI model, combining
 * the email content with available shipment context.
 *
 * @param {{ subject: string, from: string, body: string }} email
 * @param {import('../shipment/normalizeShipment.js').Shipment|null} shipment
 * @returns {string}
 */
export function buildPrompt(email, shipment) {
  const shipmentSection = shipment
    ? [
        `Status:             ${shipment.status}`,
        `Last event:         ${shipment.lastEvent          ?? 'N/A'}`,
        `Estimated delivery: ${shipment.estimatedDelivery  ?? 'N/A'}`,
      ].join('\n')
    : 'No shipment information available for this inquiry.';

  return `
You are a professional customer support agent for a delivery company.
Your goal is to write a helpful, polite, and concise reply to the email below.
Do not make up information. If you don't know something, say so honestly.

--- CUSTOMER EMAIL ---
From:    ${email.from}
Subject: ${email.subject}

${email.body.trim()}

--- SHIPMENT INFORMATION ---
${shipmentSection}

Write a reply email. Start directly with the reply text — do not add a subject line.
`.trim();
}
