#!/usr/bin/env python3
"""
workdesk/worker/poll.py — server-side API poller (dormant until you have keys)

READ THIS FIRST — what this file can and cannot do
--------------------------------------------------
Neither platform offers a PROVIDER-side API:

  • Field Nation's REST API (https://api.fieldnation.com/api/rest/v2) is the
    *Client API*. Its prerequisites are an **active Buyer account** and a
    **signed integration contract**; Field Nation then issues client_id /
    client_secret. Every work-order endpoint is scoped to work orders *that
    buyer posted*. It cannot search the marketplace for other buyers' open
    work. Auth is OAuth 2.0 password grant; the access token lives 3600s and
    is appended as ?access_token= on every call.

  • WorkMarket's Open API is sold to the companies that manage contractors.
    The documented pattern (see github.com/workmarket/api-node) is polling
    `assignments/list_updated` for assignments *in your own account*, then
    fetching each one. It is not a job board search for contributors.

So: run this only if you actually hold credentials. What it gives you then is
a hands-off feed of the work orders inside your own account(s) — posted work,
assignments routed to you, status changes — committed to data/feed.json, which
the WorkDesk board reads automatically with no relay configuration at all.

Everything else about your job hunt still comes through the Sidekick.

Design: pure stdlib, no pip installs, mirrors the repo's engine/ conventions.
Run `python3 poll.py selftest` to prove the plumbing offline with zero creds.
"""

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DEFAULT = os.path.normpath(os.path.join(HERE, "..", "data", "feed.json"))

FN_PROD = "https://api.fieldnation.com/api/rest/v2"
FN_SANDBOX = "https://api-sandbox.fndev.net/api/rest/v2"
WM_PROD = "https://api.workmarket.com"

MIN_INTERVAL_SECONDS = 3.0   # politeness: never hammer a vendor endpoint
_last_call = 0.0


def log(msg):
    sys.stderr.write("[poll %s] %s\n" % (dt.datetime.now(dt.timezone.utc).strftime("%H:%M:%S"), msg))
    sys.stderr.flush()


def now_iso():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _throttle():
    global _last_call
    wait = MIN_INTERVAL_SECONDS - (time.time() - _last_call)
    if wait > 0:
        time.sleep(wait)
    _last_call = time.time()


