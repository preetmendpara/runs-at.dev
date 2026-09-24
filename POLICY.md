# Policy

`runs-at.dev` is a free subdomain registry. Anyone with a GitHub account can
claim a name like `you.runs-at.dev` and point it at their own hosting. This
page explains the terms in plain language.

## Names are free, and may be reclaimed

Claiming a name costs nothing, and there is no guarantee it stays yours
forever. The operator reserves the right to reclaim any name, including a
name that has gone dormant (no working site, an expired record, an inactive
owner). Free registries only stay usable if abandoned names come back into
circulation.

## Best effort, no guarantee

This is a free, best-effort service with no uptime guarantee. Treat it as you
would any other free infrastructure you did not pay for.

## What forfeits a name immediately

The following forfeit a name on sight, no warning required:

- **Impersonation**: pretending to be a person, brand, or organization you
  are not.
- **Phishing**: pages designed to steal credentials, payment details, or
  other sensitive information.
- **Malware**: serving or distributing malicious software.
- **Illegal content**: anything unlawful to host or distribute.

If your name is doing any of these, expect it to be pulled without notice.
A maintainer removes it by deleting its `domains/<name>.json` file. Owners
can release their own name at any time from the
[manage page](https://runs-at.dev/manage), or by pull request if they prefer.
See [README.md](./README.md#the-rules) for what CI enforces.

## Who is responsible

The operator, [@preetmendpara](https://github.com/preetmendpara), is the registrant of `runs-at.dev` and answers for what every
subdomain serves. That is why the policy above exists and why it is
enforced without much ceremony: the registrant is on the hook for abuse
happening under the domain, so abuse gets removed.

## Reporting abuse

Email **abuse@runs-at.dev** with the subdomain in question and what it is
doing. Reports are how dormant and abusive names get found. Use it.
