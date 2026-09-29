import JsonLd from '../components/JsonLd.jsx';
import { SITE_OG_IMAGE } from '../../lib/og.js';

export const metadata = {
  title: 'Free subdomain FAQ',
  description:
    'Answers about free runs-at.dev subdomains: cost, ownership, how many domains you can have, reclaiming, commercial use, DNS, SEO, and what happens if the service shuts down.',
  alternates: { canonical: 'https://runs-at.dev/faq' },
  openGraph: { title: 'Free subdomain FAQ · runs-at.dev', images: SITE_OG_IMAGE },
};

// Each answer is a list of parts: plain strings, or { href, text } links.
// The visible answer and the FAQPage JSON-LD are both built from these same
// parts, so the structured data always says exactly what the page says.
const l = (href, text) => ({ href, text });

const faqs = [
  {
    q: 'Is runs-at.dev really free?',
    a: [
      'Yes. Claiming and keeping a name costs nothing, and every eligible GitHub account includes one. It is a free, best-effort service, and the ',
      l('/policy', 'policy'),
      ' explains the terms, including that names can be reclaimed.',
    ],
  },
  {
    q: 'Is runs-at.dev a domain I own?',
    a: [
      'No. runs-at.dev is the parent domain, registered and renewed by its operator. What you claim is a subdomain beneath it, such as yourname.runs-at.dev, recorded against your GitHub account. You do not own or renew the parent domain. ',
      l('/docs/free-subdomain-vs-domain', 'Free subdomain vs free domain'),
      ' covers the practical difference.',
    ],
  },
  {
    q: 'How many domains can I have?',
    a: [
      'One domain is included with each eligible GitHub account. The administrator can grant additional domain slots to an account, and you claim each extra name yourself. All the names you own are listed together on ',
      l('/manage', 'runs-at.dev/manage'),
      ', behind a single GitHub sign-in.',
    ],
  },
  {
    q: 'How do I get a free subdomain?',
    a: [
      'Check a name on the ',
      l('/', 'homepage'),
      ', sign in with GitHub, claim it, then point it at your hosting or keep the default profile card. The ',
      l('/docs/quickstart', 'quickstart'),
      ' walks through each step.',
    ],
  },
  {
    q: 'What are the eligibility rules?',
    a: [
      'Your GitHub account must be at least 30 days old and have at least one public repository. Both are checked at the moment you claim, whether on the website or by pull request.',
    ],
  },
  {
    q: 'What names can I claim?',
    a: [
      'A name is 2 to 32 characters of lowercase letters, digits and hyphens. It cannot start or end with a hyphen, cannot have two hyphens as its third and fourth characters, and cannot be a reserved name or one already claimed.',
    ],
  },
  {
    q: 'Can I use the subdomain for commercial projects?',
    a: [
      'The ',
      l('/policy', 'policy'),
      ' does not restrict commercial use. Its other terms still apply: the service is best effort with no uptime guarantee, and a name used for impersonation, phishing, malware or illegal content is removed.',
    ],
  },
  {
    q: 'Can I use it with GitHub Pages, Vercel, Netlify, or Cloudflare Pages?',
    a: [
      'Yes. Each has a step-by-step guide: ',
      l('/docs/guides/github-pages', 'free subdomain for GitHub Pages'),
      ', ',
      l('/docs/guides/vercel', 'free subdomain for Vercel'),
      ', ',
      l('/docs/guides/netlify', 'free subdomain for Netlify'),
      ' and ',
      l('/docs/guides/cloudflare-pages', 'free subdomain for Cloudflare Pages'),
      '.',
    ],
  },
  {
    q: 'Can I manage DNS records?',
    a: [
      'Yes, for your own name. You can point it at a host with a CNAME, publish A, AAAA, TXT and MX records, redirect it, or leave it on the profile card, and add records on labels below your name for things like provider verification. A CNAME cannot share the name with other records. The ',
      l('/docs/records', 'DNS record reference'),
      ' lists everything.',
    ],
  },
  {
    q: 'Can I use email with it?',
    a: [
      'runs-at.dev does not host mailboxes. You can publish MX records on your name so mail for it reaches an email or forwarding service you choose; the ',
      l('/docs/guides/email-forwarding', 'email forwarding guide'),
      ' shows one way to set that up.',
    ],
  },
  {
    q: 'Is a subdomain good for SEO?',
    a: [
      'A subdomain is treated as its own site, and it can be indexed and ranked like any other. Whether it does well depends mostly on the content and the links pointing to it, not on the address alone; nothing guarantees a ranking. The ',
      l('/docs/seo', 'SEO guide'),
      ' covers canonical addresses and search console verification.',
    ],
  },
  {
    q: 'Can I redirect a name?',
    a: [
      'Yes. A URL record sends visitors to another address with a temporary 307 redirect. Nothing is served at the name itself, so a redirect is a handy short link rather than something that will rank.',
    ],
  },
  {
    q: 'Can a claimed name be reclaimed?',
    a: [
      'Yes. The operator reserves the right to reclaim any name, including one that has gone dormant. A name used for impersonation, phishing, malware or illegal content is removed without notice by a maintainer. You can also release your own name at any time from ',
      l('/manage', 'runs-at.dev/manage'),
      '. The ',
      l('/policy', 'policy'),
      ' has the full wording.',
    ],
  },
  {
    q: 'What happens if I stop using the name?',
    a: [
      'Nothing happens automatically on a timer, but the policy treats an abandoned name, with no working site or an inactive owner, as dormant and open to being reclaimed. If you no longer need it, releasing it frees your slot and lets someone else claim it.',
    ],
  },
  {
    q: 'Can I claim through GitHub instead of the website?',
    a: [
      'Yes. Add a single record file for your name to the public registry in a pull request. Automated checks confirm the name, your eligibility and that you have a free slot, and a slot is held for the name while the pull request is open. If it is merged, the name is yours; if it is closed unmerged, the slot is released. The ',
      l('/docs/quickstart', 'quickstart'),
      ' shows the record format.',
    ],
  },
  {
    q: 'What happens if the service shuts down?',
    a: [
      'The policy describes runs-at.dev as a best-effort service with no uptime guarantee and makes no promise beyond that. Every name depends on runs-at.dev staying in service, so keep that in mind for anything you cannot afford to lose.',
    ],
  },
  {
    q: 'What does public by design mean?',
    a: [
      'Each claimed name is a small record in a public repository, showing who owns it and where it points, with its full change history. The registry and this site are open source, so the rules that decide a claim can be read by anyone.',
    ],
  },
  {
    q: 'Where can I check whether my subdomain works?',
    a: [
      'Sign in to ',
      l('/manage', 'runs-at.dev/manage'),
      ': each name has a status panel that says whether visitors reach your site, are being redirected, still see the profile card, or get no answer. For a shareable diagnosis, open runs-at.dev/debug/ followed by your name. The ',
      l('/docs/records', 'DNS record reference'),
      ' helps when a record needs fixing.',
    ],
  },
];

