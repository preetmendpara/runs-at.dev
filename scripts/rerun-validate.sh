#!/usr/bin/env bash
# Re-run the latest `validate` run for one pull request, so it checks the
# registry as it is now. Waits for a run still in progress first: it may have
# read main before the change that prompted this.
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
    | first | if . then \"\(.id) \(.status)\" else empty end"
}

run=""
for _ in 1 2 3 4 5 6; do
  run=$(find_run)
  [ -n "$run" ] && break
  sleep 10
done
if [ -z "$run" ]; then
  echo "PR #$pr: no validate run found"
  exit 0
fi

id=${run%% *}
if [ "${run#* }" != "completed" ]; then
  echo "PR #$pr: validate run $id is ${run#* }, waiting for it"
  gh run watch "$id" --repo "$REPO" > /dev/null || true
fi
echo "PR #$pr: re-running validate run $id"
gh run rerun "$id" --repo "$REPO"
