import { REPO_URL } from '../../lib/repo.js';
import { getStarCount } from '../../lib/stars.js';
import { publishedPosts } from '../../lib/blog.js';

// Blog is listed only once there is a post to read.
const LINKS = [
  ...(publishedPosts().length > 0 ? [{ href: '/blog', label: 'Blog' }] : []),
  { href: '/docs', label: 'Docs' },
  { href: '/stats', label: 'Stats' },
  { href: '/faq', label: 'FAQ' },
  { href: '/policy', label: 'Policy' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/manage', label: 'Manage' },
  { href: '/feed.xml', label: 'RSS' },
];

export default async function Footer() {
  const stars = await getStarCount();

  // The colophon: a ink plate under a vermilion rule, the name set as a
  // bleeding display line, then an index of every route and the credits.
  return (
    <footer className="surface-ink mt-32 border-t-[6px] border-(--color-accent)">
      <div className="mx-auto max-w-[1200px] px-4 pt-12 pb-10 sm:px-6 sm:pt-16">
        <p
          aria-hidden="true"
          className="text-[clamp(2.75rem,12vw,9.5rem)] leading-[0.82] tracking-[-0.02em] text-(--color-ink) uppercase select-none"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          runs-at<span className="text-(--color-accent)">.</span>dev
        </p>

        <div className="mt-12 grid gap-10 border-t border-(--line) pt-8 md:grid-cols-[1fr_1.4fr] md:gap-16">
          <div>
            <p className="font-(family-name:--font-mono) text-[11px] tracking-[0.12em] text-(--color-muted) uppercase">Reports</p>
            <p className="mt-3 text-[16px] text-(--color-ink)">
              <a className="text-(--color-ink) underline" href="mailto:abuse@runs-at.dev">
                abuse@runs-at.dev
              </a>
              <span className="text-(--color-muted)"> for reports</span>
            </p>
            <p className="meta mt-6 normal-case">
              © 2026 · every name is a file in a{' '}
              <a
                className="text-(--color-muted) underline hover:text-(--color-ink)"
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                public repo
              </a>
              {/* Only render the count once it is worth showing -- "★ 3" reads as
                  nobody cares, which is worse than no number at all. */}
              {typeof stars === 'number' && stars >= 25 && (
                <span> ({stars.toLocaleString('en-US')} ★)</span>
              )}
            </p>
          </div>

          <nav aria-label="Footer">
            <p className="font-(family-name:--font-mono) text-[11px] tracking-[0.12em] text-(--color-muted) uppercase">Index</p>
            <ul className="mt-3 grid grid-cols-2 border-t border-(--line) sm:grid-cols-3">
              {LINKS.map((link) => (
                <li key={link.href} className="border-b border-(--line)">
                  <a
                    href={link.href}
                    className="block py-2.5 font-(family-name:--font-mono) text-[13px] tracking-[0.04em] text-(--color-ash) uppercase no-underline hover:text-(--color-accent-ink)"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li className="border-b border-(--line)">
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block py-2.5 font-(family-name:--font-mono) text-[13px] tracking-[0.04em] text-(--color-ash) uppercase no-underline hover:text-(--color-accent-ink)"
                >
                  GitHub ↗
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
