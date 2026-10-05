#!/usr/bin/env bash
# =============================================================================
# WorkDesk spin-off
# -----------------------------------------------------------------------------
# Copies this directory into a clean, standalone project ready to become its own
# public GitHub repo with its own GitHub Pages site.
#
# Why this exists: WorkDesk currently lives in workdesk/ inside a repo that is
# mostly a civic-transparency project. Creating a brand-new repository needs the
# `createRepository` permission, which a repo-scoped GitHub App token does not
# have — so this cannot be done for you from inside a sandbox. It CAN be done by
# you, in about ninety seconds, with `gh` or the GitHub website.
#
# This script does everything up to the two commands that need your account, then
# prints those two commands. It never guesses your username, never touches the
# parent repo, and never pushes anything.
#
#   ./spin-off.sh --help
#   ./spin-off.sh --owner YOUR_GITHUB_USERNAME --repo workdesk
#   ./spin-off.sh --owner me --repo workdesk --dest ~/code/workdesk --push
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE"

OWNER=""
REPO="workdesk"
DEST=""
PUSH=0
FORCE=0

usage() {
  cat <<'USAGE'
WorkDesk spin-off — make this directory into its own standalone repo.

Usage:
  ./spin-off.sh --owner GITHUB_USERNAME [--repo NAME] [--dest DIR] [--push] [--force]

Options:
  --owner NAME   Your GitHub username or organisation. Required — it sets the
                 Pages URL the Sidekick will point at and the issue links.
  --repo NAME    New repository name.                     (default: workdesk)
  --dest DIR     Where to build it.      (default: a sibling of the repo, /NAME)
  --push         Also run `gh repo create` + `git push` when it gets there.
                 Off by default: the script prints the commands instead, so you
                 stay the one who creates the repository.
  --force        Reuse --dest if it already exists (its contents are replaced).
  --help         This text.

What it does:
  1. copies the app (minus tests/ and any .git) into --dest
  2. rewrites the Sidekick's default board URL and @namespace for the new repo
  3. writes .github/workflows/pages.yml and poll.yml with paths corrected for a
     repo whose ROOT is the app (here they live one level down)
  4. adds a .gitignore and fixes the two links that pointed outside workdesk/
  5. git init + one clean commit, no history inherited
  6. prints (or with --push, runs) the create + push commands

What it does NOT do:
  • touch the repo you are running it from
  • need any credential, or store one
  • invent a username, or push to an account it cannot verify
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --owner) OWNER="${2:-}"; shift 2 ;;
    --repo)  REPO="${2:-}";  shift 2 ;;
    --dest)  DEST="${2:-}";  shift 2 ;;
    --push)  PUSH=1; shift ;;
    --force) FORCE=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; echo >&2; usage >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;33m⚡\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

[ -n "$OWNER" ] || { usage >&2; echo >&2; die "--owner is required (your GitHub username or org)"; }
case "$OWNER" in *[!A-Za-z0-9-]*) die "--owner may only contain letters, digits and hyphens";; esac
case "$REPO"  in *[!A-Za-z0-9._-]*) die "--repo may only contain letters, digits, dot, underscore and hyphen";; esac

# default: a sibling of the repo this lives in, never inside it
[ -n "$DEST" ] || DEST="$(cd "$SRC/../.." && pwd)/$REPO"
case "$DEST" in "~/"*) DEST="${HOME}/${DEST#\~/}" ;; "~") DEST="$HOME" ;; esac

PAGES_URL="https://${OWNER}.github.io/${REPO}/"

# --- refuse to clobber something real ---------------------------------------
if [ -e "$DEST" ] && [ "$FORCE" -ne 1 ]; then
  die "$DEST already exists. Pass --force to replace it, or pick another --dest."
fi
if [ "$(cd "$DEST" 2>/dev/null && pwd || echo x)" = "$(cd "$SRC" && pwd)" ]; then
  die "--dest is this directory. Pick somewhere else."
fi
# never operate on the parent repo
case "$(cd "$SRC/.." && pwd)" in
  "$DEST"|"${DEST%/}") die "--dest cannot be the parent of workdesk/ (that is the repo this lives in)";;
esac

say "Spinning WorkDesk off into $DEST"
say "Pages URL will be $PAGES_URL"

rm -rf "$DEST"
mkdir -p "$DEST"

# --- 1. copy -----------------------------------------------------------------
say "Copying the app…"
( cd "$SRC" && tar --exclude=./tests --exclude=./.git --exclude=./node_modules \
                   --exclude=./.DS_Store -cf - . ) | ( cd "$DEST" && tar -xf - )
ok "copied $(find "$DEST" -type f | wc -l | tr -d ' ') files"

