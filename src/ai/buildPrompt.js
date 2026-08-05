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
  let shipmentSection;
  if (!shipment) {
    shipmentSection = 'No consignment number was found in this email.';
  } else if (!shipment.found) {
    shipmentSection = `Consignment ${shipment.trackingNumber} is not in the depot system.`;
  } else {
    shipmentSection = [
      `Consignment: ${shipment.trackingNumber}`,
      `Status:      ${shipment.status}`,
      `Depot notes: ${shipment.lastEvent ?? 'none'}`,
    ].join('\n');
  }

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
