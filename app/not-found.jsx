// The 404 body is written as raw markdown in a <pre> so both humans and
// agents get something recoverable: a real HTTP 404 with a site map and the
// next place to look, never a 200 with app chrome.
const BODY = `# 404 · nothing lives at this path

This is **runs-at.dev**, a free subdomain registry. Claim a name like
\`you.runs-at.dev\`, point it at your own hosting, or serve a static site
from it.

## Where to look next

- Site map: https://runs-at.dev/sitemap.xml
- Agent index (llms.txt): https://runs-at.dev/llms.txt
- OpenAPI spec: https://runs-at.dev/openapi.json
- Docs: https://runs-at.dev/docs
- Claim a name: https://runs-at.dev/
- Report abuse: mailto:abuse@runs-at.dev

Looking for a claimed site? Claimed names live on their own hosts
(\`<name>.runs-at.dev\`), not under this domain.`;

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <p className="meta border-b border-(--line) pb-3">404 · not found</p>
      <h1 className="mt-8 text-[clamp(2rem,8vw,4.25rem)] leading-[0.95] font-normal tracking-[-0.01em] text-(--color-ink) uppercase sm:mt-12">
        Nothing lives at this path
      </h1>
      <pre className="hard-shadow mt-10 border-2 border-(--line-strong) bg-(--color-card) p-4 sm:p-6 font-(family-name:--font-mono) text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:break-word] text-(--color-ash)">
        {BODY}
      </pre>
    </main>
  );
}
