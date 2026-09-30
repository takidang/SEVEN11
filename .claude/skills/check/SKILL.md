---
name: check
description: Use when verifying 7-Eleven changes compile, type-check and lint before calling work done or committing — runs the frontend gates.
allowed-tools: Bash
effort: low
---

# check — run the build gates

Run the gates and report pass/fail with the actual output.

1. See what changed (`git status --short` once the repo exists, otherwise ask what was edited).
2. Frontend (`apps/frontend/**`):
   ```bash
   make fe-check        # = pnpm check-types (next typegen + tsc) && pnpm lint
   ```
3. Before a release or after dependency/config changes, also:
   ```bash
   make fe-build
   ```
4. Backend: not started yet — add its gate here when `apps/backend` exists.

Report each gate's result plainly (pass, or the error output). Do not edit code; this skill
only verifies.
