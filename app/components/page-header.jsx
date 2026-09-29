// The header of a narrow-column page (legal, blog, manage, admin): the site
// identifier and an optional bracketed breadcrumb on a ruled line, the title
// in large Bitcount, and the page's own intro under a left rule. The same
// shape the redesigned public pages use, in one place.
export default function PageHeader({ label, crumb, title, children }) {
  return (
    <header>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b-2 border-(--line-strong) pb-3">
        <span className="font-(family-name:--font-mono) text-[12px] tracking-[0.08em] text-(--color-muted) uppercase">
          runs-at.dev // {label}
        </span>
        {crumb && <p className="meta">{crumb}</p>}
      </div>
      <h1 className="mt-8 text-[clamp(2rem,8vw,4.25rem)] leading-[0.95] font-normal tracking-[-0.01em] break-words text-(--color-ink) uppercase sm:mt-12">
        {title}
      </h1>
      {children && (
        <div className="mt-6 max-w-[640px] border-l-[6px] border-(--color-accent) pl-4 text-[17px] leading-[1.5] text-(--color-ash)">
          {children}
        </div>
      )}
    </header>
  );
}
