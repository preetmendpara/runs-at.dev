const ESCAPES = {
  '&': '\\u0026',
  '<': '\\u003c',
  '>': '\\u003e',
  [String.fromCharCode(0x2028)]: '\\u2028',
  [String.fromCharCode(0x2029)]: '\\u2029',
};

const PATTERN = new RegExp(`[&<>${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, 'g');

// Serialize JSON-LD safely for embedding in a <script> tag: every
// HTML-significant character is escaped to a \u-sequence so the payload
// can never break out of the tag, even rendered as a plain text child.
export function jsonLdString(obj) {
  return JSON.stringify(obj).replace(PATTERN, (c) => ESCAPES[c]);
}
