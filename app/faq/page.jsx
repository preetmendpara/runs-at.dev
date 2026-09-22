import JsonLd from '../components/JsonLd.jsx';

export const metadata = {
  title: 'FAQ',
  description: 'Straight answers about runs-on.dev: is it free, is it a TLD, who owns your name, and what happens if it shuts down.',
  alternates: { canonical: 'https://runs-on.dev/faq' },
  openGraph: { title: 'FAQ · runs-on.dev' },
};

const faqs = [
  {
    q: 'Is this really free?',
    a: 'Yes. Claiming a name costs nothing and there is no paid tier. Advance Labs pays the ~$10/year for runs-on.dev itself; you never pay to claim, hold, or point a name.',
  },
  {
    q: 'Is it a TLD?',
    a: 'No. runs-on.dev is a subdomain registry, not a top-level domain. Your name is <name>.runs-on.dev, not a domain you own outright. A real TLD means an ICANN application and running a registry, which is a different and much more expensive thing.',
  },
  {
    q: 'Who owns my name?',
    a: 'Advance Labs owns runs-on.dev. You are the recorded owner of your claimed record (domains/<name>.json), and only you can edit or remove it by pull request, but the name itself is granted, not sold or transferred to you.',
  },
  {
    q: 'Can you take it away?',
    a: 'Yes. The policy reserves the right to reclaim a name that goes dormant, or one used for impersonation, phishing, malware, or illegal content, without notice for the last four. Read the full policy at /policy.',
  },
  {
    q: 'What happens if the project shuts down?',
    a: 'Names would stop resolving. This runs on a wildcard DNS record and a GitHub Actions pipeline that Advance Labs operates; if Advance Labs stops paying for or maintaining runs-on.dev, every *.runs-on.dev name goes down with it. The registry is open source, so anyone could fork it and stand up their own domain, but that is a fork, not a guaranteed continuation of this one.',
  },
  {
    q: 'Can I use it for a commercial project?',
    a: 'Yes, nothing in the policy restricts commercial use. Keep in mind it is still a free, best-effort service with no uptime guarantee, so treat it as you would any other free infrastructure you did not pay for.',
  },
  {
    q: 'Why do I need a GitHub account?',
    a: 'Sign-in and eligibility both run through GitHub: your account needs to be at least 30 days old with at least one public repository, so claiming is cheap for a real developer and expensive for a bot farm sweeping names at scale.',
  },
  {
    q: 'How many names can I have?',
    a: 'One per account. That is a hard limit enforced at claim time, so a second name needs a second GitHub account.',
  },
  {
    q: 'What stops someone claiming a brand name?',
    a: 'A blocklist of brands actually impersonated in the wild, checked before eligibility on every claim. It is not exhaustive: if you see a name that should be blocked, email abuse@runs-on.dev or open a pull request against the blocklist.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

function slugify(q) {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function FaqEntry({ q, a }) {
  return (
    <div className="slit-bar-l mt-8 py-1 pl-5 first:mt-10">
      <p className="font-(family-name:--font-mono) text-[11px] text-(--color-muted) sm:text-xs">
        faq/{slugify(q)}.json
      </p>
      <h2 className="mt-2 font-(family-name:--font-mono) text-xs sm:text-[13px]">
        <span className="text-(--color-muted)">&quot;q&quot;:</span>{' '}
        <span className="text-(--color-ink)">&quot;{q}&quot;</span>
      </h2>
      <p className="mt-3 max-w-[600px] text-sm leading-relaxed text-(--color-ash) sm:text-base">{a}</p>
    </div>
  );
}

export default function Faq() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <JsonLd data={faqJsonLd} />
      <h1 className="text-[34px] leading-[1.03] font-normal tracking-[-0.005em] text-(--color-ink) sm:text-[44px] sm:tracking-[-0.007em]">FAQ</h1>

      {faqs.map((f) => (
        <FaqEntry q={f.q} a={f.a} key={f.q} />
      ))}
    </main>
  );
}
