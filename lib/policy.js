import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Renders the actual repo file, not a hand-copied version, so /policy can
// never drift from docs/POLICY.md. Parses the small markdown subset that
// file actually uses: an h1 (dropped, the page renders its own), h2
// sections, paragraphs, bullet lists, **bold**, and [text](url) links.
export function loadPolicy() {
  const raw = readFileSync(join(process.cwd(), 'POLICY.md'), 'utf8');
  const lines = raw.split('\n');

  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('# ')) continue; // title, page renders its own h1
    if (line.startsWith('## ')) {
      current = { title: line.slice(3).trim(), blocks: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;

    if (line.startsWith('- ')) {
      const last = current.blocks[current.blocks.length - 1];
      if (last?.type === 'list') last.items.push(line.slice(2).trim());
      else current.blocks.push({ type: 'list', items: [line.slice(2).trim()] });
      continue;
    }

    if (line.trim() === '') continue;

    const last = current.blocks[current.blocks.length - 1];
    if (last?.type === 'p') last.text += ' ' + line.trim();
    else current.blocks.push({ type: 'p', text: line.trim() });
  }

  return sections;
}

// Splits a paragraph on **bold** and [text](url) markers into React-ready
// segments: {text} or {bold: text} or {link: text, href}.
export function parseInline(text) {
  const parts = [];
  const pattern = /\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\)/g;
  let last = 0;
  let m;
  while ((m = pattern.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ bold: m[1] });
    else parts.push({ link: m[2], href: m[3] });
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
