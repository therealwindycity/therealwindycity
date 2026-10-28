# CI repair candidates for TheReelWindyCity

Target: `therealwindycity/TheReelWindyCity`, PR #26, head
`71981922b4a6b1cb02b5bccf5f1e64260fd8951b` (observed 2026-10-28).
These patches are proposed changes, not deployed changes. Recheck the target
head and CI before applying them; do not overwrite newer work.

## Findings

At that head CI runs 40758097006 and 40758088084 failed in **Meeting calendar
status and freshness tests (injected clock)**. The transcript test, lint and
typecheck steps had passed. Remote job logs were inaccessible, but a clean
copy of that exact head reproduced two calendar-test failures.

The original corrupt-extraction test also overwrote the tracked
`data/meetings/2026/city-council-2026-10-26/agenda.json` and removed **all** of
`data/meetings/` in its `finally` block. Do not run that original test in a
valuable checkout without protecting those files.

After locally repairing the calendar tests, the static build passed but the SEO
audit failed on eight issues: a missing homepage transcript summary, an expected
sitemap list missing five new pages, and checks requiring modification dates on
those same five pages even though they have no independently tracked date.

## Patches

- `calendar-ci.patch` injects controlled watcher inputs and a temporary empty
  extraction directory into the snapshot test. The corrupt-extraction test
  uses a separate temporary directory, checks rejection, and compares the
  complete meeting list and statistics with its baseline. It never writes to
  the target's `data/meetings/` tree. Concrete timestamp and rejection checks
  are retained. Tests still use the repository's archive snapshots, so
  intentional snapshot updates can require fixture updates.
- `seo-ci.patch` restores the homepage's dynamically computed transcript
  denominators. The audit derives its expected denominators from the generated
  index, includes the five actual pages, and requires them to remain undated
  rather than asserting an unverified last-modified date. It still verifies
  sitemap coverage and modification dates for all other entries.

Apply in a disposable or reviewed checkout of the **target** repository,
using the actual absolute or correctly resolved paths to the two patches:

```sh
git apply --check /absolute/path/to/calendar-ci.patch /absolute/path/to/seo-ci.patch
git apply /absolute/path/to/calendar-ci.patch /absolute/path/to/seo-ci.patch
npm ci
npm run lint
npm run typecheck
npm run test:calendar
NEXT_PUBLIC_BASE_PATH=/TheReelWindyCity npm run build
NEXT_PUBLIC_BASE_PATH=/TheReelWindyCity npm run test:seo
```

Before applying, inspect both patches and verify that the checked-out revision
is appropriate for PR #26. This session's branch belongs to another repository;
no target branch was modified by preparing this package. Run the entire target
CI workflow and review its results before merging.

## Local verification performed

- Downloaded the target source archive at the stated head; no target git write.
- Reproduced the original calendar failures in a disposable copy.
- Each patch passed `git apply --check` and applied against its original files.
- Patched calendar tests passed 10/10 repeatedly; SHA-256 manifests of files
  under `data/meetings/` matched before and after the tests.
- Installed dependencies with `npm ci --ignore-scripts` because this sandbox's
  native dependency download was previously blocked. This differs from CI's
  ordinary `npm ci`.
- Lint passed with six warnings; typecheck and all nine CI test suites through
  `test:calendar` passed. The static build passed with the Pages base path;
  several external news and weather sources were unavailable in the sandbox.
- SEO audit initially failed with eight findings; with both candidate patches
  it passed. Negative checks confirmed it still fails when a homepage summary
  or a required sitemap modification date is removed.
- Playwright/browser smoke tests, remote CI, and deployment were not verified.
  Local success does not establish that PR #26 is ready to merge or Pages is
  restored.