for f in index.html assets/util.js assets/app.js sidekick/workdesk-sidekick.user.js; do
  [ -f "$DEST/$f" ] || die "copy incomplete: $f is missing"
done

# --- 2. rewrite the Sidekick for the new home --------------------------------
say "Pointing the Sidekick at $PAGES_URL"
SK="$DEST/sidekick/workdesk-sidekick.user.js"
python3 - "$SK" "$PAGES_URL" "$OWNER" "$REPO" <<'PY'
import re, sys
path, pages_url, owner, repo = sys.argv[1:5]
s = open(path, encoding='utf-8').read()
before = s

# the default board URL
s = re.sub(r"(wdUrl\s*:\s*')https?://[^']*(')", r"\g<1>" + pages_url + r"\g<2>", s)
s = re.sub(r"(DEFAULTS\.wdUrl\s*=\s*')https?://[^']*(')", r"\g<1>" + pages_url + r"\g<2>", s)
# and any other literal pointing at the old Pages host
s = s.replace('https://therealwindycity.github.io/therealwindycity/workdesk/', pages_url)
# the userscript namespace
s = re.sub(r"(//\s*@namespace\s+)\S+", r"\g<1>https://github.com/%s/%s" % (owner, repo), s)
open(path, 'w', encoding='utf-8').write(s)
print('  sidekick: %s' % ('rewritten' if s != before else 'no URL literals found — check --owner'))
PY
grep -q "$PAGES_URL" "$SK" || die "could not write the board URL into the Sidekick"
ok "Sidekick default board URL = $PAGES_URL"

# --- 3. workflows, corrected for an app-at-root layout -----------------------
say "Writing GitHub Actions workflows"
mkdir -p "$DEST/.github/workflows"

cat > "$DEST/.github/workflows/pages.yml" <<YAML
name: pages

# Publishes WorkDesk as this repository's GitHub Pages site.
#
# ONE MANUAL STEP, once: repo Settings → Pages → Source: "GitHub Actions".
# That setting can only be changed by a repository admin through the web UI —
# a workflow cannot enable Pages for itself.
#
# Site layout after the first run:
#   ${PAGES_URL}              -> WorkDesk
#   ${PAGES_URL}docs/SETUP.html
#   ${PAGES_URL}sidekick/workdesk-sidekick.user.js

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Assemble the Pages artifact
        run: |
          set -euo pipefail
          rm -rf _site && mkdir -p _site
          # tar rather than cp: _site lives inside the checkout, so "cp -r ./*"
          # tries to copy _site into itself and set -e kills the step.
          tar --exclude=./_site --exclude=./.git --exclude=./.github \
              --exclude=./tests --exclude=./node_modules --exclude=./.DS_Store \
              -cf - . | ( cd _site && tar -xf - )
          test -f _site/index.html || { echo "_site/index.html missing"; exit 1; }
          echo "artifact contents:"; find _site -maxdepth 2 -type f | head -40
          du -sh _site

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
YAML

cat > "$DEST/.github/workflows/poll.yml" <<'YAML'
name: poll

# Pulls work orders from the OFFICIAL Field Nation / WorkMarket APIs and commits
# data/feed.json, which the board reads automatically on boot.
#
# IMPORTANT — read worker/poll.py's docstring before expecting magic. Neither
# platform has a provider-side "show me available work" API:
#   • Field Nation's REST API is the *Client API*: it needs a Buyer account plus
#     a signed integration contract, and it only exposes work orders that buyer
#     posted.
#   • WorkMarket's Open API belongs to the company tenant managing contractors.
# So this workflow is DORMANT BY DEFAULT. With no secrets set it logs what is
# missing and exits 0 — a green run that commits nothing. Your board keeps being
# fed by the Sidekick userscript, which needs no keys at all.
#
# To wake it up, add repo secrets (Settings → Secrets and variables → Actions).
# Add only the pair you actually hold; the poller skips the other:
#
#   Field Nation (from your integration contract):
#     FIELD_NATION_CLIENT_ID / FIELD_NATION_CLIENT_SECRET
#     FIELD_NATION_USERNAME  / FIELD_NATION_PASSWORD
#     FIELD_NATION_BASE_URL          optional; sandbox is
#                                    https://api-sandbox.fndev.net/api/rest/v2
#   WorkMarket (from developer.workmarket.com for your tenant):
#     WORKMARKET_TOKEN / WORKMARKET_SECRET
#     WORKMARKET_BASE_URL / WORKMARKET_LIST_PATH / WORKMARKET_DETAIL_PATH
#                                    all optional
#
# Credentials are only ever read inside the runner. They are never written to a
# committed file, and the committed feed carries order data only.

