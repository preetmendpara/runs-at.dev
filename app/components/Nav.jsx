// Solid top bar: wordmark left, mono section links, and the claim key at
// right. Below 640px the links fold into a [ MENU ] panel (see nav-links.jsx).
// The link list lives here because Blog depends on the filesystem, which only
// the server can read.
import Wordmark from './wordmark.jsx';
import NavLinks from './nav-links.jsx';
import { publishedPosts } from '../../lib/blog.js';

// Blog is listed only once there is a post to read.
const LINKS = [
  ...(publishedPosts().length > 0 ? [{ href: '/blog', label: 'Blog' }] : []),
  { href: '/docs', label: 'Docs' },
  { href: '/stats', label: 'Stats' },
  { href: '/faq', label: 'FAQ' },
  { href: '/about', label: 'About' },
];

export default function Nav() {
  return (
    <header className="sticky top-0 z-40 border-t-4 border-b-2 border-t-(--color-accent) border-b-(--line-strong) bg-(--color-paper)">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6">
        <Wordmark />
        <NavLinks links={LINKS} />
      </div>
    </header>
  );
}
