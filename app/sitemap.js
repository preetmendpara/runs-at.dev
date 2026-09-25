// Static pages plus published blog posts. Claimed subdomains live on their
// own hosts (or the built-in profile card at their own origin) and are not
// part of this site's route tree, so they don't belong in its sitemap.
import { publishedPosts } from '../lib/blog.js';

const ROUTES = [
  '', '/about', '/contact', '/faq', '/policy', '/privacy', '/stats',
  '/docs', '/docs/quickstart', '/docs/records', '/docs/seo', '/docs/resources',
  '/docs/free-subdomain-vs-domain',
  '/docs/guides',
  '/docs/guides/url-redirect',
  '/docs/guides/vercel',
  '/docs/guides/netlify',
  '/docs/guides/github-pages',
  '/docs/guides/cloudflare-pages',
  '/docs/guides/render',
  '/docs/guides/railway',
  '/docs/guides/firebase',
  '/docs/guides/replit',
  '/docs/guides/codeberg-pages',
  '/docs/guides/email-forwarding',
  '/docs/guides/bluesky-handle',
  '/docs/guides/discord-verification',
];

// The pages that actually change. /stats is regenerated from the registry on
// every claim; the rest are prose that changes when someone edits it.
const FRESH = new Set(['', '/stats', '/blog']);

export default function sitemap() {
  const posts = publishedPosts();

  // No lastModified on the static pages: no trustworthy per-page date exists,
  // and stamping the request time on every URL only teaches crawlers to
  // ignore the field. Posts carry their real dates.
  const routes = posts.length ? [...ROUTES, '/blog'] : ROUTES; // an empty blog is a thin page
  const pages = routes.map((route) => ({
    url: `https://runs-at.dev${route}`,
    changeFrequency: FRESH.has(route) ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.6,
  }));

  return [
    ...pages,
    ...posts.map((p) => ({
      url: `https://runs-at.dev/blog/${p.slug}`,
      lastModified: p.updated ? new Date(p.updated) : new Date(p.date),
      changeFrequency: 'monthly',
      priority: 0.5,
    })),
  ];
}