on:
  schedule:
    - cron: "23 */4 * * *"     # four times a day, off the top of the hour
  workflow_dispatch:
    inputs:
      sandbox:
        description: "Use Field Nation's sandbox instead of production"
        type: boolean
        default: false

permissions:
  contents: write

concurrency:
  group: workdesk-poll
  cancel-in-progress: false

jobs:
  poll:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Self-test the poller (no credentials, no network)
        run: python3 -u worker/poll.py selftest

      - name: Report which credentials are present
        env:
          FIELD_NATION_CLIENT_ID: ${{ secrets.FIELD_NATION_CLIENT_ID }}
          FIELD_NATION_CLIENT_SECRET: ${{ secrets.FIELD_NATION_CLIENT_SECRET }}
          FIELD_NATION_USERNAME: ${{ secrets.FIELD_NATION_USERNAME }}
          FIELD_NATION_PASSWORD: ${{ secrets.FIELD_NATION_PASSWORD }}
          WORKMARKET_TOKEN: ${{ secrets.WORKMARKET_TOKEN }}
          WORKMARKET_SECRET: ${{ secrets.WORKMARKET_SECRET }}
        run: python3 -u worker/poll.py check

      - name: Poll the APIs
        env:
          FIELD_NATION_CLIENT_ID: ${{ secrets.FIELD_NATION_CLIENT_ID }}
          FIELD_NATION_CLIENT_SECRET: ${{ secrets.FIELD_NATION_CLIENT_SECRET }}
          FIELD_NATION_USERNAME: ${{ secrets.FIELD_NATION_USERNAME }}
          FIELD_NATION_PASSWORD: ${{ secrets.FIELD_NATION_PASSWORD }}
          FIELD_NATION_BASE_URL: ${{ secrets.FIELD_NATION_BASE_URL }}
          WORKMARKET_TOKEN: ${{ secrets.WORKMARKET_TOKEN }}
          WORKMARKET_SECRET: ${{ secrets.WORKMARKET_SECRET }}
          WORKMARKET_BASE_URL: ${{ secrets.WORKMARKET_BASE_URL }}
          WORKMARKET_LIST_PATH: ${{ secrets.WORKMARKET_LIST_PATH }}
          WORKMARKET_DETAIL_PATH: ${{ secrets.WORKMARKET_DETAIL_PATH }}
        run: |
          ARGS="once --limit 200"
          if [ "${{ inputs.sandbox }}" = "true" ]; then ARGS="$ARGS --sandbox"; fi
          python3 -u worker/poll.py $ARGS

      - name: Commit the feed if it changed
        run: |
          git config user.name "workdesk-bot"
          git config user.email "workdesk@localhost"
          git add data/feed.json
          if git diff --cached --quiet; then
            echo "feed unchanged — no new work orders this cycle"
          else
            COUNT=$(python3 -c "import json;print(json.load(open('data/feed.json'))['count'])" 2>/dev/null || echo "?")
            git commit -m "feed: ${COUNT} orders from official APIs"
            git push
          fi

      # NB: the `secrets` context is not available in a step-level `if:` — using
      # it there makes the whole workflow fail to parse. Inject as env and test
      # in the shell, which also keeps the step green-and-skipped when unset.
      - name: Optional phone push via ntfy.sh (set repo secret NTFY_TOPIC)
        env:
          NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}
        run: |
          if [ -z "${NTFY_TOPIC:-}" ]; then
            echo "NTFY_TOPIC not set — skipping the optional phone push"
            exit 0
          fi
          COUNT=$(python3 -c "import json;print(json.load(open('data/feed.json'))['count'])" 2>/dev/null || echo 0)
          if [ "$COUNT" -gt 0 ] 2>/dev/null; then
            curl -fsS -H "Title: WorkDesk feed refreshed" -H "Tags: zap" \
              -d "${COUNT} work orders available from the API feed" \
              "https://ntfy.sh/${NTFY_TOPIC}" || echo "ntfy push failed (non-fatal)"
          fi
YAML
ok "wrote .github/workflows/pages.yml and poll.yml"

# --- 4. gitignore + links that used to reach outside workdesk/ ---------------
cat > "$DEST/.gitignore" <<'IGNORE'
.DS_Store
node_modules/
_site/
*.log
# never commit a credential, a relay token, or a local feed you forgot about
.env
.env.*
secrets.*
*.secret
IGNORE