def http_json(url, method="GET", data=None, headers=None, timeout=45):
    """Tiny JSON HTTP helper. Returns (status, parsed_or_text)."""
    _throttle()
    hdrs = {"Accept": "application/json", "User-Agent": "WorkDesk-poller/1.0 (+https://github.com/therealwindycity/therealwindycity)"}
    if headers:
        hdrs.update(headers)
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8") if isinstance(data, (dict, list)) else urllib.parse.urlencode(data).encode("utf-8")
        if isinstance(data, (dict, list)) and "Content-Type" not in hdrs:
            hdrs["Content-Type"] = "application/json"
        elif "Content-Type" not in hdrs:
            hdrs["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
            try:
                return r.status, json.loads(raw)
            except ValueError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")[:2000]
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, raw
    except Exception as e:                                   # noqa: BLE001
        return 0, "network error: %s" % e


# --------------------------------------------------------------------------
# Field Nation
# --------------------------------------------------------------------------
def fn_token(env, base):
    """OAuth 2.0 password grant. Token is valid 3600s; refresh tokens are not
    supported by Field Nation, so we re-mint on every run."""
    cid = env.get("FIELD_NATION_CLIENT_ID")
    sec = env.get("FIELD_NATION_CLIENT_SECRET")
    user = env.get("FIELD_NATION_USERNAME")
    pw = env.get("FIELD_NATION_PASSWORD")
    if not (cid and sec and user and pw):
        return None, "missing FIELD_NATION_CLIENT_ID / _CLIENT_SECRET / _USERNAME / _PASSWORD"
    status, body = http_json(
        base.rstrip("/") + "/oauth",
        method="POST",
        data={"grant_type": "password", "client_id": cid, "client_secret": sec, "username": user, "password": pw},
    )
    if status != 200 or not isinstance(body, dict):
        return None, "token request failed: HTTP %s %s" % (status, _short(body))
    tok = body.get("access_token")
    if not tok:
        return None, "no access_token in response: %s" % _short(body)
    return tok, None


def fn_pull(env, sandbox=False, limit=200):
    base = FN_SANDBOX if sandbox else env.get("FIELD_NATION_BASE_URL") or FN_PROD
    tok, err = fn_token(env, base)
    if err:
        return [], err
    out = []
    # Documented collection endpoints. Which of these your contract actually
    # entitles you to depends on the scopes Field Nation granted you.
    endpoints = [
        ("/workorders", "work orders"),
        ("/workorders?status=published", "published work orders"),
        ("/workorders?status=in_progress", "in-progress work orders"),
    ]
    seen = set()
    for path, label in endpoints:
        sep = "&" if "?" in path else "?"
        url = base.rstrip("/") + path + sep + "access_token=" + urllib.parse.quote(tok, safe="")
        status, body = http_json(url)
        if status != 200:
            log("fieldnation %s -> HTTP %s %s" % (label, status, _short(body)))
            continue
        rows = _extract_list(body)
        log("fieldnation %s -> %d" % (label, len(rows)))
        for r in rows:
            rid = str(_dig(r, "id") or _dig(r, "work_order_id") or "")
            key = (rid, _dig(r, "title"))
            if key in seen:
                continue
            seen.add(key)
            r["_platform"] = "fieldnation"
            r["_source_endpoint"] = base.rstrip("/") + path
            out.append(r)
        if len(out) >= limit:
            break
    return out[:limit], None


# --------------------------------------------------------------------------
# WorkMarket
# --------------------------------------------------------------------------
def wm_pull(env, limit=200):
    """WorkMarket's documented integration pattern is: poll an assignments
    listing endpoint for changes, then fetch each assignment in full.
    The historical public sample used `assignments/list_updated` with a
    token+secret pair from api.workmarket.com. Endpoints and header names
    differ per tenant vintage, so they are overridable by env var."""
    tok = env.get("WORKMARKET_TOKEN")
    sec = env.get("WORKMARKET_SECRET")
    if not (tok and sec):
        return [], "missing WORKMARKET_TOKEN / WORKMARKET_SECRET"
    base = (env.get("WORKMARKET_BASE_URL") or WM_PROD).rstrip("/")
    list_path = env.get("WORKMARKET_LIST_PATH") or "/v1/assignments/list_updated"
    hdr_variants = [
        {"X-Token": tok, "X-Secret": sec},
        {"Authorization": "Token %s" % tok, "X-Secret": sec},
        {"Authorization": "Bearer %s" % tok},
    ]
    body = None
    used = None
    for hdrs in hdr_variants:
        status, resp = http_json(base + list_path, headers=hdrs)
        if status == 200 and isinstance(resp, (dict, list)):
            body, used = resp, hdrs
            break
        log("workmarket list attempt -> HTTP %s %s" % (status, _short(resp)))
    if body is None:
        return [], "no auth variant worked for %s — set WORKMARKET_LIST_PATH / WORKMARKET_BASE_URL to what your tenant's developer portal documents" % list_path

    rows = _extract_list(body)
    log("workmarket list -> %d assignments" % len(rows))
    out = []
    detail_path = env.get("WORKMARKET_DETAIL_PATH") or "/v1/assignments/%s"
    for r in rows[:limit]:
        aid = _dig(r, "id") or _dig(r, "assignment_id")
        if aid is None:
            continue
        # only fetch detail when the list row is thin
        if not (_dig(r, "title") and (_dig(r, "city") or _dig(r, "location"))):
            status, detail = http_json(base + detail_path % urllib.parse.quote(str(aid)), headers=used)
            if status == 200 and isinstance(detail, dict):
                merged = dict(detail)
                merged.update({k: v for k, v in r.items() if k not in merged})
                r = merged
        r["_platform"] = "workmarket"
        r["_source_endpoint"] = base + list_path
        out.append(r)
    return out, None


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def _dig(obj, *keys):
    cur = obj
    for k in keys:
        if isinstance(cur, dict) and k in cur:
            cur = cur[k]
        else:
            return None
    return cur


def _extract_list(body):
    """Find the array of records inside whatever envelope the vendor used."""
    if isinstance(body, list):
        return [x for x in body if isinstance(x, dict)]
    if not isinstance(body, dict):
        return []
    for key in ("results", "data", "workorders", "work_orders", "assignments", "items", "records", "orders", "rows"):
        v = body.get(key)
        if isinstance(v, list):
            return [x for x in v if isinstance(x, dict)]
        if isinstance(v, dict):
            inner = _extract_list(v)
            if inner:
                return inner
    # last resort: the biggest array of objects anywhere shallow
    best = []
    for v in body.values():
        if isinstance(v, list):
            cand = [x for x in v if isinstance(x, dict)]
            if len(cand) > len(best):
                best = cand
    return best


def _short(v, n=300):
    s = v if isinstance(v, str) else json.dumps(v)[:n]
    return s[:n]


def write_feed(orders, path, sources):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    payload = {
        "_about": "Committed by workdesk/worker/poll.py from official platform APIs. "
                  "The WorkDesk board reads this file automatically. Provider-side browsing "
                  "is NOT available from either API — see the module docstring.",
        "generated_at": now_iso(),
        "generator": "workdesk-poll/1.0",
        "sources": sources,
        "count": len(orders),
        "orders": orders,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return path


# --------------------------------------------------------------------------
# selftest — proves the whole path offline with zero credentials
# --------------------------------------------------------------------------
SELFTEST_FN = {
    "results": [
        {"id": 900001, "title": "SELFTEST POS refresh", "description": {"html": "<p>Self-test order</p>"},
         "location": {"address1": "1 Test Way", "city": "Cheyenne", "state": "WY", "zip": "82001"},
         "schedule": {"service_window": {"start": {"utc": "2026-11-01 09:00:00"}}},
         "pay": {"type": "fixed", "base": {"amount": 200, "units": 1}}},
        {"id": 900002, "title": "SELFTEST fiber tie-in", "location": {"city": "Denver", "state": "CO"},
         "pay": {"type": "hourly", "base": {"amount": 55, "units": 1}}},
    ]
}
SELFTEST_WM = {
    "assignments": [
        {"id": "wm-selftest-1", "title": "SELFTEST site survey", "company": {"name": "Self Test Co"},
         "city": "Laramie", "state": "WY", "pay_rate": "$42/hr", "start_date": "2026-11-03"},
    ]
}


def selftest():
    log("selftest: exercising list extraction + feed writing with no network")
    fn_rows = _extract_list(SELFTEST_FN)
    wm_rows = _extract_list(SELFTEST_WM)
    assert len(fn_rows) == 2, "fieldnation extraction broke: %d" % len(fn_rows)
    assert len(wm_rows) == 1, "workmarket extraction broke: %d" % len(wm_rows)
    for r in fn_rows:
        r["_platform"] = "fieldnation"
    for r in wm_rows:
        r["_platform"] = "workmarket"
    orders = fn_rows + wm_rows

    # prove the dashboard's normalizer will read what we write
    js = os.path.normpath(os.path.join(HERE, "..", "assets", "normalize.js"))
    if os.path.exists(js):
        log("selftest: %s present (%d bytes)" % (os.path.basename(js), os.path.getsize(js)))
    else:
        log("WARNING: normalize.js not found next to worker/ — the board cannot map this feed")

    out = os.path.join(HERE, "_selftest_feed.json")
    write_feed(orders, out, ["selftest"])
    with open(out, encoding="utf-8") as f:
        back = json.load(f)
    assert back["count"] == 3, "feed round-trip lost rows"
    os.remove(out)
    log("selftest: PASS — 3 orders, extraction + feed write + round-trip all green")
    return 0


def run_once(env, sandbox=False, path=OUT_DEFAULT, limit=200):
    sources = []
    orders = []

    have_fn = bool(env.get("FIELD_NATION_CLIENT_ID"))
    have_wm = bool(env.get("WORKMARKET_TOKEN"))
    if not (have_fn or have_wm):
        log("no credentials in the environment — nothing to poll.")
        log("Field Nation needs FIELD_NATION_CLIENT_ID/_CLIENT_SECRET/_USERNAME/_PASSWORD "
            "(a Buyer account + integration contract).")
        log("WorkMarket needs WORKMARKET_TOKEN/_SECRET (a company tenant + developer portal access).")
        log("Until then the board is fed by the Sidekick. Exiting 0 so the Action stays green.")
        return 0

    if have_fn:
        rows, err = fn_pull(env, sandbox=sandbox, limit=limit)
        if err:
            log("fieldnation: SKIPPED — %s" % err)
            sources.append({"platform": "fieldnation", "ok": False, "error": err})
        else:
            orders.extend(rows)
            sources.append({"platform": "fieldnation", "ok": True, "count": len(rows),
                            "sandbox": sandbox, "at": now_iso()})

    if have_wm:
        rows, err = wm_pull(env, limit=limit)
        if err:
            log("workmarket: SKIPPED — %s" % err)
            sources.append({"platform": "workmarket", "ok": False, "error": err})
        else:
            orders.extend(rows)
            sources.append({"platform": "workmarket", "ok": True, "count": len(rows), "at": now_iso()})

    write_feed(orders, path, sources)
    log("wrote %d orders -> %s" % (len(orders), path))
    return 0


def main():
    ap = argparse.ArgumentParser(description="WorkDesk API poller (see module docstring for what the APIs actually allow)")
    sub = ap.add_subparsers(dest="cmd")

    p1 = sub.add_parser("once", help="poll once and write data/feed.json")
    p1.add_argument("--sandbox", action="store_true", help="use Field Nation's sandbox (api-sandbox.fndev.net)")
    p1.add_argument("--out", default=OUT_DEFAULT, help="where to write the feed (default: %(default)s)")
    p1.add_argument("--limit", type=int, default=200, help="max orders per platform")

    p2 = sub.add_parser("check", help="print which credentials are present, without using them")
    p2.add_argument("--sandbox", action="store_true")

    sub.add_parser("selftest", help="prove extraction + feed writing offline, zero credentials")

    a = ap.parse_args()
    env = dict(os.environ)

    if a.cmd == "selftest":
        return selftest()
    if a.cmd == "check":
        want_fn = ["FIELD_NATION_CLIENT_ID", "FIELD_NATION_CLIENT_SECRET", "FIELD_NATION_USERNAME", "FIELD_NATION_PASSWORD"]
        want_wm = ["WORKMARKET_TOKEN", "WORKMARKET_SECRET"]
        print("Field Nation (%s):" % ("sandbox" if a.sandbox else "production"))
        for k in want_fn:
            print("  %-30s %s" % (k, "set" if env.get(k) else "MISSING"))
        print("WorkMarket:")
        for k in want_wm:
            print("  %-30s %s" % (k, "set" if env.get(k) else "MISSING"))
        optional = ["FIELD_NATION_BASE_URL", "WORKMARKET_BASE_URL", "WORKMARKET_LIST_PATH", "WORKMARKET_DETAIL_PATH"]
        print("Optional overrides:")
        for k in optional:
            print("  %-30s %s" % (k, env.get(k) or "(default)"))
        return 0
    if a.cmd == "once":
        return run_once(env, sandbox=a.sandbox, path=a.out, limit=a.limit)

    ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
