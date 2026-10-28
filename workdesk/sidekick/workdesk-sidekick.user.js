// ==UserScript==
// @name         WorkDesk Sidekick — Field Nation + WorkMarket
// @namespace    https://github.com/therealwindycity/therealwindycity/tree/main/workdesk
// @version      1.0.0
// @description  Reads the work orders you're ALREADY logged in to see on Field Nation and WorkMarket and hands them to your WorkDesk board. No password is ever read, stored, or sent.
// @author       WorkDesk
// @license      MIT
// @match        https://app.fieldnation.com/*
// @match        https://www.fieldnation.com/*
// @match        https://*.fieldnation.com/*
// @match        https://app.workmarket.com/*
// @match        https://www.workmarket.com/*
// @match        https://*.workmarket.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        GM_addStyle
// @connect      github.com
// @connect      gist.github.com
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// @connect      ntfy.sh
// @connect      *
// @run-at       document-start
// @noframes
// @icon         data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='18' fill='%230e1116'/%3E%3Cpath d='M22 62 L40 34 L54 54 L64 42 L80 62' stroke='%23ffb020' stroke-width='9' fill='none' stroke-linejoin='round' stroke-linecap='round'/%3E%3C/svg%3E
// ==/UserScript==

/* ============================================================================
   WorkDesk Sidekick
   ----------------------------------------------------------------------------
   WHAT IT DOES
     1. Watches the network traffic of the page you are logged into and keeps
        the JSON responses that contain work-order listings.
     2. Falls back to reading the rendered cards in the DOM when a platform
        renders without a capturable JSON call (or changes its endpoints).
     3. Normalizes nothing — it ships RAW captures to WorkDesk, which owns the
        adapters. That means when a platform changes shape, you fix the site,
        not this script. No reinstall needed.
     4. Hands the captures over by: opening WorkDesk with the payload, posting
        it to the open WorkDesk tab, copying a sync code, or pushing to a relay
        you configure (ntfy.sh topic / GitHub Gist).

   WHAT IT NEVER DOES
     • read, store, or transmit your username, password, or session cookie
     • submit an application, accept an assignment, or click anything for you
     • call a platform endpoint you didn't cause by browsing
     • phone home. There is no telemetry endpoint in this file.

   The one thing it does send anywhere is what YOU press a button to send,
   to a destination YOU configured.
   ========================================================================== */
