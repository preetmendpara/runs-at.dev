import { createHmac, timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { registryChanged } from '../../../lib/registry-cache.js';

export async function POST(request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return new Response('webhook secret not configured', { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get('x-hub-signature-256') ?? '';
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response('bad signature', { status: 401 });
  }

  if (request.headers.get('x-github-event') !== 'push') {
    return Response.json({ revalidated: false, ignored: true });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('bad payload', { status: 400 });
  }

  const touched = (payload.commits ?? []).flatMap((c) => [
    ...(c.added ?? []),
    ...(c.modified ?? []),
    ...(c.removed ?? []),
  ]);

  let registry = false;
  for (const file of touched) {
    const match = file.match(/^domains\/([a-z0-9-]+)\.json$/);
    if (match) {
      revalidatePath(`/sites/${match[1]}`);
      registry = true;
    }
  }
  // Any claim file added, edited or removed -- including PR merges and hand
  // edits that never pass through /api/claim -- refreshes the shared snapshot
  // the homepage and /stats count from.
  if (registry) registryChanged('push');

  return Response.json({ revalidated: true, registry });
}
