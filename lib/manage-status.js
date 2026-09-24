// The words /manage puts on screen: what a name is doing right now, and what
// a failed save means. Kept out of the component so both are testable, and so
// there is one place to fix a message rather than a dozen string literals
// spread through the form.

// `check` is a /api/dns-check body (null while the first check is in flight),
// `mode` the shape the form currently holds: card, cname, url, advanced.
//
// `serving.status` is the classification the health check already uses:
//   ok       the owner's own site answered
//   redirect the record holds a URL redirect
//   card     the registry's profile card answered
//   stuck    a pointed name that is still answering with the card
//   down     nothing answered at all
//
// `card` is success only when the card is what the owner picked; for a name
// pointed somewhere else it is the symptom the health check opens issues
// about, so it must not read as "working".
export function siteStatus(check, mode) {
  if (!check) return { tone: 'checking', label: 'Checking…', detail: 'Reading DNS and loading your name.' };

  const status = check.serving?.status;
  const title = check.serving?.title;

  if (status === 'ok') {
    return { tone: 'live', label: 'Live', detail: title ? `Visitors see your site: ${title}` : 'Visitors see your site.' };
  }
  if (status === 'redirect') {
    const to = check.serving?.finalUrl;
    return { tone: 'live', label: 'Redirecting', detail: to ? `Visitors are sent to ${to}` : 'Visitors are sent to your redirect address.' };
  }
  if (status === 'card' && (mode === 'card' || !mode)) {
    return { tone: 'live', label: 'Live', detail: 'Visitors see your profile card.' };
  }
  if (status === 'card' || status === 'stuck') {
    return {
      tone: 'waiting',
      label: 'Not working yet',
      detail: 'Your name still shows the profile card, not your site. DNS may still be spreading, or your hosting provider has not accepted this name yet.',
    };
  }
  if (status === 'down') {
    return {
      tone: 'down',
      label: 'Not answering',
      detail: 'Nothing answered on your name. Check that the address you pointed it at is correct and that your site is running.',
    };
  }
  return { tone: 'checking', label: 'Checking…', detail: '' };
}

// The save path answers with an error code and, for a rejected record, the
// schema's own messages. Those name fields and types ("records.CNAME must be
// a hostname"), which is exact and unusable by the person who pasted a URL
// into a box. Translate the ones a form can actually produce and pass
// anything else through rather than swallowing it.
const FIELD_MESSAGES = [
  [/CNAME must be a hostname/i, 'The hosting address should look like you.github.io — no https:// and nothing after the address.'],
  [/CNAME points at .* itself/i, 'That address is your own name. Use the address your hosting provider gave you.'],
  [/CNAME cannot coexist/i, 'A hosting address cannot be combined with other DNS records on the same name. Remove the others, or use DNS records instead.'],
  [/URL must be an absolute http\(s\) URL/i, 'The redirect needs a full web address, starting with https://'],
  [/URL cannot coexist/i, 'A redirect replaces everything else on the name, so it cannot be combined with other records.'],
  [/A entries must be IPv4 addresses/i, 'Each A record must be an IPv4 address, like 203.0.113.10.'],
  [/A must be a non-empty array/i, 'Add at least one IPv4 address, or leave the A box empty.'],
  [/MX entries must be/i, 'Each mail line needs a number and a hostname, like: 10 mx.example.com'],
  [/MX must be an array of 1 to (\d+) entries/i, 'You can have between 1 and $1 mail (MX) lines.'],
  // Before the bare TXT rule: a subdomain message ("subdomains._vercel.TXT
  // must be an array") otherwise matched TXT first and lost the label, which
  // is the only part telling the owner which row to fix.
  [/subdomains may not exceed (\d+) entries/i, 'You can have at most $1 extra records.'],
  [/subdomains\.([a-z0-9_-]+)/i, 'The extra record for "$1" is not valid. Check its type and value.'],
  [/TXT/i, 'A TXT value must be plain text, one value per line.'],
  [/pushes the full name past/i, 'That label makes the full address too long. Use a shorter label.'],
  [/unknown record type/i, 'That record type is not supported here.'],
];

export function friendlyDetail(message) {
  for (const [pattern, text] of FIELD_MESSAGES) {
    const match = pattern.exec(String(message ?? ''));
    if (match) return text.replace(/\$(\d)/g, (_, i) => match[Number(i)] ?? '');
  }
  return String(message ?? '').trim() || 'Something in the form was not accepted.';
}