say "Fixing links that pointed outside workdesk/"
python3 - "$DEST" "$OWNER" "$REPO" <<'PY'
import os, re, sys
dest, owner, repo = sys.argv[1:4]
gh = "https://github.com/%s/%s" % (owner, repo)
hits = 0
for root, dirs, files in os.walk(dest):
    dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules')]
    for f in files:
        if not f.endswith(('.md', '.html', '.js', '.py', '.yml', '.sh')):
            continue
        p = os.path.join(root, f)
        try:
            s = open(p, encoding='utf-8').read()
        except (UnicodeDecodeError, OSError):
            continue
        o = s
        # ../LEGAL.md and ../READ-FIRST.md belonged to the parent repo
        s = s.replace('](../LEGAL.md)', '](%s/blob/main/LEGAL.md)' % "https://github.com/therealwindycity/therealwindycity")
        s = s.replace('](../README.md)', '](README.md)')
        s = s.replace('therealwindycity/therealwindycity', '%s/%s' % (owner, repo))
        s = s.replace('https://%s.github.io/therealwindycity/workdesk/' % owner,
                      'https://%s.github.io/%s/' % (owner, repo))
        if s != o:
            open(p, 'w', encoding='utf-8').write(s)
            hits += 1
print('  rewrote links in %d file(s)' % hits)
PY
ok "links updated"

# a root README that does not claim to be part of another project
if [ -f "$DEST/README.md" ]; then
  python3 - "$DEST/README.md" "$PAGES_URL" "$OWNER" "$REPO" <<'PY'
import sys
p, pages_url, owner, repo = sys.argv[1:5]
s = open(p, encoding='utf-8').read()
banner = ("> **Live at <%s>** · issues: <https://github.com/%s/%s/issues>\n\n"
          % (pages_url, owner, repo))
if not s.startswith('>'):
    s = banner + s
open(p, 'w', encoding='utf-8').write(s)
PY
fi

# --- 5. a clean git history --------------------------------------------------
say "Initialising a fresh git history"
( cd "$DEST"
  git init -q -b main
  git add -A
  git -c user.name="${GIT_AUTHOR_NAME:-workdesk}" \
      -c user.email="${GIT_AUTHOR_EMAIL:-workdesk@localhost}" \
      commit -q -m "WorkDesk: one ranked board for Field Nation + WorkMarket

Standalone spin-off. Static site, no build step, no dependencies, no account,
no server, no telemetry.

Neither Field Nation nor WorkMarket offers a provider-side API for browsing
available work, so ingestion is a userscript bridge running in your own
logged-in session (plus paste / CSV / sync-code paths and a dormant API poller
for anyone who does hold buyer-side credentials). Applying is always
human-initiated: WorkDesk copies your pitch and opens the real work order, and
you press submit.

docs/SETUP.html explains all of it, including exactly why there is no API key
to enter." )
ok "committed $(cd "$DEST" && git rev-list --count HEAD) commit on branch main"

# --- 6. verify the poller still self-tests from its new home -----------------
if command -v python3 >/dev/null 2>&1; then
  say "Self-testing the poller from its new location"
  if ( cd "$DEST" && python3 -u worker/poll.py selftest >/dev/null 2>&1 ); then
    ok "poll.py selftest passes"
  else
    printf '\033[1;31m✗\033[0m poll.py selftest failed — run it manually to see why\n' >&2
  fi
fi

# --- 7. the two commands that need YOUR account ------------------------------
cat <<EOF

$(printf '\033[1;32m✓\033[0m') Ready. $DEST is a complete standalone WorkDesk project.

Two commands left, and they need your GitHub account:

  cd $DEST
  gh repo create ${OWNER}/${REPO} --public --source=. --remote=origin --push

No \`gh\`? Create an empty public repo named "${REPO}" at
  https://github.com/new
then:

  cd $DEST
  git remote add origin https://github.com/${OWNER}/${REPO}.git
  git push -u origin main

Then, once, in the new repo:

  Settings → Pages → Source: "GitHub Actions"

Your board will be at:

  ${PAGES_URL}

Finally, point the Sidekick at it: Tampermonkey → ⚡ WorkDesk settings →
Board URL → ${PAGES_URL}
(The spin-off already made that the default, so a fresh install needs nothing.)

EOF

if [ "$PUSH" -eq 1 ]; then
  if command -v gh >/dev/null 2>&1; then
    say "--push given: creating the repository and pushing"
    ( cd "$DEST" && gh repo create "${OWNER}/${REPO}" --public --source=. --remote=origin --push ) \
      && ok "pushed to https://github.com/${OWNER}/${REPO}" \
      || die "gh repo create failed — run the printed commands yourself. A repo-scoped token cannot create repositories; your own login can."
  else
    die "--push needs the GitHub CLI (gh). Run the printed commands instead."
  fi
fi