(function () {
  'use strict';

  const VERSION = '1.0.0';
  const HOST = location.hostname;
  const PLATFORM = /fieldnation/i.test(HOST) ? 'fieldnation'
                 : /workmarket/i.test(HOST)  ? 'workmarket' : 'unknown';

  /* --------------------------------------------------------------- config */
  const DEFAULTS = {
    wdUrl: 'https://therealwindycity.github.io/therealwindycity/workdesk/',
    captureNetwork: true,
    captureDom: true,
    autoSend: false,
    autoSendMinutes: 10,
    maxOrders: 400,
    relayMode: 'off',          // off | ntfy | gist
    relayTarget: '',           // ntfy topic, or gist id
    relayToken: '',            // only for a private gist
    pitchTemplate: '',         // used by the "Fill pitch" button
    taughtSelector: '',        // set by "Teach me the page"
    hudCollapsed: false,
    lastSentAt: null,
    installedAt: null
  };

  const store = {
    get(k) {
      try {
        if (typeof GM_getValue === 'function') {
          const v = GM_getValue('wd_' + k, undefined);
          return v === undefined ? DEFAULTS[k] : v;
        }
      } catch (e) {}
      try { const raw = localStorage.getItem('workdesk_sidekick_' + k); return raw == null ? DEFAULTS[k] : JSON.parse(raw); }
      catch (e) { return DEFAULTS[k]; }
    },
    set(k, v) {
      try { if (typeof GM_setValue === 'function') return GM_setValue('wd_' + k, v); } catch (e) {}
      try { localStorage.setItem('workdesk_sidekick_' + k, JSON.stringify(v)); } catch (e) {}
    },
    all() { const o = {}; Object.keys(DEFAULTS).forEach(k => o[k] = store.get(k)); return o; }
  };
  if (!store.get('installedAt')) store.set('installedAt', new Date().toISOString());

  const CFG = store.all();

  /* ------------------------------------------------------------- encoding */
  const b64u = {
    enc(str) {
      const bytes = new TextEncoder().encode(str);
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
  };
  async function gzipB64(str) {
    if (typeof CompressionStream === 'undefined') return b64u.enc(str);
    const buf = await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fnv(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
  async function syncCode(payload) {
    const json = JSON.stringify(payload);
    const body = await gzipB64(json);
    return 'WD1-' + body + '-' + fnv(body).slice(0, 6);
  }

  /* ============================================================ capture */
  const captures = {           // url -> {url, at, status, json, size, via}
    map: new Map(),
    order: [],
    bytes: 0,
    MAX_BYTES: 6 * 1024 * 1024
  };

  const LISTING_HINT = /work[_-]?order|workorder|assignment|listing|search|opportunit|gig|job|posting|available|marketplace|talent|feed|browse|result/i;
  const SKIP_HINT = /\.(png|jpe?g|gif|svg|webp|css|woff2?|ttf|ico|mp4|map)(\?|$)|analytics|telemetry|sentry|segment|hotjar|google-analytics|doubleclick|intercom|zendesk|freshchat/i;

  function recordCapture(url, text, via, status) {
    if (!text || text.length < 12) return false;
    if (SKIP_HINT.test(url)) return false;
    let json;
    try { json = JSON.parse(text); } catch (e) { return false; }
    if (!json || typeof json !== 'object') return false;

    // Only keep responses that actually look like they hold work orders.
    const interesting = LISTING_HINT.test(url) || countOrderish(json) > 0;
    if (!interesting) return false;

    const key = url.split('#')[0].slice(0, 400);
    const prev = captures.map.get(key);
    if (prev) { captures.bytes -= prev.size; captures.order.splice(captures.order.indexOf(key), 1); }
    const size = text.length;
    captures.map.set(key, { url: key, at: new Date().toISOString(), status: status || 200, json, size, via });
    captures.order.push(key); captures.bytes += size;
    while (captures.bytes > captures.MAX_BYTES && captures.order.length > 1) {
      const old = captures.order.shift(); const o = captures.map.get(old);
      if (o) { captures.bytes -= o.size; captures.map.delete(old); }
    }
    bump();
    return true;
  }

  /* Does this JSON contain things that look like work orders? Cheap and
     deliberately forgiving — false positives are fine, WorkDesk re-filters. */
  function countOrderish(node, depth) {
    depth = depth || 0;
    if (depth > 5 || node == null) return 0;
    if (Array.isArray(node)) {
      if (node.length && node.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
        const sample = node.slice(0, 6);
        const good = sample.filter(isOrderish).length;
        if (good >= Math.max(1, Math.floor(sample.length * 0.4))) return node.length;
      }
      return node.slice(0, 40).reduce((s, x) => s + countOrderish(x, depth + 1), 0);
    }
    if (typeof node !== 'object') return 0;
    let n = 0;
    for (const k in node) { if (Object.prototype.hasOwnProperty.call(node, k)) n += countOrderish(node[k], depth + 1); }
    return n;
  }

  const TITLEISH = ['title', 'name', 'job_title', 'summary', 'headline', 'subject'];
  const PAYISH = ['pay', 'rate', 'amount', 'price', 'compensation', 'pay_rate', 'budget', 'fee'];
  const LOCISH = ['city', 'location', 'address', 'state', 'zip', 'geo', 'site'];
  function isOrderish(x) {
    if (!x || typeof x !== 'object') return false;
    const keys = Object.keys(x);
    if (keys.length < 3) return false;
    const low = keys.map(k => k.toLowerCase().replace(/[^a-z]/g, ''));
    const has = list => list.some(t => low.some(k => k === t.replace(/[^a-z]/g, '') || k.includes(t.replace(/[^a-z]/g, ''))));
    let score = 0;
    if (has(TITLEISH)) score++;
    if (has(PAYISH)) score++;
    if (has(LOCISH)) score++;
    if (low.some(k => ['id', 'workorderid', 'assignmentid', 'uid', 'guid'].includes(k))) score++;
    if (low.some(k => ['startdate', 'start', 'schedule', 'window', 'duedate'].includes(k))) score++;
    if (low.some(k => ['description', 'details', 'notes', 'body'].includes(k))) score++;
    // a nested location object counts too
    if (x.location && typeof x.location === 'object') score++;
    if (x.pay && typeof x.pay === 'object') score++;
    return score >= 3;
  }

  /* ------------------------------------------------ 1. network capture */
  function hookNetwork() {
    if (!CFG.captureNetwork) return;

    const of = window.fetch;
    if (typeof of === 'function') {
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        return of.apply(this, arguments).then(res => {
          try {
            const ct = res.headers && res.headers.get ? (res.headers.get('content-type') || '') : '';
            if (/json|text/i.test(ct) || !ct) {
              res.clone().text().then(t => { try { recordCapture(url, t, 'fetch', res.status); } catch (e) {} }).catch(() => {});
            }
          } catch (e) {}
          return res;
        });
      };
    }

    const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__wdUrl = u; this.__wdMethod = m; return XO.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('load', function () {
        try {
          const ct = (this.getResponseHeader && this.getResponseHeader('content-type')) || '';
          if (/json|text/i.test(ct) || !ct) recordCapture(this.__wdUrl || '', this.responseText, 'xhr:' + (this.__wdMethod || 'GET'), this.status);
        } catch (e) {}
      });
      return XS.apply(this, arguments);
    };

    // Some SPAs push data through websockets; capture frames that parse as JSON listings.
    try {
      const WS = window.WebSocket;
      if (WS) {
        const Patched = function (url, protocols) {
          const ws = protocols === undefined ? new WS(url) : new WS(url, protocols);
          ws.addEventListener('message', ev => { try { if (typeof ev.data === 'string') recordCapture(String(url), ev.data, 'ws'); } catch (e) {} });
          return ws;
        };
        Patched.prototype = WS.prototype;
        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k, i) => { Patched[k] = i; });
        window.WebSocket = Patched;
      }
    } catch (e) {}
  }

  /* ---------------------------------------------------- 2. DOM capture */
  const domHarvest = { items: [], seen: new Set(), lastRun: 0 };

  function domCapture() {
    if (!CFG.captureDom) return;
    const now = Date.now();
    if (now - domHarvest.lastRun < 900) return;
    domHarvest.lastRun = now;

    const sel = store.get('taughtSelector');
    let nodes = [];
    if (sel) { try { nodes = Array.from(document.querySelectorAll(sel)); } catch (e) { nodes = []; } }
    if (!nodes.length) nodes = guessCards();
    if (!nodes.length) return;

    let added = 0;
    nodes.slice(0, 120).forEach(n => {
      const rec = readCard(n);
      if (!rec) return;
      const key = fnv(JSON.stringify([rec.title, rec.city, rec.pay_raw, rec.start_raw]));
      if (domHarvest.seen.has(key)) return;
      domHarvest.seen.add(key);
      domHarvest.items.push(Object.assign(rec, { __captured_at: new Date().toISOString(), __via: sel ? 'dom:taught' : 'dom:guess' }));
      added++;
    });
    while (domHarvest.items.length > CFG.maxOrders) domHarvest.items.shift();
    if (added) bump();
  }

  // Find repeated sibling elements that each contain money + a place + a title.
  function guessCards() {
    const moneyRe = /\$\s?\d{2,6}|\d{2,4}\s*(?:\/|per\s*)\s*(?:hr|hour)|USD\s?\d/i;
    const cands = [];
    const all = document.querySelectorAll('li,article,[class*="card" i],[class*="item" i],[class*="row" i],[class*="result" i],[role="listitem"],[data-testid]');
    for (const n of all) {
      if (n.closest('#wd-hud')) continue;
      const t = (n.innerText || '').trim();
      if (t.length < 25 || t.length > 2600) continue;
      if (!moneyRe.test(t)) continue;
      if (!/[A-Z]{2}|\d{5}/.test(t)) continue;
      cands.push(n);
    }
    // keep the smallest element of each overlapping group (drop wrappers)
    const out = [];
    cands.forEach(c => { if (!cands.some(o => o !== c && o.contains(c))) out.push(c); });
    return out.slice(0, 120);
  }

  function readCard(n) {
    const text = (n.innerText || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
    if (!text) return null;
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) return null;

    // title: longest of the first three lines that isn't money/date/place
    const moneyRe = /\$\s?\d|\d\s*(?:\/|per)\s*hr|USD/i;
    const dateRe = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|today|tomorrow|\b\d{1,2}(am|pm)\b/i;
    const placeRe = /\b([A-Z][A-Za-z.\- ]{1,26}),\s*([A-Z]{2})\b/;
    let title = '';
    for (const l of lines.slice(0, 4)) {
      if (moneyRe.test(l) || l.length < 6) continue;
      if (l.length > title.length && l.length < 150) title = l;
    }
    if (!title) title = lines[0] || '';

    const placeM = text.match(placeRe);
    const moneyM = text.match(/\$\s?\d[\d,]*(?:\.\d{2})?(?:\s*[-–]\s*\$?\s?\d[\d,]*(?:\.\d{2})?)?\s*(?:\/\s*(?:hr|hour)|per\s+hour|flat|fixed|each)?/i);
    const dateM = text.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{2,4})?|\d{1,2}\/\d{1,2}\/\d{2,4}/i);
    const zipM = text.match(/\b\d{5}(?:-\d{4})?\b/);

    let link = '';
    const a = n.querySelector('a[href]');
    if (a) link = a.href.startsWith('http') ? a.href : location.origin + a.getAttribute('href');

    const idM = (link || text).match(/(?:workorder|work_order|assignment|job|id)[\/=_:-](\d{3,}|[a-f0-9-]{8,})/i);

    return {
      title: title.slice(0, 200),
      city: placeM ? placeM[1].trim() : '',
      state: placeM ? placeM[2] : '',
      zip: zipM ? zipM[0] : '',
      pay: moneyM ? moneyM[0] : null,
      pay_raw: moneyM ? moneyM[0] : null,
      start: dateM ? dateM[0] : null,
      start_raw: dateM ? dateM[0] : null,
      url: link,
      id: idM ? idM[1] : '',
      description: lines.slice(1).join(' ').slice(0, 1800),
      company: guessCompany(lines, title),
      text: text.slice(0, 2500)
    };
  }

  function guessCompany(lines, title) {
    // Field Nation usually shows the buyer/company right under the title
    for (const l of lines.slice(0, 5)) {
      if (!l || l === title) continue;
      if (/\$\s?\d/.test(l) || /[A-Z]{2}\b/.test(l) || /\d{5}/.test(l)) continue;
      if (l.length > 2 && l.length < 48 && /[A-Za-z]/.test(l)) return l;
    }
    return '';
  }

  /* ------------------------------------------------------- payload build */
  function buildPayload() {
    const nets = captures.order.map(k => captures.map.get(k)).filter(Boolean).map(c => ({
      url: c.url, at: c.at, via: c.via, status: c.status, json: c.json
    }));
    const doms = domHarvest.items.length ? [{ platform: PLATFORM, dom: domHarvest.items.slice() }] : [];
    return {
      workdesk: 1, sidekick: VERSION, platform: PLATFORM,
      host: HOST, page: location.href.split('#')[0],
      captured_at: new Date().toISOString(),
      nets, doms,
      counts: { netResponses: nets.length, domCards: domHarvest.items.length }
    };
  }

  function totalOrdersSeen() {
    let n = domHarvest.items.length;
    captures.map.forEach(c => { n += countOrderish(c.json); });
    return n;
  }

  function hasAnything() { return captures.map.size > 0 || domHarvest.items.length > 0; }

  /* ========================================================= transport */
  function wdUrl() {
    let u = String(store.get('wdUrl') || DEFAULTS.wdUrl).trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    if (!/\/$/.test(u)) u += '/';
    return u;
  }

  async function sendToWorkDesk(opts) {
    opts = opts || {};
    if (!hasAnything()) { toast('Nothing captured yet — browse a listings page first', 'warn'); return false; }
    const payload = buildPayload();
    const code = await syncCode(payload);
    const url = wdUrl();

    // A) already-open WorkDesk tab → postMessage (handles big payloads)
    const opened = openTabs.filter(t => t.win && !t.win.closed);
    if (opened.length && !opts.forceUrl) {
      const t = opened[opened.length - 1];
      try {
        t.win.postMessage({ __workdesk: 1, nonce: t.nonce, payload, source: 'sidekick',
                            method: 'postMessage', platform: PLATFORM, pageUrl: location.href }, t.origin);
        toast('Sent ' + totalOrdersSeen() + ' capture(s) to your open WorkDesk tab', 'ok');
        store.set('lastSentAt', new Date().toISOString());
        if (opts.alsoPushRelay) pushRelay(payload);
        return true;
      } catch (e) { /* fall through to URL handoff */ }
    }

    // B) URL fragment handoff (small payloads only — Firefox caps address length)
    const LIMIT = 46000;
    if (code.length <= LIMIT) {
      const w = window.open(url + '#ingest=' + code, '_blank');
      if (w) { trackTab(w, url); store.set('lastSentAt', new Date().toISOString());
        toast('Opened WorkDesk with ' + totalOrdersSeen() + ' capture(s)', 'ok');
        if (opts.alsoPushRelay) pushRelay(payload);
        return true; }
    }

    // C) too big or pop-up blocked → open bare WorkDesk and post chunks
    const w2 = window.open(url + '#wdhandoff=1', '_blank');
    if (w2) {
      trackTab(w2, url);
      toast('Payload is large (' + Math.round(code.length / 1024) + ' KB) — streaming it to the new tab…', 'info', 6000);
      waitForReady(w2, url, payload, opts);
      return true;
    }

    // D) pop-ups blocked → clipboard
    await copyText(code);
    toast('Pop-up blocked. Sync code copied (' + Math.round(code.length / 1024) + ' KB) — paste it into WorkDesk → ⋯ → Import', 'warn', 11000);
    return false;
  }

  const openTabs = [];
  function trackTab(win, url) {
    let origin = '*';
    try { origin = new URL(url).origin; } catch (e) {}
    openTabs.push({ win, origin, nonce: null, at: Date.now() });
    if (openTabs.length > 6) openTabs.shift();
  }
  function waitForReady(win, url, payload, opts) {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      try { win.postMessage({ __workdesk: 1, payload, source: 'sidekick', method: 'postMessage-chunked', platform: PLATFORM, pageUrl: location.href }, '*'); } catch (e) {}
      if (tries > 20) clearInterval(t);
    }, 500);
    setTimeout(() => clearInterval(t), 11000);
    if (opts && opts.alsoPushRelay) pushRelay(payload);
  }

  // WorkDesk posts a ready ping with a nonce when it loads in a tab we opened
  window.addEventListener('message', ev => {
    const d = ev.data;
    if (!d || d.__workdeskReady !== 1) return;
    const t = openTabs.find(x => x.win === ev.source);
    if (t) { t.nonce = d.nonce || null; t.origin = ev.origin || t.origin; }
  });

  async function copyText(t) {
    try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(t); return true; } } catch (e) {}
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
    try {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  }

  async function copySyncCode() {
    if (!hasAnything()) return toast('Nothing captured yet', 'warn');
    const code = await syncCode(buildPayload());
    const ok = await copyText(code);
    toast(ok ? 'Sync code copied (' + Math.round(code.length / 1024) + ' KB). Paste it in WorkDesk → ⋯ → Import.' : 'Copy failed', ok ? 'ok' : 'err', 9000);
  }

  /* ------------------------------------------------------- relay push */
  async function pushRelay(payload) {
    const mode = store.get('relayMode'), target = String(store.get('relayTarget') || '').trim();
    if (mode === 'off' || !target) return;
    const code = await syncCode(payload);
    try {
      if (mode === 'ntfy') {
        const topic = target.replace(/^https?:\/\/ntfy\.sh\//, '').replace(/[^A-Za-z0-9_-]/g, '');
        // ntfy caps a message at 4096 bytes — chunk it and let WorkDesk rejoin in order
        const CH = 3800, parts = Math.ceil(code.length / CH);
        for (let i = 0; i < parts; i++) {
          const chunk = code.slice(i * CH, (i + 1) * CH);
          const tag = parts > 1 ? (i + 1) + '/' + parts : '1/1';
          await gmRequest({
            url: 'https://ntfy.sh/' + topic, method: 'POST',
            headers: { 'Title': 'WorkDesk ' + PLATFORM + ' ' + tag, 'Tags': 'zap', 'X-UnifiedPush': 'no' },
            data: chunk
          });
          if (parts > 1) await sleep(700);
        }
        toast('Pushed to ntfy.sh/' + topic + (parts > 1 ? ' in ' + parts + ' chunks' : ''), 'ok');
      } else if (mode === 'gist') {
        const token = String(store.get('relayToken') || '').trim();
        if (!token) return toast('Gist relay needs a token — set it in Sidekick settings', 'warn', 8000);
        const files = {};
        files['workdesk-' + PLATFORM + '.json'] = { content: JSON.stringify(payload) };
        const body = JSON.stringify({ files: files });
        const r = await gmRequest({ url: 'https://api.github.com/gists/' + target, method: 'PATCH',
          headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' }, data: body });
        if (r.status >= 200 && r.status < 300) toast('Pushed to gist ' + target.slice(0, 8) + '…', 'ok');
        else toast('Gist push failed: HTTP ' + r.status + ' — ' + String(r.responseText || '').slice(0, 160), 'err', 9000);
      }
    } catch (e) { toast('Relay push failed: ' + (e.message || e), 'err', 8000); }
  }

  function gmRequest(o) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') return reject(new Error('GM_xmlhttpRequest unavailable'));
      GM_xmlhttpRequest(Object.assign({
        timeout: 25000,
        onload: r => resolve(r), onerror: e => reject(new Error('network error')), ontimeout: () => reject(new Error('timeout'))
      }, o));
    });
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ------------------------------------------------ assisted apply fill */
  function injectFillButtons() {
    if (PLATFORM === 'unknown') return;
    const seen = new WeakSet();
    const scan = () => {
      document.querySelectorAll('textarea').forEach(ta => {
        if (seen.has(ta) || ta.closest('#wd-hud') || ta.dataset.wdFilled === '1') return;
        seen.add(ta);
        const box = ta.closest('div') || ta.parentElement;
        if (!box) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '⚡ Fill my pitch';
        btn.className = 'wd-fill';
        btn.title = 'Types your WorkDesk pitch into this box. You still press submit yourself.';
        btn.addEventListener('click', async ev => {
          ev.preventDefault(); ev.stopPropagation();
          let text = store.get('pitchTemplate') || '';
          if (!text) {
            try { text = await navigator.clipboard.readText(); } catch (e) { text = ''; }
            if (text) toast('Filled from your clipboard (WorkDesk copies your pitch when you hit Apply)', 'ok');
          }
          if (!text) return toast('No pitch stored. Set one in ⚡ → Settings → Pitch, or copy it from WorkDesk first.', 'warn', 8000);
          ta.focus();
          ta.value = text;
          ta.dataset.wdFilled = '1';
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          toast('Pitch filled — read it, then press the platform\'s own submit button', 'ok', 6000);
        });
        box.appendChild(btn);
      });
    };
    setInterval(scan, 1600);
    scan();
  }

  /* ============================================== teach me the page */
  function teachMode() {
    if (document.body.classList.contains('wd-teach')) return stopTeach();
    document.body.classList.add('wd-teach');
    const tip = document.createElement('div');
    tip.id = 'wd-teach-tip';
    tip.innerHTML = '<b>Teach mode ON</b> — click one work-order card. I\'ll find the repeating element, learn its selector, and re-capture. <button id="wd-teach-cancel">Cancel</button>';
    document.body.appendChild(tip);

    const over = e => {
      const t = pickRepeated(e.target);
      document.querySelectorAll('.wd-teach-hl').forEach(n => n.classList.remove('wd-teach-hl'));
      if (t) { t.classList.add('wd-teach-hl'); t.scrollIntoView({ block: 'nearest' }); }
    };
    const click = e => {
      e.preventDefault(); e.stopPropagation();
      const t = pickRepeated(e.target);
      if (!t) { toast('That element doesn\'t repeat — click one of the listing cards', 'warn'); return; }
      const sel = selectorFor(t);
      store.set('taughtSelector', sel);
      const n = document.querySelectorAll(sel).length;
      domHarvest.items = []; domHarvest.seen = new Set();
      domCapture();
      toast('Learned selector: ' + sel + ' → matched ' + n + ' element(s), captured ' + domHarvest.items.length, 'ok', 10000);
      stopTeach();
      renderHud();
    };
    function pickRepeated(node) {
      let cur = node;
      for (let i = 0; i < 8 && cur && cur !== document.body; i++) {
        const sel = selectorFor(cur);
        try { if (document.querySelectorAll(sel).length >= 2) return cur; } catch (e) {}
        cur = cur.parentElement;
      }
      return null;
    }
    function selectorFor(node) {
      if (node.id && !/^\d/.test(node.id)) return '#' + CSS.escape(node.id);
      const parts = [];
      let cur = node;
      while (cur && cur !== document.body && parts.length < 4) {
        let s = cur.tagName.toLowerCase();
        if (cur.className && typeof cur.className === 'string') {
          const cls = cur.className.trim().split(/\s+/)
            .filter(c => c && !/^wd-/.test(c) && c.length < 40 && !/[0-9a-f]{6,}/i.test(c))
            .slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
          s += cls;
        }
        const par = cur.parentElement;
        if (par) {
          const sibs = Array.from(par.children).filter(x => x.tagName === cur.tagName);
          if (sibs.length > 1) s += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
        }
        parts.unshift(s);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    }
    function stopTeach() {
      document.body.classList.remove('wd-teach');
      const t = document.getElementById('wd-teach-tip'); if (t) t.remove();
      document.querySelectorAll('.wd-teach-hl').forEach(n => n.classList.remove('wd-teach-hl'));
      document.removeEventListener('mouseover', over, true);
      document.removeEventListener('click', click, true);
      const c = document.getElementById('wd-teach-cancel'); if (c) c.onclick = null;
    }
    document.addEventListener('mouseover', over, true);
    document.addEventListener('click', click, true);
    const cancel = document.getElementById('wd-teach-cancel');
    if (cancel) cancel.addEventListener('click', e => { e.stopPropagation(); stopTeach(); });
    tip.addEventListener('click', e => e.stopPropagation());
  }

  /* ================================================================= HUD */
  let hud, hudCount, hudMeta, autoTimer;
  function buildHud() {
    if (document.getElementById('wd-hud')) return;
    hud = document.createElement('div');
    hud.id = 'wd-hud';
    hud.innerHTML = `
      <div class="wd-hud-head" id="wd-drag">
        <span class="wd-bolt">⚡</span>
        <span class="wd-name">WorkDesk</span>
        <span class="wd-plat">${PLATFORM === 'fieldnation' ? 'FN' : PLATFORM === 'workmarket' ? 'WM' : '?'}</span>
        <span class="wd-count" id="wd-count">0</span>
        <button class="wd-x" id="wd-min" title="Collapse">–</button>
      </div>
      <div class="wd-hud-body" id="wd-body">
        <div class="wd-meta" id="wd-meta">waiting for listings…</div>
        <button class="wd-btn wd-primary" id="wd-send">Send to WorkDesk ↗</button>
        <div class="wd-row">
          <button class="wd-btn" id="wd-code" title="Copy a WD1-… code to paste into WorkDesk">Copy code</button>
          <button class="wd-btn" id="wd-teach" title="Click a listing card so I learn its selector">Teach page</button>
        </div>
        <div class="wd-row">
          <button class="wd-btn" id="wd-set">Settings</button>
          <button class="wd-btn" id="wd-open" title="Open your WorkDesk board">Board ↗</button>
        </div>
        <label class="wd-auto"><input type="checkbox" id="wd-auto"> auto-send every
          <input type="number" id="wd-mins" min="2" max="240" value="${CFG.autoSendMinutes}"> min</label>
        <div class="wd-toastbox" id="wd-toasts"></div>
      </div>`;
    document.documentElement.appendChild(hud);

    hudCount = document.getElementById('wd-count');
    hudMeta = document.getElementById('wd-meta');
    document.getElementById('wd-send').onclick = () => sendToWorkDesk({ alsoPushRelay: true });
    document.getElementById('wd-code').onclick = copySyncCode;
    document.getElementById('wd-teach').onclick = teachMode;
    document.getElementById('wd-set').onclick = openSettings;
    document.getElementById('wd-open').onclick = () => window.open(wdUrl(), '_blank');
    document.getElementById('wd-min').onclick = () => {
      const c = store.get('hudCollapsed'); store.set('hudCollapsed', !c); applyCollapse();
    };
    const auto = document.getElementById('wd-auto'), mins = document.getElementById('wd-mins');
    auto.checked = !!CFG.autoSend; mins.value = CFG.autoSendMinutes;
    auto.onchange = () => { store.set('autoSend', auto.checked); scheduleAuto(); toast(auto.checked ? 'Auto-send ON' : 'Auto-send off', 'info'); };
    mins.onchange = () => { store.set('autoSendMinutes', Math.max(2, +mins.value || 10)); scheduleAuto(); };
    applyCollapse();
    makeDraggable(hud, document.getElementById('wd-drag'));
    scheduleAuto();
  }

  function applyCollapse() {
    const c = store.get('hudCollapsed');
    hud.classList.toggle('collapsed', !!c);
    document.getElementById('wd-min').textContent = c ? '+' : '–';
  }

  function makeDraggable(node, handle) {
    let sx, sy, ox, oy, drag = false;
    handle.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON') return;
      drag = true; sx = e.clientX; sy = e.clientY;
      const r = node.getBoundingClientRect(); ox = r.left; oy = r.top;
      node.style.right = 'auto'; node.style.bottom = 'auto';
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!drag) return;
      node.style.left = Math.max(4, Math.min(window.innerWidth - 70, ox + e.clientX - sx)) + 'px';
      node.style.top = Math.max(4, Math.min(window.innerHeight - 40, oy + e.clientY - sy)) + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!drag) return; drag = false;
      try { store.set('hudPos', { left: node.style.left, top: node.style.top }); } catch (e) {}
    });
    const p = store.get('hudPos');
    if (p && p.left) { node.style.left = p.left; node.style.top = p.top; node.style.right = 'auto'; node.style.bottom = 'auto'; }
  }

  function bump() { renderHud(); }
  function renderHud() {
    if (!hudCount) return;
    const n = totalOrdersSeen();
    hudCount.textContent = n > 999 ? '999+' : String(n);
    hud.classList.toggle('has-data', n > 0);
    const parts = [];
    if (captures.map.size) parts.push(captures.map.size + ' API response' + (captures.map.size === 1 ? '' : 's'));
    if (domHarvest.items.length) parts.push(domHarvest.items.length + ' card' + (domHarvest.items.length === 1 ? '' : 's') + ' from the page');
    hudMeta.textContent = parts.length ? parts.join(' · ') : 'waiting for listings — open your work search page';
  }

  function toast(msg, kind, ms) {
    const box = document.getElementById('wd-toasts');
    if (!box) { console.log('[WorkDesk]', msg); return; }
    const t = document.createElement('div');
    t.className = 'wd-toast ' + (kind || 'info');
    t.textContent = msg;
    box.appendChild(t);
    requestAnimationFrame(() => t.classList.add('on'));
    setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 300); }, ms || 4600);
    while (box.children.length > 4) box.firstChild.remove();
  }

  function scheduleAuto() {
    clearInterval(autoTimer);
    if (!store.get('autoSend')) return;
    const mins = Math.max(2, +store.get('autoSendMinutes') || 10);
    autoTimer = setInterval(() => {
      if (hasAnything()) {
        // in auto mode prefer the relay (no pop-up needed) and a silent postMessage
        const opened = openTabs.filter(t => t.win && !t.win.closed);
        if (opened.length) { sendToWorkDesk({}); }
        else if (store.get('relayMode') !== 'off') { pushRelay(buildPayload()); store.set('lastSentAt', new Date().toISOString()); }
        else { sendToWorkDesk({}); }
      }
    }, mins * 60000);
  }

  /* ------------------------------------------------------- settings UI */
  function openSettings() {
    if (document.getElementById('wd-set-modal')) return;
    const c = store.all();
    const m = document.createElement('div');
    m.id = 'wd-set-modal';
    m.innerHTML = `
      <div class="wd-set-scrim"></div>
      <div class="wd-set">
        <div class="wd-set-h"><b>⚡ WorkDesk Sidekick settings</b><span>v${VERSION} · ${PLATFORM}</span><button class="wd-x" id="wd-set-x">✕</button></div>
        <div class="wd-set-b">
          <label>WorkDesk board URL<input id="s-url" type="text" value="${esc(c.wdUrl)}"></label>
          <div class="wd-two">
            <label class="wd-chk"><input id="s-net" type="checkbox" ${c.captureNetwork ? 'checked' : ''}> Capture API responses</label>
            <label class="wd-chk"><input id="s-dom" type="checkbox" ${c.captureDom ? 'checked' : ''}> Capture rendered cards</label>
          </div>
          <div class="wd-hr"></div>
          <label>Relay mode
            <select id="s-relay">
              <option value="off" ${c.relayMode === 'off' ? 'selected' : ''}>Off (send by hand)</option>
              <option value="ntfy" ${c.relayMode === 'ntfy' ? 'selected' : ''}>ntfy.sh topic (free, no account)</option>
              <option value="gist" ${c.relayMode === 'gist' ? 'selected' : ''}>GitHub Gist (needs a token)</option>
            </select></label>
          <label id="s-target-l">Relay target <small id="s-hint">ntfy topic = any random word, e.g. <b>tundra-mango-77</b></small>
            <input id="s-target" type="text" value="${esc(c.relayTarget)}" placeholder="topic or gist id"></label>
          <label id="s-token-l" style="${c.relayMode === 'gist' ? '' : 'display:none'}">Gist token <small>fine-grained PAT with <b>gist</b> scope only. Stored in this browser, never committed.</small>
            <input id="s-token" type="password" value="${esc(c.relayToken)}" autocomplete="off"></label>
          <div class="wd-hr"></div>
          <label>Your pitch template <small>used by the "⚡ Fill my pitch" button on apply forms. Tokens like {company} are NOT expanded here — paste the finished text, or let WorkDesk copy it for you.</small>
            <textarea id="s-pitch" rows="6">${esc(c.pitchTemplate)}</textarea></label>
          <div class="wd-hr"></div>
          <label>Learned card selector <small>set by "Teach page". Clear it to go back to auto-detection.</small>
            <input id="s-sel" type="text" value="${esc(c.taughtSelector)}"></label>
          <div class="wd-two">
            <label>Max orders kept<input id="s-max" type="number" min="20" max="2000" value="${c.maxOrders}"></label>
            <label>Auto-send every (min)<input id="s-mins" type="number" min="2" max="240" value="${c.autoSendMinutes}"></label>
          </div>
          <div class="wd-note">
            <b>What this script can see:</b> the JSON your browser already received, and the text already rendered on the page.
            <b>What it never touches:</b> your password field, cookies, or any submit button. Nothing is sent anywhere
            until you press Send, Copy code, or turn on auto-send/relay.
          </div>
        </div>
        <div class="wd-set-f">
          <button class="wd-btn" id="s-clear">Clear captures</button>
          <button class="wd-btn" id="s-reset">Reset settings</button>
          <button class="wd-btn" id="s-test">Test relay</button>
          <button class="wd-btn wd-primary" id="s-save">Save</button>
        </div>
      </div>`;
    document.documentElement.appendChild(m);

    const $ = id => document.getElementById(id);
    $('wd-set-x').onclick = () => m.remove();
    m.querySelector('.wd-set-scrim').onclick = () => m.remove();
    $('s-relay').onchange = () => {
      $('s-token-l').style.display = $('s-relay').value === 'gist' ? '' : 'none';
      $('s-hint').innerHTML = $('s-relay').value === 'gist'
        ? 'the gist id from its URL — the gist must be <b>secret</b> or <b>public</b>, and WorkDesk needs the same id'
        : 'ntfy topic = any random word, e.g. <b>tundra-mango-77</b>';
    };
    $('s-save').onclick = () => {
      store.set('wdUrl', $('s-url').value.trim());
      store.set('captureNetwork', $('s-net').checked);
      store.set('captureDom', $('s-dom').checked);
      store.set('relayMode', $('s-relay').value);
      store.set('relayTarget', $('s-target').value.trim());
      store.set('relayToken', $('s-token').value.trim());
      store.set('pitchTemplate', $('s-pitch').value);
      store.set('taughtSelector', $('s-sel').value.trim());
      store.set('maxOrders', Math.max(20, +$('s-max').value || 400));
      store.set('autoSendMinutes', Math.max(2, +$('s-mins').value || 10));
      Object.assign(CFG, store.all());
      domHarvest.items = []; domHarvest.seen = new Set();
      scheduleAuto(); renderHud(); m.remove();
      toast('Settings saved — reload the page if you changed capture options', 'ok');
    };
    $('s-clear').onclick = () => {
      captures.map.clear(); captures.order = []; captures.bytes = 0;
      domHarvest.items = []; domHarvest.seen = new Set();
      renderHud(); toast('Captures cleared', 'info');
    };
    $('s-reset').onclick = () => {
      Object.keys(DEFAULTS).forEach(k => store.set(k, DEFAULTS[k]));
      location.reload();
    };
    $('s-test').onclick = async () => {
      store.set('relayMode', $('s-relay').value);
      store.set('relayTarget', $('s-target').value.trim());
      store.set('relayToken', $('s-token').value.trim());
      toast('Testing relay…', 'info');
      await pushRelay({ workdesk: 1, sidekick: VERSION, platform: PLATFORM, test: true, captured_at: new Date().toISOString(), nets: [], doms: [] });
    };
    $('s-relay').onchange();
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* -------------------------------------------------------------- style */
  function addStyles() {
    const css = `
#wd-hud{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:236px;
  font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:13px;
  background:#171d27;border:1px solid #2c3648;border-radius:12px;
  box-shadow:0 18px 44px -14px #000c;color:#e8edf5;overflow:hidden;transition:.2s}
#wd-hud.collapsed{width:auto}
#wd-hud.collapsed .wd-hud-body{display:none}
.wd-hud-head{display:flex;align-items:center;gap:6px;padding:8px 10px;background:linear-gradient(180deg,#20283a,#171d27);
  cursor:grab;user-select:none;border-bottom:1px solid #2c3648}
.wd-bolt{color:#ffb020;font-size:15px;filter:drop-shadow(0 0 8px #ffb02066)}
.wd-name{font-weight:800;letter-spacing:.02em}
.wd-plat{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;background:#ffffff14;padding:1px 5px;border-radius:4px;color:#a7b3c6}
.wd-count{margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-weight:800;font-size:15px;color:#6f7d92}
#wd-hud.has-data .wd-count{color:#4dd4ac}
.wd-x{background:none;border:0;color:#6f7d92;cursor:pointer;font-size:14px;padding:1px 4px;border-radius:4px}
.wd-x:hover{color:#ff6b6b;background:#ffffff0d}
.wd-hud-body{padding:9px 10px 10px}
.wd-meta{font-size:11px;color:#8b98ab;line-height:1.4;margin-bottom:8px;min-height:30px}
.wd-btn{width:100%;background:#212a39;border:1px solid #2c3648;color:#e8edf5;border-radius:8px;
  padding:7px 9px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit}
.wd-btn:hover{border-color:#41506a;background:#2a3444}
.wd-btn.wd-primary{background:linear-gradient(180deg,#ffb020,#e08c00);color:#1a1200;border-color:#a86a00;font-weight:800;margin-bottom:6px}
.wd-btn.wd-primary:hover{background:linear-gradient(180deg,#ffcf6b,#f09c00)}
.wd-row{display:flex;gap:6px;margin-bottom:6px}
.wd-auto{display:flex;align-items:center;gap:5px;font-size:11px;color:#8b98ab;margin-top:2px}
.wd-auto input[type=checkbox]{accent-color:#ffb020;margin:0}
.wd-auto input[type=number]{width:46px;background:#0e1116;border:1px solid #2c3648;color:#e8edf5;
  border-radius:5px;padding:2px 4px;font-size:11px;font-family:ui-monospace,Menlo,monospace}
.wd-toastbox{position:absolute;left:10px;right:10px;bottom:calc(100% + 8px);display:flex;flex-direction:column;gap:6px;pointer-events:none}
#wd-hud{position:fixed}
.wd-toast{background:#0e1116f2;border:1px solid #2c3648;border-left:3px solid #7aa2ff;border-radius:8px;
  padding:8px 10px;font-size:12px;line-height:1.4;box-shadow:0 10px 26px -10px #000;opacity:0;transform:translateY(8px);transition:.28s}
.wd-toast.on{opacity:1;transform:none}
.wd-toast.ok{border-left-color:#4dd4ac} .wd-toast.warn{border-left-color:#ffb020} .wd-toast.err{border-left-color:#ff6b6b}

.wd-fill{background:linear-gradient(180deg,#ffb020,#e08c00)!important;color:#1a1200!important;
  border:1px solid #a86a00!important;border-radius:7px!important;padding:5px 10px!important;
  font-size:12px!important;font-weight:800!important;cursor:pointer!important;margin:6px 4px 0 0!important;
  display:inline-block!important;font-family:ui-sans-serif,system-ui,sans-serif!important}
.wd-fill:hover{filter:brightness(1.1)}

body.wd-teach *{cursor:crosshair!important}
body.wd-teach .wd-teach-hl{outline:3px solid #ffb020!important;outline-offset:2px!important;background:#ffb02018!important}
#wd-teach-tip{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483600;
  background:#241d0e;border:1px solid #ffb020;color:#ffe6b0;padding:10px 16px;border-radius:10px;
  font-size:13.5px;font-family:ui-sans-serif,system-ui,sans-serif;box-shadow:0 16px 40px -12px #000;max-width:90vw}
#wd-teach-tip button{margin-left:10px;background:#ffb020;color:#1a1200;border:0;border-radius:6px;padding:3px 10px;cursor:pointer;font-weight:700}

#wd-set-modal{position:fixed;inset:0;z-index:2147483500;display:flex;align-items:center;justify-content:center;padding:18px;
  font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
#wd-set-modal .wd-set-scrim{position:absolute;inset:0;background:#000c;backdrop-filter:blur(3px)}
#wd-set-modal .wd-set{position:relative;width:100%;max-width:560px;max-height:92vh;display:flex;flex-direction:column;
  background:#0e1116;border:1px solid #2c3648;border-radius:14px;box-shadow:0 40px 90px -20px #000;color:#e8edf5}
#wd-set-modal .wd-set-h{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #2c3648;background:#171d27}
#wd-set-modal .wd-set-h b{font-size:15px}
#wd-set-modal .wd-set-h span{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#6f7d92;margin-left:auto}
#wd-set-modal .wd-set-b{padding:14px 16px;overflow-y:auto}
#wd-set-modal label{display:flex;flex-direction:column;gap:4px;margin-bottom:11px;font-size:11.5px;
  text-transform:uppercase;letter-spacing:.07em;color:#8b98ab;font-weight:600}
#wd-set-modal input[type=text],#wd-set-modal input[type=password],#wd-set-modal input[type=number],
#wd-set-modal select,#wd-set-modal textarea{background:#171d27;border:1px solid #2c3648;color:#e8edf5;
  border-radius:8px;padding:8px 10px;font-size:13.5px;font-family:ui-monospace,Menlo,monospace;outline:0;width:100%;text-transform:none;letter-spacing:0}
#wd-set-modal textarea{font-family:ui-monospace,Menlo,monospace;font-size:12px;resize:vertical;line-height:1.5}
#wd-set-modal input:focus,#wd-set-modal textarea:focus,#wd-set-modal select:focus{border-color:#4a5c7a}
#wd-set-modal small{text-transform:none;letter-spacing:0;font-weight:400;color:#6f7d92;font-size:11px;line-height:1.4}
#wd-set-modal .wd-two{display:grid;grid-template-columns:1fr 1fr;gap:11px}
#wd-set-modal .wd-chk{flex-direction:row;align-items:center;gap:7px;text-transform:none;letter-spacing:0;font-size:12.5px;color:#a7b3c6}
#wd-set-modal .wd-chk input{width:16px;height:16px;accent-color:#ffb020}
#wd-set-modal .wd-hr{border-top:1px solid #2c3648;margin:14px 0}
#wd-set-modal .wd-note{background:#171d27;border:1px solid #2c3648;border-left:3px solid #ffb020;border-radius:9px;
  padding:11px 13px;font-size:12px;color:#a7b3c6;line-height:1.55;text-transform:none;letter-spacing:0;font-weight:400}
#wd-set-modal .wd-set-f{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #2c3648;background:#171d27;flex-wrap:wrap;justify-content:flex-end}
#wd-set-modal .wd-set-f .wd-btn{width:auto}
`;
    if (typeof GM_addStyle === 'function') { GM_addStyle(css); return; }
    const s = document.createElement('style'); s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------------------------------------------------------- commands */
  function menuCommands() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand('⚡ Send captures to WorkDesk', () => sendToWorkDesk({ alsoPushRelay: true }));
    GM_registerMenuCommand('📋 Copy sync code', copySyncCode);
    GM_registerMenuCommand('🎯 Teach me the page', teachMode);
    GM_registerMenuCommand('⚙️ Sidekick settings', openSettings);
    GM_registerMenuCommand('🗑 Clear captures', () => { captures.map.clear(); captures.order = []; captures.bytes = 0; domHarvest.items = []; domHarvest.seen = new Set(); renderHud(); toast('Cleared', 'info'); });
    GM_registerMenuCommand('📖 Open my WorkDesk board', () => window.open(wdUrl(), '_blank'));
  }

  /* -------------------------------------------------------------- boot */
  function start() {
    addStyles();
    hookNetwork();
    const ready = () => {
      buildHud();
      renderHud();
      menuCommands();
      injectFillButtons();
      setInterval(domCapture, 2200);
      // SPA navigation: re-scan after history changes
      ['pushState', 'replaceState'].forEach(k => {
        const orig = history[k];
        history[k] = function () { const r = orig.apply(this, arguments); setTimeout(domCapture, 1400); return r; };
      });
      window.addEventListener('popstate', () => setTimeout(domCapture, 900));
      setTimeout(() => {
        if (!hasAnything()) {
          toast('Sidekick is running on ' + PLATFORM + '. Open your work search / available listings page and it will start counting.', 'info', 9000);
        }
      }, 2600);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
    else ready();
  }

  start();
})();
