/** Pure, bounded Gmail normalization. HTML and attachment bodies are never read. */
const HEADER_KEYS = {
  subject: 'subject', from: 'from', 'reply-to': 'replyTo', to: 'to',
  'message-id': 'messageId', 'in-reply-to': 'inReplyTo', references: 'references',
  // Needed by the reply policy to skip automated mail (G_GMAIL_POLICY).
  'auto-submitted': 'autoSubmitted', 'list-id': 'listId', precedence: 'precedence',
};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
const emptyHeaders = () => Object.fromEntries(Object.values(HEADER_KEYS).map(key => [key, []]));
const fail = reason => { throw reason; };
const REASONS = new Set(['invalid_headers', 'invalid_mime', 'invalid_encoding', 'payload_too_large', 'unsupported_charset']);

export function normalizeMessage(raw) {
  const result = {
    status: 'needs_review', reason: 'invalid_message', messageId: null, threadId: null,
    headers: emptyHeaders(), text: '', attachments: [],
  };
  if (!record(raw) || !identifier(raw.id) || !identifier(raw.threadId)) return result;
  result.messageId = raw.id;
  result.threadId = raw.threadId;
  let parts = 0;
  let headerSize = 0;
  let encodedSize = 0;
  let textSize = 0;
  let sawHtml = false;
  const texts = [];
  const attachments = [];

  function readHeaders(value, keep) {
    if (value === undefined) return;
    if (!Array.isArray(value)) fail('invalid_headers');
    if (value.length > 100) fail('payload_too_large');
    for (const header of value) {
      if (!record(header) || typeof header.name !== 'string' || typeof header.value !== 'string') fail('invalid_headers');
      headerSize += header.name.length + header.value.length;
      if (header.name.length > 256 || header.value.length > 4096 || headerSize > 16384) fail('payload_too_large');
      const name = header.name.toLowerCase();
      const key = Object.hasOwn(HEADER_KEYS, name) ? HEADER_KEYS[name] : null;
      if (keep && key) result.headers[key].push(header.value);
    }
  }

  function decode(data, charset) {
    if (typeof data !== 'string') fail('invalid_encoding');
    encodedSize += data.length;
    if (encodedSize > 131072) fail('payload_too_large');
    if (!/^[A-Za-z0-9_-]*={0,2}$/.test(data) || data.replace(/=+$/, '').length % 4 === 1
        || (data.includes('=') && data.length % 4 !== 0)) fail('invalid_encoding');
    let value;
    try {
      const binary = globalThis.atob(data.replace(/-/g, '+').replace(/_/g, '/'));
      value = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
    } catch { fail('invalid_encoding'); }
    if (charset === 'us-ascii' && Array.from(value).some(char => char.charCodeAt(0) > 127)) fail('invalid_encoding');
    value = value.replace(/\r\n?/g, '\n');
    textSize += value.length + (texts.length && value ? 2 : 0);
    if (textSize > 65536) fail('payload_too_large');
    if (value) texts.push(value);
  }

  function walk(part, depth) {
    if (++parts > 100 || depth > 12) fail('payload_too_large');
    if (!record(part) || typeof part.mimeType !== 'string' || part.mimeType.length > 256
        || (part.body !== undefined && !record(part.body))) fail('invalid_mime');
    readHeaders(part.headers, depth === 0);
    const filename = part.filename ?? '';
    const body = part.body ?? {};
    if (typeof filename !== 'string') fail('invalid_mime');
    if (filename.length > 1024) fail('payload_too_large');
    const attachment = (part.headers ?? []).some(header => header.name.toLowerCase() === 'content-disposition'
      && /^\s*attachment(?:;|\s|$)/i.test(header.value));
    if (filename || body.attachmentId !== undefined || attachment) {
      if ((body.attachmentId !== undefined && (typeof body.attachmentId !== 'string' || !body.attachmentId || body.attachmentId.length > 4096))
          || (body.size !== undefined && (!Number.isSafeInteger(body.size) || body.size < 0))) fail('invalid_mime');
      attachments.push({ filename, mimeType: part.mimeType, size: body.size ?? null,
        ...(body.attachmentId === undefined ? {} : { attachmentId: body.attachmentId }) });
      return;
    }
    if (part.mimeType.startsWith('multipart/')) {
      if (!Array.isArray(part.parts)) fail('invalid_mime');
      if (part.parts.length > 100) fail('payload_too_large');
      for (const child of part.parts) walk(child, depth + 1);
    } else if (part.mimeType === 'text/plain') {
      const charsets = (part.headers ?? []).filter(header => header.name.toLowerCase() === 'content-type')
        .map(header => /\bcharset\s*=\s*"?([^";\s]+)/i.exec(header.value)?.[1]?.toLowerCase()).filter(Boolean);
      if (charsets.some(charset => !['utf-8', 'utf8', 'us-ascii'].includes(charset))) fail('unsupported_charset');
      if (body.data !== undefined) decode(body.data, charsets.includes('us-ascii') ? 'us-ascii' : 'utf-8');
    } else if (part.mimeType === 'text/html') {
      sawHtml = true;
    }
  }

  try {
    walk(raw.payload, 0);
    result.attachments = attachments;
    result.text = texts.join('\n\n');
    result.reason = result.text.trim() ? null : sawHtml ? 'html_only' : 'body_missing';
    result.status = result.reason === null ? 'ready' : 'needs_review';
    return result;
  } catch (reason) {
    // No partial text/headers: an omitted part might contain another shipment.
    return { ...result, headers: emptyHeaders(), text: '', attachments: [],
      reason: REASONS.has(reason) ? reason : 'invalid_mime' };
  }
}
