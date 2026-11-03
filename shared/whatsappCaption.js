/** Pure presentation contract shared by bot export and bundled extension. */
export function formatWhatsAppCaption(text) {
  return text.split('\n').map(line => {
    const heading = line.trim();
    if (heading === 'Parcel recovery & redelivery') return '*Parcel recovery & redelivery*';
    const event = /^(?:📦\s*)?(Delivery recorded|Attempted delivery)$/.exec(heading);
    if (event) return `📦 *${event[1]}*`;
    if (/^(?:🏠\s*)?Deliver to$/.test(heading)) return '🏠 *Deliver to*';
    const route = /^(?:👉\s*)?(Navigate to (?:collection point|attempted delivery point|delivery address):)$/.exec(heading);
    if (route) return `👉 *${route[1]}*`;
    return line.replace(/^(Consignment|Delivered|Attempted|Signed for by|Eircode|Phone):/, '*$1:*');
  }).join('\n');
}
