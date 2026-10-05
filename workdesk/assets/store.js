/* ============================================================================
   WorkDesk — store.js
   Persistence. IndexedDB first (it holds thousands of orders without choking),
   localStorage fallback for private-mode / file:// browsers.

   Privacy: nothing here ever leaves your device unless YOU turn on the relay
   in bridge.js. There is no analytics, no beacon, no third-party call.
   ========================================================================== */
(function (global) {
  'use strict';
  const WD = (global.WorkDesk = global.WorkDesk || {});
  const { iso } = WD;

  const DB_NAME = 'workdesk';
  const DB_VER  = 1;
  const S_ORDERS = 'orders', S_META = 'meta', S_LOG = 'log';

  const DEFAULT_SETTINGS = {
    profile: WD.DEFAULT_PROFILE,
    ui: { tab: 'available', sort: 'score', platform: 'all', density: 'cozy', showExplain: true },
    filters: { minPay: null, maxDist: null, when: 'any', must: '', not: '', freshOnly: false, hideHandled: true },
    templates: [
      { id: 'default', name: 'Standard — short & concrete',
        body: "Hi {company},\n\nI'm a field tech based in {home_city}, {home_state} — {distance} from this site ({drive_time}).\n\nI can cover this {start_day}. Relevant work I do regularly: {skills}.\n\nWhat I bring:\n• Own tools, {vehicle}, ladder, tester, and PPE\n• Available for the full posted window; can send photos/sign-off same day\n• {certifications}\n\nReady to accept if it's a fit — happy to jump on a call.\n\n{first_name} {last_name}\n{phone} · {email}" },
      { id: 'fast', name: 'Quick accept — 3 lines',
        body: "Hi {company} — I'm {first_name}, {distance} out in {home_city}. I can take this {start_day} and I do {skills} weekly. Tools, truck, and PPE are ready. Available now — just say go." },
      { id: 'detail', name: 'Detail-heavy — for scoped/technical work',
        body: "Hi {company},\n\nApplying for {title} in {city}, {state} ({start_day}).\n\nWhy I'm the right tech:\n• {distance} away — {drive_time} on-site, no travel cost to you\n• {skills}\n• {certifications}\n• {experience_years} years in field service; {completed_jobs} jobs tracked through WorkDesk\n\nHow I work the job:\n1. Arrive 15 min early, check in with the site contact\n2. Photo the before state, work to the posted scope\n3. Test/verify each item, photo the after state\n4. Same-day sign-off + notes so your close-out is clean\n\nTools: {tools}\n\n{first_name} {last_name} · {phone} · {email}" }
    ],
    activeTemplate: 'default',
    my: { first_name: '', last_name: '', phone: '', email: '', certifications: '',
          experience_years: '', tools: '', vehicle: 'a truck and trailer' },
    relay: { mode: 'off', url: '', token: '', gistId: '', repoPath: 'workdesk/data/feed.json', pollMinutes: 15, lastPull: null },
    wizard: { stage: 0, done: [], lastNudge: null, dismissedCoach: false },
    notifications: { enabled: false, minScore: 55, minPay: 100, maxMiles: 120 },
    api: { fieldnation: { baseUrl: 'https://api.fieldnation.com/api/rest/v2', enabled: false },
           workmarket:  { baseUrl: 'https://api.workmarket.com', enabled: false } },
    seenVersion: null
  };

  /* ---------------------------------------------------------- backend */
  let db = null, mode = 'memory';
  const mem = { orders: new Map(), meta: new Map(), log: [] };

  function openDB() {
    return new Promise(resolve => {
      if (typeof indexedDB === 'undefined') { mode = 'localstorage'; return resolve(null); }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { mode = 'localstorage'; return resolve(null); }
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(S_ORDERS)) {
          const st = d.createObjectStore(S_ORDERS, { keyPath: 'dedupe' });
          st.createIndex('platform', 'platform', { unique: false });
          st.createIndex('state', 'my.state', { unique: false });
          st.createIndex('captured', 'captured_at', { unique: false });
        }
        if (!d.objectStoreNames.contains(S_META)) d.createObjectStore(S_META, { keyPath: 'k' });
        if (!d.objectStoreNames.contains(S_LOG)) d.createObjectStore(S_LOG, { autoIncrement: true });
      };
      req.onsuccess = () => { db = req.result; mode = 'idb'; resolve(db); };
      req.onerror = () => { mode = 'localstorage'; resolve(null); };
      req.onblocked = () => { mode = 'localstorage'; resolve(null); };
    });
  }

  function lsGet(k, fb) {
    try { const v = localStorage.getItem('workdesk.' + k); return v == null ? fb : JSON.parse(v); }
    catch (e) { return fb; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem('workdesk.' + k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }

  function tx(store, rw) {
    return db.transaction(store, rw ? 'readwrite' : 'readonly').objectStore(store);
  }
  function req2p(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

  /* ----------------------------------------------------------- orders */
  async function allOrders() {
    if (mode === 'idb') return await req2p(tx(S_ORDERS).getAll());
    if (mode === 'localstorage') return lsGet('orders', []);
    return Array.from(mem.orders.values());
  }

  async function putOrders(rows) {
    if (!rows || !rows.length) return 0;
    if (mode === 'idb') {
      const t = db.transaction(S_ORDERS, 'readwrite'), st = t.objectStore(S_ORDERS);
      rows.forEach(r => st.put(r));
      return await new Promise(res => { t.oncomplete = () => res(rows.length); t.onerror = () => res(0); });
    }
    if (mode === 'localstorage') {
      const cur = new Map(lsGet('orders', []).map(o => [o.dedupe, o]));
      rows.forEach(r => cur.set(r.dedupe, r));
      const arr = Array.from(cur.values());
      const ok = lsSet('orders', arr);
      if (!ok) { /* quota: keep the newest 500 */
        arr.sort((a, b) => String(b.captured_at).localeCompare(String(a.captured_at)));
        lsSet('orders', arr.slice(0, 500));
      }
      return rows.length;
    }
    rows.forEach(r => mem.orders.set(r.dedupe, r));
    return rows.length;
  }

  async function patchOrders(patches) {
    // patches: {dedupe: {my:{...}}}
    const rows = await allOrders();
    const out = [];
    rows.forEach(r => {
      const p = patches[r.dedupe];
      if (!p) return;
      if (p.my) r.my = Object.assign({}, r.my, p.my);
      Object.keys(p).forEach(k => { if (k !== 'my') r[k] = p[k]; });
      out.push(r);
    });
    await putOrders(out);
    return out.length;
  }

  async function deleteOrder(dedupe) {
    if (mode === 'idb') { await req2p(tx(S_ORDERS, true).delete(dedupe)); return; }
    const rows = (await allOrders()).filter(o => o.dedupe !== dedupe);
    if (mode === 'localstorage') lsSet('orders', rows); else mem.orders.delete(dedupe);
  }

  async function clearOrders() {
    if (mode === 'idb') { await req2p(tx(S_ORDERS, true).clear()); return; }
    if (mode === 'localstorage') lsSet('orders', []); else mem.orders.clear();
  }

  /* ------------------------------------------------------------- meta */
  async function getMeta(k, fb) {
    if (mode === 'idb') { const r = await req2p(tx(S_META).get(k)); return r ? r.v : fb; }
    return lsGet('meta.' + k, fb);
  }
  async function setMeta(k, v) {
    if (mode === 'idb') { await req2p(tx(S_META, true).put({ k, v })); return; }
    lsSet('meta.' + k, v);
  }

  async function getSettings() {
    const s = await getMeta('settings', null);
    return deepMerge(structuredCloneSafe(DEFAULT_SETTINGS), s || {});
  }
  async function setSettings(s) { await setMeta('settings', s); }

  function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
  function deepMerge(a, b) {
    if (!b || typeof b !== 'object') return a;
    Object.keys(b).forEach(k => {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], b[k]);
      else a[k] = b[k];
    });
    return a;
  }

  /* -------------------------------------------------------------- log */
  async function addLog(kind, detail) {
    const entry = { t: iso(new Date()), kind, detail: detail == null ? null : detail };
    if (mode === 'idb') {
      try {
        const t = db.transaction(S_LOG, 'readwrite'), st = t.objectStore(S_LOG);
        st.add(entry);
        // keep it from growing forever
        const c = await req2p(st.count());
        if (c > 3000) {
          const keys = await req2p(st.getAllKeys());
          keys.slice(0, c - 3000).forEach(k => st.delete(k));
        }
      } catch (e) { /* non-fatal */ }
      return;
    }
    const arr = lsGet('log', []); arr.push(entry); lsSet('log', arr.slice(-3000));
  }
  async function getLog(n) {
    if (mode === 'idb') { const all = await req2p(tx(S_LOG).getAll()); return all.slice(-(n || 200)); }
    return lsGet('log', []).slice(-(n || 200));
  }

  /* -------------------------------------------------- derived history */
  function buildBuyerHistory(rows) {
    const h = {};
    (rows || []).forEach(o => {
      const c = WD.norm(o.company);
      if (!c) return;
      h[c] = h[c] || { applied: 0, won: 0, lost: 0, ignored: 0, saved: 0 };
      const s = o.my && o.my.state;
      if (s === 'applied') h[c].applied++;
      else if (s === 'won') h[c].won++;
      else if (s === 'lost') h[c].lost++;
      else if (s === 'ignored') h[c].ignored++;
      else if (s === 'saved') h[c].saved++;
    });
    // Drop companies with no actual signal. An all-zero entry made
    // buyerComponent take its "has history" branch for every company on the
    // board and render a blank reason under the Buyer-history bar.
    Object.keys(h).forEach(c => {
      const e = h[c];
      if (!e.applied && !e.won && !e.lost && !e.ignored && !e.saved) delete h[c];
    });
    return h;
  }

  /* ------------------------------------------------------------- init */
  async function init() {
    await openDB();
    const s = await getSettings();
    if (!s.profile || !s.profile.home) s.profile = Object.assign({}, DEFAULT_PROFILE, s.profile || {});
    await setSettings(s);
    return { mode, settings: s };
  }

  async function stats() {
    const rows = await allOrders();
    const by = k => rows.filter(r => (r.my && r.my.state) === k).length;
    const plat = p => rows.filter(r => r.platform === p).length;
    return {
      total: rows.length,
      open: by('open'), saved: by('saved'), applied: by('applied'),
      ignored: by('ignored'), won: by('won'), lost: by('lost'),
      fieldnation: plat('fieldnation'), workmarket: plat('workmarket'),
      unknown: rows.filter(r => r.platform === 'unknown').length,
      backend: mode,
      lastCapture: rows.map(r => r.captured_at).filter(Boolean).sort().pop() || null
    };
  }

  Object.assign(WD, {
    store: {
      init, allOrders, putOrders, patchOrders, deleteOrder, clearOrders,
      getMeta, setMeta, getSettings, setSettings, addLog, getLog,
      buildBuyerHistory, stats, get backend() { return mode; }
    },
    DEFAULT_SETTINGS
  });
})(typeof window !== 'undefined' ? window : globalThis);
