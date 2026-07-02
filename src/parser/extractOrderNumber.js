/**
 * parser/extractOrderNumber.js
 * ============================
 * Extracts an order / consignment number from free-form email text.
 *
 * Responsibility: regex matching only — pure function, no side effects.
 * TODO: expand with platform-specific patterns (Shopify, WooCommerce, SAP, etc.)
 */

/**
 * Tries to extract an order number from the given text.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function extractOrderNumber(text) {
  // Pattern: "Order: 12345", "order #ORD-9876", "consignment: CON001"
  const match = text.match(
    /(?:order|consignment|cons\.?|ref\.?)\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9\-]{4,20})/i
  );

  return match ? match[1].toUpperCase() : null;
}
