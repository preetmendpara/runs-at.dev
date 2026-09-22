import { publishedPosts } from '../../lib/blog.js';

// RSS 2.0 feed for the blog. Published posts only; drafts never leak here.
export const dynamic = 'force-static';

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function GET() {
  const posts = publishedPosts();
  const items = posts
    .map(
      (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>https://runs-on.dev/blog/${p.slug}</link>
      <guid isPermaLink="true">https://runs-on.dev/blog/${p.slug}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description>${escapeXml(p.description)}</description>
      <category>${escapeXml(p.category)}</category>
      ${p.image ? `<enclosure url="https://runs-on.dev${escapeXml(p.image)}" type="${p.image.endsWith('.png') ? 'image/png' : p.image.endsWith('.webp') ? 'image/webp' : 'image/jpeg'}" />` : ''}
    </item>`,
    )
    .join('\n');

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>runs-on.dev updates</title>
    <link>https://runs-on.dev/blog</link>
    <description>New features, registry changes, and engineering notes from the free subdomain registry.</description>
    <language>en</language>
    <lastBuildDate>${new Date(posts[0]?.date ?? Date.now()).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(feed, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  });
}
