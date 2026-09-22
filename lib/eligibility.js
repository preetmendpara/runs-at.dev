const MIN_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

export function checkEligibility(user, now = new Date()) {
  if (!user || typeof user !== 'object') return { ok: false, reason: 'age' };

  const created = Date.parse(user.created_at);
  if (Number.isNaN(created)) return { ok: false, reason: 'age' };
  if ((now.getTime() - created) / DAY_MS < MIN_AGE_DAYS) return { ok: false, reason: 'age' };

  if (!Number.isInteger(user.public_repos) || user.public_repos < 1) {
    return { ok: false, reason: 'repos' };
  }

  return { ok: true };
}
