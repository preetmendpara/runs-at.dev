const SHAPE = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;

export function validateName(name) {
  if (typeof name !== 'string') return { ok: false, reason: 'charset' };
  if (name.length < 2 || name.length > 32) return { ok: false, reason: 'length' };
  if (name.startsWith('-') || name.endsWith('-')) return { ok: false, reason: 'hyphen' };
  if (!SHAPE.test(name)) return { ok: false, reason: 'charset' };
  if (name.startsWith('xn--')) return { ok: false, reason: 'punycode' };
  if (name.slice(2, 4) === '--') return { ok: false, reason: 'punycode' };
  return { ok: true };
}
