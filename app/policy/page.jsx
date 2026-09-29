import { Section } from '../docs/components.jsx';
import PageHeader from '../components/page-header.jsx';
import { loadPolicy, parseInline } from '../../lib/policy.js';

export const metadata = {
  title: 'Policy',
  description:
    'The terms for runs-at.dev in plain language: names are free and may be reclaimed, what forfeits a name immediately, and how to report abuse.',
  alternates: { canonical: 'https://runs-at.dev/policy' },
  openGraph: { title: 'Policy · runs-at.dev' },
};

const REPO_BLOB = 'https://github.com/preetmendpara/runs-at.dev/blob/main/';

function resolveHref(href) {
  return href.startsWith('http') ? href : REPO_BLOB + href;
}

function Inline({ text }) {
  return parseInline(text).map((part, i) => {
    if (part.bold) return <strong key={i}>{part.bold}</strong>;
    if (part.link)
      return (
        <a key={i} className="text-(--color-signal) underline" href={resolveHref(part.href)}>
          {part.link}
        </a>
      );
    return <span key={i}>{part.text}</span>;
  });
}

export default function Policy() {
  const sections = loadPolicy();

  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <PageHeader label="policy" title="Policy">
        This page is rendered from{' '}
        <a
          className="text-(--color-signal) underline"
          href="https://github.com/preetmendpara/runs-at.dev/blob/main/POLICY.md"
        >
          POLICY.md
        </a>{' '}
        in the registry, which is the canonical copy. If the two ever disagree, the repo file
        wins.
      </PageHeader>

      <div className="hard-shadow mt-12 border-2 border-(--line-strong) bg-(--color-card) px-5 pb-10 sm:px-10 [&>section:first-child]:mt-8">
      {sections.map((section) => (
        <Section title={section.title} key={section.title}>
          {section.blocks.map((block, i) =>
            block.type === 'list' ? (
              <ul className="list-disc space-y-2 pl-6 text-[15px] leading-[1.6] text-(--color-ash) marker:text-(--color-muted) sm:text-base" key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] leading-[1.6] text-(--color-ash) sm:text-base" key={i}>
                <Inline text={block.text} />
              </p>
            ),
          )}
        </Section>
      ))}
      </div>
    </main>
  );
}