// One message per failed save, in the order the route can answer: auth,
// ownership, conflict, rate limit, upstream trouble, then the record itself.
export function friendlyError(httpStatus, body = {}) {
  const code = body?.error;
  if (httpStatus === 401 || code === 'signin_required') {
    return ['You have been signed out. Sign in again, then save.'];
  }
  if (httpStatus === 403 || code === 'not_owner') {
    return ['Only the owner of this name can change it.'];
  }
  if (httpStatus === 409 || code === 'stale') {
    return ['This name was changed somewhere else while you were editing. Reload the page and make your change again.'];
  }
  if (httpStatus === 429 || code === 'rate_limited') {
    const seconds = Math.ceil((body?.retryInMs ?? 60000) / 1000);
    return [`Too many saves in a row. Try again in about ${seconds} second${seconds === 1 ? '' : 's'}.`];
  }
  if (httpStatus === 503 || code === 'busy') {
    return ['The registry is busy right now. Wait a few seconds and save again.'];
  }
  if (httpStatus === 404 || code === 'not_found') {
    return ['This name no longer exists in the registry. Reload the page.'];
  }
  const details = Array.isArray(body?.details) ? body.details : [];
  if (details.length > 0) return details.map(friendlyDetail);
  return ['Could not save just now. Try again in a moment.'];
}

// A save is a commit; the sync workflow publishes it to DNS a moment later.
// Inside this window a name still answering with the card is mid-publish, not
// broken -- calling that "needs attention" is the false alarm owners hit most.
export const PUBLISHING_WINDOW_MS = 2 * 60 * 1000;

// The four things a name can do are one choice, not four switches: the record
// holds CNAME, or URL, or A/TXT/MX, or nothing. Exactly one card is in use,
// and only that one carries a status, because only it can be live or broken.
const CARDS = [
  { id: 'card', title: 'Profile card', description: 'Show a card built from your GitHub profile.' },
  { id: 'cname', title: 'Point to my hosting', description: 'Send visitors to a site you host somewhere else.' },
  { id: 'url', title: 'Redirect visitors', description: 'Forward visitors to another web address.' },
  { id: 'advanced', title: 'DNS records', description: 'Set A, TXT and MX records yourself.' },
];

function inUseSummary(id, records = {}) {
  if (id === 'cname') return records.CNAME ?? null;
  if (id === 'url') return records.URL ?? null;
  if (id === 'advanced') {
    const count = (records.A?.length ?? 0) + (records.TXT?.length ?? 0) + (records.MX?.length ?? 0);
    return count === 1 ? '1 record' : `${count} records`;
  }
  return 'Built from your GitHub profile';
}

// `savedMode` is what the committed record holds, never the unsaved form: a
// card must not claim to be in use because someone clicked its tile.
export function featureCards({ savedMode, records = {}, check = null, savedAt = null, now = Date.now() } = {}) {
  const live = siteStatus(check, savedMode);
  const publishing = savedAt !== null && now - savedAt < PUBLISHING_WINDOW_MS;

  return CARDS.map(({ id, title, description }) => {
    if (id !== savedMode) {
      return {
        id,
        title,
        description,
        inUse: false,
        summary: null,
        status: { tone: 'idle', label: 'Not in use', detail: null },
        action: id === 'card' ? 'Use this instead' : 'Set up',
      };
    }

    let status;
    if (live.tone === 'checking') {
      status = { tone: 'checking', label: 'Checking…', detail: null };
    } else if (live.tone === 'live') {
      status = { tone: 'live', label: 'Live', detail: live.detail };
    } else if (publishing) {
      status = {
        tone: 'waiting',
        label: 'Publishing…',
        detail: 'Saved a moment ago. DNS usually publishes within a minute or two.',
      };
    } else {
      status = { tone: 'attention', label: 'Needs attention', detail: live.detail };
    }

    const action = status.tone === 'attention'
      ? 'Fix this'
      : id === 'card' ? 'Edit card details' : id === 'advanced' ? 'Manage records' : 'Change';

    return { id, title, description, inUse: true, summary: inUseSummary(id, records), status, action };
  });
}

// How long after a save to look again. DNS has to be committed, published by
// the sync workflow and then seen by a resolver, so the first check is not
// immediate; /api/dns-check allows 10 checks a minute per name, and this
// spends 4 of them over 80 seconds, leaving room for a second tab and the
// Check now button.
export const CHECK_SCHEDULE_MS = [10_000, 20_000, 40_000, 80_000];
