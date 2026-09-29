'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const isActive = (pathname, href) => pathname === href || pathname.startsWith(`${href}/`);

// Desktop: a row of mono labels, the current section inverted. Mobile
// (below 640px): a [ MENU ] button toggling a square panel stacked under the
// header, holding the same links plus the claim action.
export default function NavLinks({ links }) {
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);

  // Close on navigation and on Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <nav aria-label="Site" className="hidden items-center gap-1 sm:flex">
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <a
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`border px-2.5 py-1.5 font-(family-name:--font-mono) text-[12px] tracking-[0.08em] uppercase no-underline ${
                active
                  ? 'border-(--color-ink) bg-(--color-ink) text-(--color-paper)'
                  : 'border-transparent text-(--color-muted) hover:border-(--line-strong) hover:text-(--color-ink)'
              }`}
            >
              {link.label}
            </a>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
          className={`whitespace-nowrap border px-2 py-1.5 font-(family-name:--font-mono) text-[12px] tracking-[0.06em] uppercase sm:hidden ${
            open ? 'border-(--color-ink) bg-(--color-ink) text-(--color-paper)' : 'border-(--line-strong) text-(--color-ink)'
          }`}
        >
          [ {open ? 'Close' : 'Menu'} ]
        </button>
        {/* Below 360px the row cannot hold all three controls; the claim
            action stays one tap away inside the menu panel. */}
        <a href="/#claim" className="btn-pill hidden whitespace-nowrap min-[360px]:inline-flex px-2.5 py-1.5 text-[11px] sm:px-4 sm:text-[12px]">
          Claim yours
          <span aria-hidden="true" className="hidden sm:inline">↗</span>
        </a>
      </div>

      <nav
        id="mobile-nav"
        aria-label="Site"
        hidden={!open}
        className="absolute inset-x-0 top-full border-b-2 border-(--line-strong) bg-(--color-paper) sm:hidden"
      >
        <ul className="slit-rows">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={close}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center justify-between px-4 py-3.5 font-(family-name:--font-mono) text-[13px] tracking-[0.08em] uppercase no-underline ${
                    active ? 'bg-(--color-ink) text-(--color-paper)' : 'text-(--color-ink) hover:bg-(--color-card)'
                  }`}
                >
                  {link.label}
                  <span aria-hidden="true">{active ? '■' : '→'}</span>
                </a>
              </li>
            );
          })}
          <li className="p-4">
            <a href="/#claim" onClick={close} className="btn-pill w-full">
              Claim yours
              <span aria-hidden="true">↗</span>
            </a>
          </li>
        </ul>
      </nav>
    </>
  );
}
