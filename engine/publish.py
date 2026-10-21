"""Module 5 (public edition): render the ledger as a static, fully self-contained
site — The Real Windy City Ledger. Zero external assets: survives sandboxed
viewers, emails, and GitHub Pages unchanged. Voice: Cheyenne public-comment
bare-knuckle. Substrate: nothing that isn't in the DB with a source URL, or in
config/facts.json with a linked citation.
Themed as HEROES OF THE PUBLIC RECORD (comic re-theme, 2026-09-11) — same data, same queries, new costume. Still zero external assets.
"""
from __future__ import annotations

import datetime as _dt
import html
import json
import shutil
from pathlib import Path
from zoneinfo import ZoneInfo

from . import db

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
DENVER = ZoneInfo("America/Denver")
SOURCE_STALE_AFTER = _dt.timedelta(hours=48)


def _as_utc(value: _dt.datetime | None = None) -> _dt.datetime:
    """Return an aware UTC instant; naive test inputs are interpreted as UTC."""
    current = value or _dt.datetime.now(_dt.timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=_dt.timezone.utc)
    return current.astimezone(_dt.timezone.utc)


def _parse_timestamp(value: str | None) -> _dt.datetime | None:
    if not value:
        return None
    try:
        parsed = _dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=_dt.timezone.utc)
        return parsed.astimezone(_dt.timezone.utc)
    except (TypeError, ValueError):
        return None


def _age_label(seconds: int) -> str:
    if seconds < 60:
        return "less than a minute ago"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    hours = seconds // 3600
    if hours < 48:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    days = seconds // 86400
    return f"{days} day{'s' if days != 1 else ''} ago"


def source_check_freshness(
    last_checked: str | None,
    now: _dt.datetime | None = None,
    stale_after: _dt.timedelta = SOURCE_STALE_AFTER,
) -> dict:
    """Describe the newest per-document check without claiming a full crawl.

    `documents.last_checked` is a maximum across individual source records, not
    a completed-cycle timestamp. A missing or invalid value is unknown, never
    treated as fresh.
    """
    current = _as_utc(now)
    checked = _parse_timestamp(last_checked)
    if checked is None:
        return {
            "last_checked": None,
            "age_seconds": None,
            "age_label": "unknown",
            "stale": None,
            "checked_label": "not recorded",
        }
    seconds = max(0, int((current - checked).total_seconds()))
    return {
        "last_checked": checked.isoformat().replace("+00:00", "Z"),
        "age_seconds": seconds,
        "age_label": _age_label(seconds),
        "stale": seconds > int(stale_after.total_seconds()),
        "checked_label": checked.strftime("%Y-%m-%d %H:%M:%S UTC"),
    }


def countdown_metric(target: str, now: _dt.datetime | None = None, event_label: str = "event") -> tuple[str, str]:
    """Return a date-relative metric in Cheyenne time, including after the date."""
    target_day = _dt.date.fromisoformat(target)
    today = _as_utc(now).astimezone(DENVER).date()
    delta = (target_day - today).days
    if delta > 0:
        return str(delta), f"days until {event_label}"
    if delta == 0:
        return "TODAY", f"{event_label} day"
    elapsed = abs(delta)
    return str(elapsed), f"days since {event_label}"


def _freshness_html(freshness: dict) -> str:
    if freshness["stale"] is None:
        css_class = "freshness freshness--unknown"
        text = "No document-check timestamp is recorded; source freshness is unknown. Treat the records below as a stored snapshot, not a live view."
    elif freshness["stale"]:
        css_class = "freshness freshness--stale"
        text = (
            f"Source snapshot may be stale: the latest recorded document check was "
            f"{freshness['checked_label']} ({freshness['age_label']}). The records below "
            "are the last available ledger snapshot, not a live crawl."
        )
    else:
        css_class = "freshness"
        text = (
            f"Latest recorded document check: {freshness['checked_label']} "
            f"({freshness['age_label']}). Individual documents may be older; this is "
            "not a completed-crawl timestamp or guarantee of complete coverage."
        )
    return f"<p class='{css_class}' role='status'>{_esc(text)}</p>"

