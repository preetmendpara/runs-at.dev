#!/usr/bin/env bash
# Re-run the latest `validate` run for one pull request, so it checks the
# registry as it is now. Waits for a run still in progress first: it may have
# read main before the change that prompted this.
#
# GitHub refuses to re-run a run older than 30 days, so a run that old (or a
# re-run GitHub rejects for any other reason) gets a fresh dispatched run of
# validate.yml for the PR instead, which publishes its own `validate` check
# on the PR head commit.
#
#   scripts/rerun-validate.sh <pr-number>      (needs GH_TOKEN and REPO)
#
# validate runs on pull_request_target, whose runs are not reliably filed
# under the pull request's head commit, so the run is matched by pull request
# number first and by head commit as a fallback (fork pull requests leave the
# number list empty).
set -euo pipefail
pr="$1"
sha=$(gh pr view "$pr" --repo "$REPO" --json headRefOid --jq .headRefOid)

find_run() {
  gh api "repos/$REPO/actions/workflows/validate.yml/runs?per_page=100" --jq "
    [.workflow_runs[]
      | select(any(.pull_requests[]?; .number == $pr) or .head_sha == \"$sha\")]
    | first | if . then \"\(.id) \(.status) \(.created_at)\" else empty end"
}

dispatch() {
  echo "PR #$pr: starting a fresh validate run ($1)"
  gh workflow run validate.yml --repo "$REPO" --ref "${DEFAULT_BRANCH:-main}" -f pr="$pr"
}

run=""
for _ in $(seq 1 "${FIND_ATTEMPTS:-6}"); do
  run=$(find_run)
  [ -n "$run" ] && break
  sleep "${FIND_DELAY:-10}"
done
if [ -z "$run" ]; then
  dispatch "no earlier run found"
  exit 0
fi

read -r id status created <<< "$run"
# 29 days: a day inside GitHub's 30-day re-run limit.
age=$(( $(date +%s) - $(date -d "$created" +%s) ))
if [ "$age" -ge $(( 29 * 86400 )) ]; then
  dispatch "run $id is $(( age / 86400 )) days old"
  exit 0
fi

if [ "$status" != "completed" ]; then
  echo "PR #$pr: validate run $id is $status, waiting for it"
  gh run watch "$id" --repo "$REPO" > /dev/null || true
fi
echo "PR #$pr: re-running validate run $id"
if ! gh run rerun "$id" --repo "$REPO"; then
  dispatch "re-run of $id was refused"
fi
