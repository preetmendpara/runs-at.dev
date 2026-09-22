import infrastructure from '../data/reserved-infrastructure.json' with { type: 'json' };
import brands from '../data/reserved-brands.json' with { type: 'json' };
import words from '../data/reserved-words.json' with { type: 'json' };

const LISTS = [
  ['infrastructure', new Set(infrastructure)],
  ['brands', new Set(brands)],
  ['words', new Set(words)],
];

export function isReserved(name) {
  if (typeof name !== 'string') return { reserved: false };
  const key = name.trim().toLowerCase();
  for (const [list, set] of LISTS) {
    if (set.has(key)) return { reserved: true, list };
  }
  return { reserved: false };
}