_CSS = """
:root{--ink:#141414;--paper:#f4ecd8;--rust:#b4432f;--gold:#ffd93b;--sage:#5c7a4f;
--faded:#6d7b86;--card:#fffdf7;--rule:#d8cfbc}
*{box-sizing:border-box}body{margin:0;background-color:var(--paper);
background-image:radial-gradient(#ddd2b8 1.2px,transparent 1.3px);
background-size:15px 15px;color:var(--ink);
font-family:Georgia,'Times New Roman',serif;line-height:1.55}
.wrap{max-width:1060px;margin:0 auto;padding:0 20px}
.mast{background:#141414;color:var(--paper);border:4px solid #0a0a0a;
box-shadow:8px 8px 0 var(--rust);padding:24px 22px 18px;margin:18px 0 6px;
transform:rotate(-.4deg)}
.issue{display:inline-block;background:var(--gold);color:#141414;
font-family:Impact,'Arial Black',sans-serif;font-size:15px;letter-spacing:.12em;
padding:4px 14px;border:2px solid #000;box-shadow:3px 3px 0 #000;margin-bottom:10px}
.mast h1{font-size:clamp(38px,6vw,66px);letter-spacing:.03em;margin:0;color:#fff;
font-family:Impact,'Arial Black',sans-serif;font-weight:400;line-height:1;
text-shadow:3px 3px 0 var(--rust),6px 6px 0 #000;text-transform:uppercase}
.kick{font-size:15px;color:var(--paper);margin:8px 0 0;font-style:italic}
.tag{display:inline-block;margin-top:10px;background:var(--rust);color:#fff;
padding:6px 14px;font-family:Impact,'Arial Black',sans-serif;font-size:15px;
letter-spacing:.08em;border:2px solid #000}
.wind{display:flex;gap:10px;align-items:center;margin-top:14px;color:var(--gold);
font-family:'Courier New',monospace;font-size:13px}
.strip{display:flex;flex-wrap:wrap;gap:14px;margin:26px 0}
.stat{flex:1 1 150px;background:var(--card);border:3px solid #0a0a0a;
box-shadow:5px 5px 0 #0a0a0a;padding:14px 16px;transform:rotate(-.4deg)}
.stat b{display:block;font-family:Impact,'Arial Black',sans-serif;font-weight:400;
font-size:36px;line-height:1}
.stat span{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--faded)}
h2{font-family:Impact,'Arial Black',sans-serif;font-weight:400;font-size:30px;
letter-spacing:.05em;margin:34px 0 4px;color:var(--ink);
border-bottom:4px solid var(--ink);padding-bottom:6px;text-transform:uppercase}
h2:before{content:'★ ';color:var(--rust)}
.rule{font-size:12.5px;color:var(--faded);margin:0 0 14px}
.qotw{background:var(--card);border:3px solid #0a0a0a;box-shadow:6px 6px 0 #0a0a0a;
padding:16px 18px} .qotw h3{margin:0 0 6px;font-size:22px;
font-family:Impact,'Arial Black',sans-serif;font-weight:400;letter-spacing:.03em}
.watch{font-family:'Courier New',monospace;font-size:13px;color:var(--rust);margin-top:8px}
table{width:100%;border-collapse:collapse;font-size:14.5px;background:var(--card);
border:3px solid #0a0a0a;box-shadow:6px 6px 0 #0a0a0a}
th{font-family:Impact,'Arial Black',sans-serif;font-weight:400;text-transform:uppercase;
font-size:14px;letter-spacing:.08em;text-align:left;background:#141414;color:var(--gold);
padding:8px}
td{border-bottom:1px solid var(--rule);padding:8px;vertical-align:top}
tr:hover td{background:#f3ecdc}
.t{font-family:'Courier New',monospace;font-size:12px;color:var(--faded);white-space:nowrap}
.qu{color:#3d4a56;font-style:italic}
a{color:var(--rust);font-weight:700} .term{font-family:'Courier New',monospace;font-size:12px;
color:var(--sage);white-space:nowrap}
.empty{border:3px dashed var(--faded);padding:16px;text-align:center;color:var(--faded);
font-family:'Courier New',monospace;font-size:13px;background:var(--card)}
.tl{list-style:none;margin:0;padding:0}
.tl li{display:flex;gap:14px;padding:10px 0;border-bottom:1px solid var(--rule)}
.tl time{flex:0 0 96px;font-family:'Courier New',monospace;font-size:12.5px;color:var(--rust)}
.draft{background:var(--card);border:3px solid #0a0a0a;box-shadow:5px 5px 0 #0a0a0a;
padding:14px 16px;margin:10px 0}
.recruit{background:#141414;color:#fff;border:3px solid #0a0a0a;
box-shadow:6px 6px 0 var(--rust);padding:18px;margin:30px 0 0;transform:rotate(-.4deg)}
.recruit b{font-family:Impact,'Arial Black',sans-serif;font-weight:400;font-size:24px;
letter-spacing:.05em;color:var(--gold)}
.recruit p{margin:8px 0 0} .recruit a{color:var(--gold)}
footer{margin:44px 0 26px;border-top:6px double var(--ink);padding-top:16px;
font-size:12.5px;color:var(--faded)}
.method li{margin:4px 0}
.mono{font-family:'Courier New',monospace}
.freshness{border:2px solid #5c7a4f;background:#f4f7ec;padding:10px 12px;
font-family:'Courier New',monospace;font-size:12px;margin:16px 0}
.freshness--stale,.freshness--unknown{border:3px solid #b4432f;background:#fff3eb;color:#702318}
"""

