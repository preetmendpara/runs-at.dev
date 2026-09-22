import { REPO_SLUG } from './repo.js';

// Reuses the card token for the same reason app/sites/[name] does: anonymous
// GitHub reads cap at 60/hour per IP, and serverless egress IPs are shared, so
// an unauthenticated count would go dark under any real traffic.
const TOKEN = () => process.env.CARD_TOKEN ?? process.env.REGISTRY_TOKEN;

// One cached read an hour, shared by every page that renders the footer.
// Always resolves: the star count is decoration, and the footer must never be
// the reason a page fails to render.
export async function getStarCount() {
  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const token = TOKEN();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`https://api.github.com/repos/${REPO_SLUG}`, {
      headers,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    const body = await res.json();
    return typeof body.stargazers_count === 'number' ? body.stargazers_count : null;
  } catch {
    return null;
  }
}
