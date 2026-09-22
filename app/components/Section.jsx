// Sections are separated by a horizontal slit and named by a mono uppercase
// label in Input's voice. The slit is painted as the section's top edge, so
// it spans the content column and fades out at both ends.
export function Section({ title, children }) {
  return (
    <section className="slit-top mt-16 pt-8">
      <h2 className="meta">{title}</h2>
      <div className="mt-6 space-y-10 text-(--color-ink)">{children}</div>
    </section>
  );
}

export function Quote({ children }) {
  return (
    <p className="slit-frame rounded-lg bg-(--color-card) p-5 text-sm leading-relaxed text-(--color-ash)">
      {children}
    </p>
  );
}