_EMBLEM = """<svg width="52" height="52" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<polygon points="26,2 32,10 41,7 41,17 50,21 45,29 48,38 39,38 36,47 28,42 20,47 17,38 8,38 11,29 6,21 15,17 15,7 24,10" fill="#ffd93b" stroke="#0a0a0a" stroke-width="1.6"/>
<circle cx="26" cy="24" r="9" fill="#b4432f" stroke="#0a0a0a" stroke-width="2"/>
<rect x="24.6" y="30" width="2.8" height="10" fill="#f4ecd8" stroke="#0a0a0a" stroke-width="1"/>
<rect x="20" y="40" width="12" height="2.6" fill="#f4ecd8" stroke="#0a0a0a" stroke-width="1"/>
</svg>"""


def _esc(s: str) -> str:
    return html.escape(s or "", quote=True)


def build(now: _dt.datetime | None = None, output_dir: Path | str | None = None) -> str:
    """Build the static ledger from its stored database snapshot.

    `now` is injectable for deterministic tests. `output_dir` is used by the
    Streamlit preview to render a fresh date-relative page in a temporary
    directory without overwriting the committed public export.
    """
    current = _as_utc(now)
    out_root = Path(output_dir) if output_dir is not None else PUBLIC
    facts = json.loads((ROOT / "config" / "facts.json").read_text())
    site = facts["site"]
    conn = db.connect()
    try:
        st = {
            "docs": conn.execute("SELECT COUNT(*) c FROM documents").fetchone()["c"],
            "alerts": conn.execute("SELECT COUNT(*) c FROM alerts").fetchone()["c"],
            "edits": conn.execute("SELECT COUNT(*) c FROM versions WHERE seq>1").fetchone()["c"],
            "drafts": conn.execute("SELECT COUNT(*) c FROM requests WHERE status='draft'").fetchone()["c"],
        }
        last_checked_row = conn.execute("SELECT MAX(last_checked) AS checked_at FROM documents").fetchone()
        last_checked = last_checked_row["checked_at"] if last_checked_row else None
        alerts = conn.execute(
            "SELECT a.term, a.snippet, a.created_at, d.url, d.title FROM alerts a"
            " JOIN documents d ON d.id=a.document_id ORDER BY a.id DESC LIMIT 60").fetchall()
        edits = conn.execute(
            "SELECT v.captured_at, v.seq, v.change_summary, d.url, d.title FROM versions v"
            " JOIN documents d ON d.id=v.document_id WHERE v.seq>1 ORDER BY v.id DESC").fetchall()
        reqs = conn.execute("SELECT * FROM requests ORDER BY id DESC LIMIT 10").fetchall()
    finally:
        conn.close()

    freshness = source_check_freshness(last_checked, current)
    out_root.mkdir(parents=True, exist_ok=True)
    drafts_dir = out_root / "drafts"
    drafts_dir.mkdir(exist_ok=True)
    draft_links = []
    for r in reqs:
        fn = f"draft-{r['id']:04d}-{r['kind']}.md"
        (drafts_dir / fn).write_text(r["body"])
        draft_links.append(
            f"<div class='draft'><b class='mono'>DRAFT #{r['id']:04d} — {_esc(r['kind'].upper())}</b> · "
            f"{_esc(r['subject'])} · <a href='drafts/{fn}'>read the letter</a><br>"
            f"<span class='t'>filed {_esc(r['created_at'])} · a human reads and sends it. the machine does not mail letters.</span></div>")

    local_now = current.astimezone(DENVER)
    today = local_now.date()
    pet = _dt.date.fromisoformat(site["petition_file_date"])
    election_value, election_label = countdown_metric(site["election_day"], current, "Nov. 3 election")
    election_label = f"{election_label} · as of {today.strftime('%B')} {today.day}, {today.year} {local_now.tzname()}"
    days_since_pet = max(0, (today - pet).days)

    stats_html = "".join([
        f"<div class='stat'><b>{st['docs']}</b><span>documents fingerprinted</span></div>",
        f"<div class='stat'><b>{st['alerts']}</b><span>watchlist hits, quoted</span></div>",
        f"<div class='stat'><b>{st['edits']}</b><span>silent edits caught</span></div>",
        f"<div class='stat'><b>{st['drafts']}</b><span>drafts awaiting a human</span></div>",
        f"<div class='stat'><b>{_esc(election_value)}</b><span>{_esc(election_label)}</span></div>",
    ])

    edits_html = "".join(
        f"<tr><td class='t'>{_esc(r['captured_at'][:10])}</td><td><a href='{_esc(r['url'])}'>"
        f"{_esc(r['title'])}</a></td><td class='mono'>seq {r['seq']} — {_esc(r['change_summary'])}</td></tr>"
        for r in edits) or ("<div class='empty'>None yet. A quiet ledger is a true report. "
                            "If a published page changes by one hash, this table fills itself.</div>")
    if edits:
        edits_html = "<table><tr><th>When</th><th>Document</th><th>Change</th></tr>" + edits_html + "</table>"

    alerts_html = ("<table><tr><th>When</th><th>Flag</th><th>What the record says (verbatim)</th>"
                   "<th>Source</th></tr>" + "".join(
        f"<tr><td class='t'>{_esc(r['created_at'][:10])}</td>"
        f"<td class='term'>{_esc(r['term'])}</td>"
        f"<td class='qu'>{_esc(r['snippet'])}</td>"
        f"<td><a href='{_esc(r['url'])}'>source</a></td></tr>"
        for r in alerts) + "</table>") if alerts else \
        "<div class='empty'>No alerts are recorded in the available ledger snapshot.</div>"

    tl_html = "".join(
        f"<li><time>{_esc(e['date'])}</time><span>{_esc(e['label'])}"
        + (f" <a href='{_esc(e['url'])}'>[record]</a>" if e.get("url") else "")
        + "</span></li>"
        for e in facts["timeline"])

    q = facts["question_of_the_week"]
    generated = current.strftime("%Y-%m-%dT%H:%M:%SZ")
    checked_attr = _esc(freshness["last_checked"] or "")
    stale_attr = "unknown" if freshness["stale"] is None else str(freshness["stale"]).lower()

    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="rwc-generated-at" content="{_esc(generated)}">
