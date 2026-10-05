/* ============================================================================
   WorkDesk — bridge.js
   How work orders actually get from the platforms into this static page.

   A GitHub Pages site cannot log in as you, and it cannot read another origin's
   DOM or cookies. So the bridge is: your Sidekick userscript (which CAN see the
   pages you're already logged into) hands normalized rows to this page over one
   of four channels. All four are implemented; pick per situation.

     1. HANDOFF  — Sidekick opens this page with the payload in the URL fragment.
                   Fragment never reaches the server, never hits a log line, and
                   works with zero credentials. This is the default.
     2. SYNC CODE— Sidekick puts a `WD1-…` code on your clipboard; you paste it
                   here. Best when pop-ups are blocked or you're on two devices.
     3. RELAY    — optional pull from a URL you control: a GitHub Gist, a
                   raw.githubusercontent.com file committed by the Actions
                   poller (worker/poll.py), or an ntfy.sh topic. Needs a token
                   only if the relay is private.
     4. MANUAL   — drop a JSON/CSV/TXT file, or paste raw listing text.
   ========================================================================== */
(function (global) {
  'use strict';
  const WD = (global.WorkDesk = global.WorkDesk || {});
  const { iso, b64, gzip, gunzip, toast, hash, el } = WD;

  const CHANNEL = 'workdesk-handoff';
  let bc = null;
  try { bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null; } catch (e) {}

  const state = {
    lastHandoffAt: null,
    lastRelayAt: null,
    relayEtag: null,
    counts: { handoff: 0, synccode: 0, relay: 0, manual: 0, api: 0 },
    errors: []
  };

  function noteError(where, err) {
    state.errors.push({ where, message: String(err && err.message || err), at: iso(new Date()) });
    if (state.errors.length > 40) state.errors.shift();
    WD.store && WD.store.addLog('bridge-error', { where, message: String(err && err.message || err) });
  }

  /* ------------------------------------------------- sidekick envelope
     The Sidekick ships RAW captures, not normalized orders — adapters live
     here so a platform change is a site fix, not a userscript reinstall.
     Envelope: {workdesk:1, sidekick, platform, page, nets:[{url,at,json}],
                doms:[{platform, dom:[{title,city,state,pay,start,url,id,
                description,company,text}]}]}                              */
  function isSidekickEnvelope(p) {
    return p && typeof p === 'object' && (p.workdesk === 1 || p.sidekick) && (p.nets || p.doms);
  }

  function unwrapSidekick(payload, meta) {
    const out = [];
    const platform = payload.platform && payload.platform !== 'unknown' ? payload.platform : (meta.platform || undefined);
    const hint = platform;
    const seenUrls = [];

    (payload.nets || []).forEach(n => {
      if (!n || !n.json) return;
      seenUrls.push(n.url);
      let rows = [];
      try {
        rows = WD.normalizePayload(n.json, {
          source: 'sidekick', method: 'network:' + (n.via || 'fetch'), platform,
          hint, pageUrl: n.url, keepRaw: true
        });
      } catch (e) { noteError('unwrap.net', e); }
      rows.forEach(r => { r.harvest.endpoint = n.url; r.harvest.captured_response_at = n.at; });
      out.push.apply(out, rows);
    });

    (payload.doms || []).forEach(d => {
      const list = (d && d.dom) || [];
      if (!list.length) return;
      let rows = [];
      try {
        rows = WD.normalizePayload(list, {
          source: 'sidekick', method: (list[0] && list[0].__via) || 'dom',
          platform: (d && d.platform) || platform, hint, pageUrl: payload.page, keepRaw: true
        });
      } catch (e) { noteError('unwrap.dom', e); }
      out.push.apply(out, rows);
    });

    // de-duplicate within this one handoff by dedupe key
    const m = new Map();
    out.forEach(r => { if (!m.has(r.dedupe)) m.set(r.dedupe, r); });
    return { rows: Array.from(m.values()), endpoints: seenUrls, sidekickVersion: payload.sidekick || null };
  }

  /* ------------------------------------------------------------ ingest */
  async function ingest(payload, meta) {
    meta = meta || {};
    let rows = [];
    let skInfo = null;
    if (isSidekickEnvelope(payload)) {
      if (payload.test) return { ok: false, added: 0, updated: 0, error: 'relay test ping — ignored', skipped: true };
      skInfo = unwrapSidekick(payload, meta);
      rows = skInfo.rows;
      await markSidekickSeen(skInfo.sidekickVersion, payload.platform, rows.length);
    }
    try {
      if (!skInfo) rows = WD.normalizePayload(payload, {
        source: meta.source || 'sidekick',
        method: meta.method || 'bridge',
        platform: meta.platform,
        hint: meta.hint,
        pageUrl: meta.pageUrl,
        home: meta.home
      });
    } catch (e) {
      noteError('normalize', e);
      return { ok: false, added: 0, updated: 0, error: String(e && e.message || e) };
    }
    if (!rows.length) return { ok: false, added: 0, updated: 0, error: 'nothing in that payload looked like a work order' };

    const existing = await WD.store.allOrders();
    const settings = await WD.store.getSettings();
    const profile = WD.profileOf(settings);

    // recompute distance against the user's home base if the payload had none
    rows.forEach(r => {
      if (r.distance_mi == null && profile.home && profile.home.lat != null) {
        const g = WD.geocode(r);
        if (g) {
          const mi = WD.haversineMiles(profile.home, g);
          if (mi != null) { r.distance_mi = WD.roadMiles(mi); r.drive_min = WD.driveMinutes(r.distance_mi); }
        }
      }
      if (!r.my) r.my = WD.blankOrder().my;
      r.my.seen_at = r.my.seen_at || iso(new Date());
      if (!r.harvest.first_seen) r.harvest.first_seen = r.captured_at;
      r.harvest.last_seen = r.captured_at;
    });

    const merged = WD.merge(existing, rows);
    await WD.store.putOrders(merged.rows);
    await WD.store.addLog('ingest', { source: meta.source || 'sidekick', added: merged.added, updated: merged.updated });

    const chKey = state.counts[meta.channel] != null ? meta.channel : 'manual';
    state.counts[chKey] = (state.counts[chKey] || 0) + merged.added;
    state.lastHandoffAt = iso(new Date());
    if (skInfo) {
      state.sidekick = state.sidekick || { handoffs: 0, endpoints: [] };
      state.sidekick.handoffs++;
      state.sidekick.endpoints = WD.uniq((state.sidekick.endpoints || []).concat(skInfo.endpoints || [])).slice(-40);
      state.sidekick.version = skInfo.sidekickVersion || state.sidekick.version;
    }

    if (bc) { try { bc.postMessage({ type: 'ingested', added: merged.added, updated: merged.updated, at: state.lastHandoffAt }); } catch (e) {} }
    return { ok: true, added: merged.added, updated: merged.updated, rows: merged.rows, incoming: rows.length };
  }

  /* --------------------------------------------------- 1. URL fragment */
  async function readFragment() {
    const frag = location.hash.replace(/^#/, '');
    const q = location.search;
    const sources = [];
    if (frag) {
      const m = frag.match(/(?:^|&)ingest=([^&]+)/);
      if (m) sources.push({ v: decodeURIComponent(m[1]), kind: 'fragment' });
      if (/^WD1-/.test(frag)) sources.push({ v: frag, kind: 'fragment' });
    }
    const p = new URLSearchParams(q);
    if (p.get('ingest')) sources.push({ v: p.get('ingest'), kind: 'query' });
    if (p.get('sync')) sources.push({ v: p.get('sync'), kind: 'query' });

    // Sidekick presence markers — no payload, just "I'm installed and I opened you"
    const ping = (frag.match(/wdping=([^&]+)/) || [])[1] || p.get('wdping');
    if (ping) await markSidekickSeen(decodeURIComponent(ping), p.get('platform') || null, 0);
    if (/wdhandoff=1/.test(frag) || p.get('wdhandoff') === '1') {
      await markSidekickSeen(ping || 'present', null, 0);
      announceReady();
      return null;
    }
    if (!sources.length) return null;

    let result = null;
    for (const s of sources) {
      try {
        const payload = await decodePayload(s.v);
        result = await ingest(payload, { source: 'sidekick', channel: 'handoff', method: s.kind });
        break;
      } catch (e) { noteError('readFragment', e); }
    }
    // scrub the payload out of the address bar so it can't be re-ingested or shared
    try { history.replaceState(null, '', location.pathname + location.search.split('ingest').join('_ingest')); } catch (e) {}
    return result;
  }

  async function decodePayload(v) {
    v = String(v || '').trim();
    if (!v) throw new Error('empty payload');

    // WD1-<gzip|b64>-<checksum>
    if (/^WD1-/.test(v)) {
      const parts = v.split('-');
      const body = parts.slice(1, -1).join('-');
      const chk = parts[parts.length - 1];
      if (chk && hash(body) !== chk && hash(body).slice(0, 6) !== chk) throw new Error('sync code checksum mismatch (copy it again in full)');
      return JSON.parse(await inflate(body));
    }
    // plain JSON
    if (v[0] === '{' || v[0] === '[') return JSON.parse(v);
    // base64url / gzip
    return JSON.parse(await inflate(v));
  }

  async function inflate(v) {
    try { return await gunzip(v); }
    catch (e) {
      try { return b64.dec(v); }
      catch (e2) { throw new Error('could not decode payload (' + e.message + ')'); }
    }
  }

  /* ------------------------------------------------------ 2. sync code */
  async function makeSyncCode(payload) {
    const json = JSON.stringify(payload);
    const body = (await gzip(json)) || b64.enc(json);
    return 'WD1-' + body + '-' + hash(body).slice(0, 6);
  }

  async function acceptSyncCode(text) {
    const v = String(text || '').trim().replace(/\s+/g, '');
    if (!v) return { ok: false, error: 'nothing pasted' };
    try {
      const payload = await decodePayload(v);
      const r = await ingest(payload, { source: 'sidekick', channel: 'synccode', method: 'sync-code' });
      return r;
    } catch (e) {
      noteError('syncCode', e);
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  /* --------------------------------------------------------- 3. relay */
  async function pullRelay(settings, opts) {
    const r = (settings && settings.relay) || {};
    if (!r.mode || r.mode === 'off') return { ok: false, skipped: true };
    let url = '', headers = {};

    if (r.mode === 'gist' && r.gistId) {
      url = 'https://api.github.com/gists/' + encodeURIComponent(r.gistId);
    } else if (r.mode === 'raw' && r.url) {
      url = r.url;
    } else if (r.mode === 'ntfy' && r.url) {
      const t = r.url.replace(/^https?:\/\/ntfy\.sh\//, '').replace(/\/.*$/, '');
      url = 'https://ntfy.sh/' + encodeURIComponent(t) + '/json?poll=1&since=12h';
    } else if (r.mode === 'custom' && r.url) {
      url = r.url;
    } else return { ok: false, skipped: true };

    if (r.token) headers['Authorization'] = 'Bearer ' + r.token;
    headers['Accept'] = 'application/vnd.github+json, application/json;q=0.9, */*;q=0.5';

    try {
      const res = await fetch(url, { headers, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
      const ct = res.headers.get('content-type') || '';
      let payload = null;

      if (r.mode === 'gist') {
        const g = await res.json();
        const files = g.files || {};
        const names = Object.keys(files);
        if (!names.length) throw new Error('that gist has no files');
        const pick = names.find(n => /workdesk|work|feed|order/i.test(n)) || names[0];
        const f = files[pick];
        const txt = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
        payload = JSON.parse(txt);
      } else if (r.mode === 'ntfy') {
        const lines = (await res.text()).split('\n').filter(Boolean);
        const chunks = [];
        lines.forEach(l => {
          try { const m = JSON.parse(l); if (m.message) chunks.push(m); } catch (e) {}
        });
        chunks.sort((a, b) => (a.time || 0) - (b.time || 0));
        const joined = chunks.map(c => c.message).join('');
        if (/^WD1-/.test(joined)) payload = JSON.parse(await inflate(joined));
        else if (joined[0] === '{' || joined[0] === '[') payload = JSON.parse(joined);
        else throw new Error('relay messages did not look like WorkDesk data');
      } else {
        const txt = await res.text();
        payload = (ct.includes('json') || txt.trim()[0] === '{' || txt.trim()[0] === '[') ? JSON.parse(txt) : null;
        if (!payload) {
          if (/^WD1-/.test(txt.trim())) payload = JSON.parse(await inflate(txt.trim()));
          else throw new Error('relay did not return JSON');
        }
      }

      const out = await ingest(payload, { source: 'relay', channel: 'relay', method: 'relay:' + r.mode });
      state.lastRelayAt = iso(new Date());
      await WD.store.setMeta('relayLastPull', state.lastRelayAt);
      return Object.assign({ ok: out.ok, mode: r.mode, url }, out);
    } catch (e) {
      noteError('relay', e);
      return { ok: false, error: String(e && e.message || e), mode: r.mode, url };
    }
  }

  /* ------------------------------------------------------- committed feed
     worker/poll.py commits data/feed.json when real API credentials exist.
     This reads it straight from the repo — no relay configuration needed. */
  async function pullCommittedFeed() {
    const candidates = [
      'data/feed.json',
      '../data/feed.json',
      './data/feed.json'
    ];
    for (const rel of candidates) {
      try {
        const res = await fetch(rel + '?_=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) continue;
        const j = await res.json();
        if (!j || (!j.orders && !Array.isArray(j))) continue;
        const out = await ingest(j.orders || j, { source: 'api', channel: 'api', method: 'committed-feed' });
        out.rel = rel;
        return out;
      } catch (e) { /* try the next path */ }
    }
    return { ok: false, skipped: true };
  }

  /* -------------------------------------------------- 4. manual import */
  async function importText(text, opts) {
    const o = Object.assign({ source: 'manual', channel: 'manual', method: 'manual' }, opts || {});
    const s = String(text || '').trim();
    if (!s) return { ok: false, error: 'nothing to import' };
    let rows = [];
    try { rows = WD.ingestAnything(s, o); } catch (e) { noteError('importText', e); return { ok: false, error: String(e.message || e) }; }
    if (!rows.length) return { ok: false, added: 0, updated: 0, error: 'no work orders recognized in that text' };
    return await ingestPreNormalized(rows, o);
  }

  async function ingestPreNormalized(rows, meta) {
    const existing = await WD.store.allOrders();
    rows.forEach(r => { if (!r.my) r.my = WD.blankOrder().my; r.source = (meta && meta.source) || 'manual'; });
    const merged = WD.merge(existing, rows);
    await WD.store.putOrders(merged.rows);
    await WD.store.addLog('ingest', { source: (meta && meta.source) || 'manual', added: merged.added, updated: merged.updated });
    return { ok: true, added: merged.added, updated: merged.updated, rows: merged.rows, incoming: rows.length };
  }

  async function importFile(file) {
    const text = await file.text();
    const name = (file.name || '').toLowerCase();
    const opts = { source: 'manual', channel: 'manual', method: 'file:' + name };
    if (name.endsWith('.csv') || name.endsWith('.tsv')) {
      const rows = WD.normalizeCSV(text, opts);
      return rows.length ? ingestPreNormalized(rows, opts) : { ok: false, error: 'no rows parsed from that CSV' };
    }
    if (name.endsWith('.json')) {
      try { return await ingest(JSON.parse(text), opts); } catch (e) { return { ok: false, error: 'invalid JSON: ' + e.message }; }
    }
    // txt / md / anything else -> pasted-text parser
    const rows = WD.normalizePasted(text, opts);
    return rows.length ? ingestPreNormalized(rows, opts) : { ok: false, error: 'could not recognize any listings in that file' };
  }

  /* -------------------------------------------------- sidekick presence */
  async function markSidekickSeen(version, platform, rowsCount) {
    const rec = { version: version || 'unknown', at: iso(new Date()), platform: platform || null, lastRows: rowsCount || 0 };
    state.sidekickSeen = Object.assign({}, state.sidekickSeen, rec);
    try { await WD.store.setMeta('sidekick', Object.assign({}, (await WD.store.getMeta('sidekick', {})), rec)); } catch (e) {}
  }
  async function sidekickSeen() {
    return state.sidekickSeen || (await WD.store.getMeta('sidekick', null));
  }

  /* ------------------------------------------------------- ready ping
     Tells the tab that opened us (the Sidekick) that we're listening, and
     hands it a nonce so only that tab can push data into this board. */
  const HANDOFF_NONCE = WD.uid('n').slice(0, 24);
  function announceReady() {
    if (!window.opener) return;
    try { window.opener.postMessage({ __workdeskReady: 1, nonce: HANDOFF_NONCE, version: WD.VERSION }, '*'); } catch (e) {}
  }

  const TRUSTED_ORIGINS = [/\.fieldnation\.com$/i, /\.workmarket\.com$/i, /^https:\/\/(?:localhost|127\.0\.0\.1)/i, /\.e2b\.app$/i];
  function originTrusted(origin) {
    if (!origin || origin === 'null') return false;
    if (origin === location.origin) return true;
    try { return TRUSTED_ORIGINS.some(re => re.test(new URL(origin).hostname)); } catch (e) { return false; }
  }

  /* -------------------------------------------------------- postMessage */
  function listenPostMessage() {
    window.addEventListener('message', async ev => {
      const d = ev.data;
      if (!d || typeof d !== 'object' || d.__workdesk !== 1) return;
      const trusted = d.nonce === HANDOFF_NONCE || ev.source === window.opener || originTrusted(ev.origin);
      if (!trusted) { noteError('postMessage', 'rejected untrusted origin ' + ev.origin); return; }
      try {
        const r = await ingest(d.payload, {
          source: d.source || 'sidekick', channel: 'handoff',
          method: d.method || 'postMessage', platform: d.platform, pageUrl: d.pageUrl
        });
        if (ev.source && ev.source.postMessage) {
          try { ev.source.postMessage({ __workdeskAck: 1, ok: !!r.ok, added: r.added || 0, updated: r.updated || 0 }, ev.origin || '*'); } catch (e) {}
        }
        if (r && r.ok) { WD.app && WD.app.reload && WD.app.reload(); ping(); }
      } catch (e) { noteError('postMessage', e); }
    });
  }

  /* ------------------------------------------------- cross-tab broadcast */
  function onIngested(fn) {
    if (bc) bc.onmessage = e => { if (e.data && e.data.type === 'ingested') fn(e.data); };
    window.addEventListener('storage', e => { if (e.key === 'workdesk.ping') fn({ added: 0, updated: 0, storage: true }); });
  }
  function ping() { try { localStorage.setItem('workdesk.ping', String(Date.now())); } catch (e) {} }

  /* ------------------------------------------------------------ export */
  async function exportBackup() {
    const rows = await WD.store.allOrders();
    const settings = await WD.store.getSettings();
    const blob = {
      app: 'WorkDesk', schema: WD.SCHEMA, version: WD.VERSION, exported_at: iso(new Date()),
      settings: Object.assign({}, settings, { relay: Object.assign({}, settings.relay, { token: null }) }),
      orders: rows
    };
    const text = JSON.stringify(blob, null, 1);
    const okDl = WD.download('workdesk-backup-' + new Date().toISOString().slice(0, 10) + '.json', text);
    if (!okDl) {
      // never leave the user with nothing: the clipboard still works
      await WD.copy(text);
      toast('This browser blocked the file download — the full backup is on your clipboard instead', 'warn', 9000);
    }
    return rows.length;
  }

  async function exportCSV(rows) {
    const cols = ['platform','id','title','company','city','state','zip','pay_type','pay_amount','hourly','score',
                  'start','posted_at','distance_mi','drive_min','status','my_state','applied_at','url'];
    const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [cols.join(',')];
    (rows || []).forEach(o => lines.push(cols.map(c => {
      if (c === 'pay_type') return esc(o.pay && o.pay.type);
      if (c === 'pay_amount') return esc(o.pay && o.pay.amount);
      if (c === 'hourly') return esc(o.rank && o.rank.netHourly ? Math.round(o.rank.netHourly.net) : (o.hourly ? Math.round(o.hourly) : ''));
      if (c === 'score') return esc(o.rank && o.rank.score);
      if (c === 'my_state') return esc(o.my && o.my.state);
      if (c === 'applied_at') return esc(o.my && o.my.applied_at);
      return esc(o[c]);
    }).join(',')));
    const text = lines.join('\n');
    const okDl = WD.download('workdesk-' + new Date().toISOString().slice(0, 10) + '.csv', text, 'text/csv');
    if (!okDl) { await WD.copy(text); toast('Download blocked — the CSV is on your clipboard instead', 'warn', 9000); }
    return (rows || []).length;
  }

  async function restoreBackup(text) {
    const j = JSON.parse(text);
    if (!j || !Array.isArray(j.orders)) throw new Error('that is not a WorkDesk backup file');
    await WD.store.putOrders(j.orders);
    if (j.settings) {
      const cur = await WD.store.getSettings();
      await WD.store.setSettings(Object.assign(cur, j.settings, { relay: Object.assign({}, cur.relay, { token: cur.relay.token }) }));
    }
    return j.orders.length;
  }

  // let a Sidekick-opened tab find us even before any payload arrives
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', announceReady);
    else announceReady();
  }

  Object.assign(WD, {
    bridge: {
      state, ingest, readFragment, decodePayload, inflate,
      makeSyncCode, acceptSyncCode, sidekickSeen, markSidekickSeen, announceReady, HANDOFF_NONCE,
      pullRelay, pullCommittedFeed,
      importText, importFile, ingestPreNormalized,
      listenPostMessage, onIngested, ping,
      exportBackup, exportCSV, restoreBackup
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
