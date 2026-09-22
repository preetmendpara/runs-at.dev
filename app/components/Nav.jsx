// Transparent top bar over the obsidian canvas: wordmark left, a few section
// links at 14px uppercase smoke, and the single filled pill action at right.
// Its bottom edge is a slit of light fading at both ends; no sticky, no fill.
import Wordmark from './wordmark.jsx';

const LINKS = [
  { href: '/blog', label: 'Blog' },
  { href: '/docs', label: 'Docs' },
  { href: '/stats', label: 'Stats' },
  { href: '/faq', label: 'FAQ' },
  { href: '/about', label: 'About' },
];

export default function Nav() {
  return (
    <header className="sticky top-0 z-40 bg-(--color-paper)/85 backdrop-blur-md slit-bottom">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-6 px-6">
        <Wordmark />

        <nav aria-label="Site" className="hidden items-center gap-6 sm:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-(--color-muted) no-underline uppercase transition-colors hover:text-(--color-ink)"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <a href="/#claim" className="btn-pill px-5 py-2 text-[12px]">
          Claim yours
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </header>
  );
}