<meta name="rwc-source-check" content="{checked_attr}">
<title>{_esc(site['title'])}</title><style>{_CSS}</style></head><body><div class="wrap" data-generated-at="{_esc(generated)}" data-last-checked="{checked_attr}" data-source-stale="{stale_attr}">
<header class="mast">
  <h1>{_esc(site['title'])}</h1>
  <p class="kick">{_esc(site['kicker'])}</p>
  <span class="tag">{_esc(site['tagline'])}</span>
  <div class="issue">HEROES OF THE PUBLIC RECORD · ISSUE #001 · NEW HEROES WANTED</div>
  <div class="wind">{_EMBLEM}<span>page rendered {_esc(generated)} UTC from the local ledger · every entry links its record ·
  day {days_since_pet} since the petition was filed · clerk certification: pending</span></div>
</header>

{_freshness_html(freshness)}
<div class="strip">{stats_html}</div>

<h2>Cover story in this snapshot</h2>
<p class="rule">A record-linked issue from the local ledger. Check the source-status timestamp above before treating items as current.</p>
<div class="qotw"><h3>{_esc(q['headline'])}</h3><p>{_esc(q['body'])}</p>
<p class="watch">WATCH FOR: {_esc(q['watch_for'])}</p></div>

<h2>Shape-shifter wire</h2>
<p class="rule">SHA-256 fingerprints of every published page, re-checked on schedule. Same words, same hash. New words, new hash — and a public diff.</p>
{edits_html}

<h2>Latest recorded tripwires</h2>
<p class="rule">Watchlist hits in the available ledger snapshot. Quotes are verbatim; links point to records; timestamps show individual fetches.</p>
{alerts_html}

<h2>The saga so far</h2>
<p class="rule">The 2026 chronology, each entry pinned to published reporting. Click [record]. Check the work.</p>
<ul class="tl">{tl_html}</ul>

<h2>Arm yourself — do the paperwork</h2>
<p class="rule">Wyoming Public Records Act drafts (W.S. §§ 16-4-201 to 16-4-205) and public comments, generated by the engine, sent by you.</p>
{''.join(draft_links)}

<div class="recruit"><b>🦸 NEW HEROES WANTED</b>
<p>Every power on the Roster started as one citizen, one mic, three minutes.
Read the statute. Quote the record. Sign your name. —
<a href="https://github.com/bartimoussmith-oss/therealwindycity/issues/new?template=tip.md">send a signal</a> ·
<a href="https://github.com/bartimoussmith-oss/therealwindycity">join the repo</a></p></div>

<footer>
  <p><b>Method.</b> This site is generated from a local ledger of public pages and
  documents fetched politely (robots.txt honored, 3-second minimum between requests,
  no logins, no paywall circumvention). Claims without a linked record do not get printed.</p>
  <ul class="method">
    <li>AI summaries here are extractive and method-labeled, or absent. The record is the text.</li>
    <li><b>No affiliation:</b> {_esc(site['voice_note'])}</li>
    <li>Engine: Civic Transparency Engine v0.1 · source + data export: civic-engine-export.tar.gz</li>
  </ul>
</footer>
</div></body></html>"""

    out = out_root / "index.html"
    out.write_text(page)
    return str(out)
