/**
 * parser/extractCustomer.js
 * =========================
 * Extracts a customer name or identifier from a Gmail "From" header string.
 *
 * Responsibility: parse the From header — pure function, no side effects.
 */

/**
 * Extracts the customer name from a "From" header string.
 * Returns the display name if present, otherwise the email address.
 *
 * Examples:
 *   'John Doe <john@example.com>'  → 'John Doe'
 *   '"Acme Ltd" <orders@acme.com>' → 'Acme Ltd'
 *   'noreply@example.com'          → 'noreply@example.com'
 *
 * @param {string} fromHeader
 * @returns {string|null}
 */
export function extractCustomer(fromHeader) {
  if (!fromHeader) return null;

  // Display name before the angle-bracket address
  const nameMatch = fromHeader.match(/^"?([^"<@\n]+?)"?\s*</);
  if (nameMatch) return nameMatch[1].trim();

  // Bare email address (no display name)
  const emailMatch = fromHeader.match(/([^\s<>"]+@[^\s<>"]+)/);
  return emailMatch ? emailMatch[1].trim() : null;
}
