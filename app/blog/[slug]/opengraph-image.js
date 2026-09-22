import { ImageResponse } from 'next/og';
import { getPost, publishedPosts } from '../../../lib/blog.js';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return publishedPosts().map((p) => ({ slug: p.slug }));
}

export default function Image({ params }) {
  const post = getPost(params.slug);
  const title = post?.title ?? 'runs-on.dev updates';
  const date = post?.date ?? '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#101010',
          color: '#f3f3f3',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 28, letterSpacing: 2, color: '#9c9c9c', textTransform: 'uppercase', display: 'flex' }}>
            runs-on.dev
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', width: 120, height: 6, background: '#4d7cff', marginBottom: 36 }} />
          <span style={{ fontSize: title.length > 60 ? 56 : 72, fontWeight: 700, lineHeight: 1.1, display: 'flex' }}>
            {title}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#9c9c9c' }}>
          <span style={{ display: 'flex' }}>{date}</span>
          <span style={{ display: 'flex' }}>free subdomain registry</span>
        </div>
      </div>
    ),
    size,
  );
}