const plain = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.text)).join('');

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: plain(f.a) },
  })),
};

const MONO = 'font-(family-name:--font-mono)';

function slugify(q) {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// One numbered manual entry: index and source path in a narrow column, the
// question and its answer beside it. Every answer stays visible, as before.
function FaqEntry({ index, q, a }) {
  return (
    <li className="grid gap-x-6 gap-y-3 border-b border-(--line) px-4 py-6 last:border-b-0 sm:grid-cols-[3.5rem_1fr] sm:px-6 sm:py-8">
      <p className="text-[32px] leading-none text-(--color-accent)" style={{ fontFamily: 'var(--font-display)' }} aria-hidden="true">{index}</p>
      <div className="min-w-0">
        <p className={`${MONO} text-[11px] break-all text-(--color-muted) sm:text-xs`}>faq/{slugify(q)}.json</p>
        <h2 className="mt-2 text-[20px] leading-[1.2] font-normal text-(--color-ink) sm:text-[24px]">{q}</h2>
        <p className="mt-4 max-w-[640px] text-[15px] leading-[1.6] text-(--color-ash) sm:text-base">
          {a.map((part, i) =>
            typeof part === 'string' ? (
              part
            ) : (
              <a key={i} className="text-(--color-ink) underline" href={part.href}>
                {part.text}
              </a>
            ),
          )}
        </p>
      </div>
    </li>
  );
}

export default function Faq() {
  return (
    // Wider than the old column below 1680px; at 1680px and up it returns
    // to the 768px column the desktop side-rail ads sit around.
    <main className="mx-auto max-w-[1100px] px-4 pt-10 pb-16 sm:px-6 sm:pt-16 min-[1680px]:max-w-3xl">
      <JsonLd data={faqJsonLd} />

      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-(--line) pb-3 ${MONO} text-[12px] tracking-[0.08em] text-(--color-muted) uppercase`}>
        <span>runs-at.dev // frequently asked questions</span>
        <span>{faqs.length} entries</span>
      </div>

      <h1 className="mt-10 text-[clamp(4rem,22vw,9rem)] leading-[0.85] font-normal text-(--color-ink) uppercase sm:mt-14">FAQ</h1>

      <section aria-label="Questions" className="mt-12 border-t-2 border-(--line-strong) pt-6 sm:mt-16">
        <p className={`${MONO} text-[13px] tracking-[0.08em] text-(--color-ink) uppercase`}>
          <span className="text-(--color-muted)">01 //</span> Questions
        </p>
        <ol className="hard-shadow mt-6 border-2 border-(--line-strong) bg-(--color-card)">
          {faqs.map((f, i) => (
            <FaqEntry index={String(i + 1).padStart(2, '0')} q={f.q} a={f.a} key={f.q} />
          ))}
        </ol>
      </section>
    </main>
  );
}
