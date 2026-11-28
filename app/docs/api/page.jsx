import { Section, Eyebrow, DocTitle, Lede, C, Code } from '../components.jsx';
import { SITE_OG_IMAGE } from '../../../lib/og.js';

export const metadata = {
  title: 'REST API',
  description: 'Manage your runs-at.dev names from scripts: records, subdomains, custom nameservers and DS over a token-authenticated REST API.',
  alternates: { canonical: 'https://runs-at.dev/docs/api' },
  openGraph: { title: 'REST API · runs-at.dev', images: SITE_OG_IMAGE },
};

const P = ({ children }) => <p className="mt-3 text-sm leading-relaxed sm:text-base">{children}</p>;

export default function Api() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <Eyebrow>Docs / API</Eyebrow>
      <DocTitle>REST API</DocTitle>
      <Lede>
        Everything the manage page does, from a script, a CI job or an agent. Every write goes
        through the same checks as the site: ownership, the record schema, and a live check of any
        nameservers you delegate to.
      </Lede>

      <Section title="Authentication">
        <P>
          Sign in, open <a className="underline" href="/manage">Manage</a>, expand{' '}
          <strong>API access</strong> and generate a token. It starts with <C>rat1.</C>, is shown once,
          lasts 90 days and can manage every name your account owns. Send it on every request:
        </P>
        <Code>{`Authorization: Bearer rat1.…`}</Code>
        <P>
          <strong>Revoke all tokens</strong> on the same card (or <C>DELETE /api/v1/tokens</C>) kills
          every token issued before that moment. A token can never create another token.
        </P>
      </Section>

      <Section title="Endpoints">
        <Code>{`GET    /api/v1                  index
GET    /api/v1/me               your login, names, free slots
GET    /api/v1/names            every name you own, with its DNS
GET    /api/v1/names/{name}     one name
PATCH  /api/v1/names/{name}     change records, subdomains, nameservers, ds, profile
DELETE /api/v1/tokens           revoke every token for your account`}</Code>
        <P>A name you do not own answers <C>404</C>, the same as a name nobody has claimed.</P>
      </Section>

      <Section title="Change records">
        <P>Send only the fields you want to change. <C>null</C> removes a field.</P>
        <Code>{`curl -X PATCH https://runs-at.dev/api/v1/names/you \\
  -H "Authorization: Bearer $RAD_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"records":{"CNAME":"you.github.io"},
       "subdomains":{"_github-pages-challenge-you":{"TXT":["abc123"]}}}'`}</Code>
        <P>
          The record format is the one in the <a className="underline" href="/docs/records">record reference</a>.
          A change is a commit to the public registry and reaches DNS within a couple of minutes.
        </P>
      </Section>

      <Section title="Use your own nameservers (Cloudflare, deSEC, …)">
        <P>
          Delegating hands the whole of <C>you.runs-at.dev</C> to another DNS provider, the same way
          registrars let you change nameservers. Do it in this order, or the name goes dark:
        </P>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
          <li>Add <C>you.runs-at.dev</C> as a zone at the provider and note the nameservers it gives you.</li>
          <li>Set them here, in <strong>Nameservers</strong> on the manage page or over the API. We check
            that every server already answers for the name before anything is published.</li>
          <li>If the provider signs the zone (DNSSEC), add the DS it shows you. We check it against the
            keys the servers actually serve.</li>
        </ol>
        <Code>{`curl -X PATCH https://runs-at.dev/api/v1/names/you \\
  -H "Authorization: Bearer $RAD_TOKEN" -H "Content-Type: application/json" \\
  -d '{"nameservers":["ns1.desec.io","ns2.desec.org"]}'`}</Code>
        <P>
          Providers that accept a zone like <C>you.runs-at.dev</C> today include deSEC, Hurricane
          Electric (dns.he.net) and ClouDNS. Cloudflare&apos;s free plan only accepts names directly under
          a suffix on the Public Suffix List; runs-at.dev has applied, and once listed Cloudflare works
          the same way with no change on your side.
        </P>
        <P>
          Need to go back? Send <C>{`{"nameservers":null}`}</C> and the name returns to runs-at.dev DNS.
          If your nameservers stop answering, the daily health check opens an issue and, after seven
          days, hands the name back automatically.
        </P>
      </Section>

      <Section title="Errors">
        <Code>{`401 token_required | invalid_token | token_revoked
400 invalid_name | invalid_body | invalid_record (details[])
400 nameservers_not_ready (details[]: what each server said)
403 delegation_not_allowed (account under 30 days old or no public repo)
404 not_found
409 stale            the record changed under you: GET, then retry
429 rate_limited     wait Retry-After (60 reads/min, 12 writes/10 min)
503 busy             retry after Retry-After`}</Code>
      </Section>
    </main>
  );
}
