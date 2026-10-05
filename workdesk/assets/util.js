/* ============================================================================
   WorkDesk — util.js
   Tiny dependency-free toolkit: DOM, formatting, dates, distance, encoding,
   toasts, and the modal/pop-up system the guided setup is built on.
   Everything here is browser-only stdlib. No build step, no CDN, no tracking.
   ========================================================================== */
(function (global) {
  'use strict';

  const WD = (global.WorkDesk = global.WorkDesk || {});
  WD.VERSION = '1.0.0';
  WD.SCHEMA  = 'workdesk.order.v1';

  /* ------------------------------------------------------------------ DOM */
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : kids ? [kids] : []).forEach(k => {
      if (k === null || k === undefined || k === false) return;
      n.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    });
    return n;
  }

  function on(root, sel, ev, fn, opts) {
    root.addEventListener(ev, e => {
      const t = e.target.closest && e.target.closest(sel);
      if (t && root.contains(t)) fn(e, t);
    }, opts);
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ------------------------------------------------------------- strings */
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function initials(s) {
    return String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  }

  function truncate(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  }

  /* --------------------------------------------------------------- money */
  const money = (n, digits) => (n === null || n === undefined || isNaN(n))
    ? '—'
    : '$' + Number(n).toLocaleString('en-US', {
        minimumFractionDigits: digits == null ? (Number(n) >= 1000 ? 0 : (Number.isInteger(Number(n)) ? 0 : 2)) : digits,
        maximumFractionDigits: digits == null ? 2 : digits
      });

  const compactMoney = n => {
    if (n === null || n === undefined || isNaN(n)) return '—';
    n = Number(n);
    if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return '$' + Math.round(n);
  };

  /* --------------------------------------------------------------- dates */
  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') {
      // seconds vs milliseconds
      const d = new Date(v < 1e12 ? v * 1000 : v);
      return isNaN(d) ? null : d;
    }
    let s = String(v).trim();
    if (!s) return null;
    // "07/15/2026" or "07/15/26"
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let y = +m[3]; if (y < 100) y += y > 60 ? 1900 : 2000;
      const d = new Date(y, +m[1] - 1, +m[2]);
      return isNaN(d) ? null : d;
    }
    // "Jul 15, 2026 9:00 AM" / ISO / anything Date can chew on
    const d = new Date(s);
    if (!isNaN(d)) {
      // "Jul 15" with no year makes JS pick 2001. Re-anchor to the current
      // year, rolling forward when that would already be well in the past.
      if (!/(19|20)\d{2}/.test(s)) return reanchorYear(d);
      return d;
    }
    // "2026-07-15 09:00:00" (Field Nation sandbox style, no TZ)
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    return null;
  }

  function reanchorYear(d) {
    // "Jul 20" with no year: JS picks 2001, which is nonsense on a gig board.
    // Use the CURRENT year and do NOT roll forward — if that lands in the past,
    // the listing really is stale, and the ranking says so instead of
    // inventing a job twelve months away.
    const now = new Date();
    const out = new Date(now.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
    return isNaN(out) ? d : out;
  }

  // s = whole seconds, always positive
  function durLabel(s) {
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 604800) return Math.floor(s / 86400) + 'd';
    if (s < 2592000) return Math.floor(s / 604800) + 'w';
    return Math.floor(s / 2592000) + 'mo';
  }

  function ago(v) {
    const d = parseDate(v); if (!d) return '';
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    // A future date used to recurse into ago() with a synthesized timestamp —
    // which parsed as still-in-the-future, forever: RangeError on every open
    // work order. Format both directions from the same delta instead.
    if (s < 0) return 'in ' + durLabel(-s);
    if (s < 2592000) return durLabel(s) + ' ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function dayLabel(v) {
    const d = parseDate(v); if (!d) return '—';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
    const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (diff === 0) return 'Today ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (diff === 1) return 'Tomorrow ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff < 7) return wd + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return md + (d.getFullYear() !== today.getFullYear() ? ', ' + d.getFullYear() : '');
  }

  const iso = d => (d instanceof Date ? d : parseDate(d))?.toISOString?.() || null;

  function hoursBetween(a, b) {
    const da = parseDate(a), db = parseDate(b);
    if (!da || !db) return null;
    const h = (db - da) / 3600000;
    return h >= 0 ? h : null;
  }

  /* ----------------------------------------------------------------- geo */
  function haversineMiles(a, b) {
    if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
    const R = 3958.8, toR = x => x * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  // straight-line miles -> realistic highway miles (empirical factor)
  const roadMiles = mi => (mi == null ? null : mi * 1.22);
  // average rural/interstate mix ~ 42 mph door to door incl. the last mile
  const driveMinutes = mi => (mi == null ? null : Math.round((mi / 42) * 60));

  function distLabel(mi) {
    if (mi == null) return null;
    if (mi < 10) return mi.toFixed(1) + ' mi';
    return Math.round(mi) + ' mi';
  }

  /* --------------------------------------------------------- base64/gzip */
  const b64 = {
    enc(str) {
      const bytes = new TextEncoder().encode(str);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    dec(str) {
      const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
  };

  /* Compression is an optimisation, never a requirement. makeSyncCode falls
     back to plain base64 when gzip() returns null, and inflate() falls back to
     b64.dec when gunzip() throws — so a browser without the Streams API still
     hands data over, just with a longer sync code. */
  const canCompress = () => typeof CompressionStream !== 'undefined' &&
    typeof Response !== 'undefined' && typeof Blob !== 'undefined' &&
    typeof Blob.prototype.stream === 'function';
  const canDecompress = () => typeof DecompressionStream !== 'undefined' &&
    typeof Response !== 'undefined' && typeof Blob !== 'undefined' &&
    typeof Blob.prototype.stream === 'function';

  async function gzip(str) {
    if (!canCompress()) return null;
    try {
      const cs = new CompressionStream('gzip');
      const buf = await new Response(new Blob([str]).stream().pipeThrough(cs)).arrayBuffer();
      let bin = ''; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return null; }
  }

  async function gunzip(str) {
    if (!canDecompress()) throw new Error('this browser cannot inflate gzip payloads');
    const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    return await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
  }

  /* -------------------------------------------------------------- toasts */
  let toastHost = null;
  function toast(msg, kind, ms) {
    toastHost = toastHost || $('#toasts');
    if (!toastHost) return;
    const t = el('div', { class: 'toast ' + (kind || 'info'), role: 'status' }, [
      el('span', { class: 'toast-x', text: '✕', onclick: e => e.target.parentElement.remove() }),
      el('div', { html: /</.test(msg) ? msg : esc(msg) })
    ]);
    toastHost.appendChild(t);
    requestAnimationFrame(() => t.classList.add('on'));
    setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 350); }, ms || 4200);
    while (toastHost.children.length > 5) toastHost.firstChild.remove();
    return t;
  }

  /* ----------------------------------------------------------- clipboard */
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      try {
        const ta = el('textarea', { class: 'offscreen' }); ta.value = text;
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy'); ta.remove(); return ok;
      } catch (__) { return false; }
    }
  }

  /* -------------------------------------------------------------- modals */
  /* The whole guided setup, every confirm, and every settings sheet runs
     through this one modal system so pop-ups behave identically everywhere. */
  const modalStack = [];

  /* The #modal-root markup in index.html is a TEMPLATE, not a modal. It is
     cloned once, held detached, and the original is removed — otherwise a hidden
     decoy with the same ids stays in the document forever. */
  let MODAL_TEMPLATE = null;
  function modalTemplate() {
    if (MODAL_TEMPLATE) return MODAL_TEMPLATE;
    const root = $('#modal-root');
    MODAL_TEMPLATE = root ? root.cloneNode(true) : buildFallbackTemplate();
    MODAL_TEMPLATE.hidden = true;
    if (root && root.parentElement) root.remove();
    return MODAL_TEMPLATE;
  }

  function buildFallbackTemplate() {
    const d = document.createElement('div');
    d.innerHTML = '<div class="modal-scrim" data-close></div>' +
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<div class="modal-head"><div class="modal-kicker" id="m-kicker"></div>' +
        '<h3 id="m-title"></h3>' +
        '<button class="btn ghost icon modal-x" data-close aria-label="Close">\u2715</button></div>' +
        '<div class="modal-body" id="m-body"></div><div class="modal-foot" id="m-foot"></div>' +
      '</div>';
    return d;
  }

  function modal(opts) {
    const o = Object.assign({
      title: '', kicker: '', body: '', foot: null, width: '', dismissable: true,
      onClose: null, onMount: null, trap: true
    }, opts || {});

    const prev = modalStack.length ? modalStack[modalStack.length - 1] : null;
    if (prev) prev.root.hidden = true;

    const host = modalTemplate().cloneNode(true);   // stackable: one live root per modal
    host.id = '';
    host.hidden = false;

    // Every clone used to keep the template's ids, so the document ended up with
    // several #m-title / #m-body elements and any global query silently hit the
    // hidden template instead of the open pop-up. Uniquify them per modal.
    const sfx = '-' + uid('m').slice(0, 6);
    $$('[id]', host).forEach(n => { n.id = n.id + sfx; });

    const titleEl  = $('.modal-head h3', host);
    const kickerEl = $('.modal-kicker', host);
    const body     = $('.modal-body', host);
    const foot     = $('.modal-foot', host);

    titleEl.textContent = o.title;
    kickerEl.textContent = o.kicker || '';
    kickerEl.hidden = !o.kicker;
    $('.modal', host).setAttribute('aria-labelledby', titleEl.id);
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    if (o.foot) (Array.isArray(o.foot) ? o.foot : [o.foot]).forEach(b => foot.appendChild(b));
    else foot.remove();
    if (o.width) $('.modal', host).style.maxWidth = o.width;
    if (!o.dismissable) $$('.modal-x,[data-close]', host).forEach(x => x.remove());

    const entry = { root: host, prev, opts: o, title: titleEl, kicker: kickerEl, body, foot };
    host.addEventListener('click', e => { if (e.target.matches('[data-close]')) closeModal(entry); });
    host.addEventListener('keydown', e => {
      if (e.key === 'Escape' && o.dismissable) { e.stopPropagation(); closeModal(entry); }
    });
    document.body.appendChild(host);
    modalStack.push(entry);
    document.body.classList.add('modal-open');

    if (o.onMount) o.onMount(host, entry);
    const f = $('button.primary, .btn.primary, input, textarea, select', host);
    if (f) setTimeout(() => f.focus(), 40);
    return entry;
  }

  function closeModal(entry) {
    const i = modalStack.indexOf(entry);
    if (i < 0) return;
    modalStack.splice(i, 1);
    entry.root.classList.add('closing');
    setTimeout(() => entry.root.remove(), 180);
    if (entry.prev) { entry.prev.root.hidden = false; }
    if (!modalStack.length) document.body.classList.remove('modal-open');
    if (entry.opts.onClose) entry.opts.onClose();
  }

  function closeAllModals() { while (modalStack.length) closeModal(modalStack[modalStack.length - 1]); }

  function confirmModal(opts) {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      const entry = modal(Object.assign({
        dismissable: true,
        onClose: () => finish(false),
        foot: [
          el('button', { class: 'btn ghost', text: opts.cancelText || 'Cancel', onclick: () => { closeModal(entry); finish(false); } }),
          el('button', { class: 'btn primary', text: opts.okText || 'Yes', onclick: () => { closeModal(entry); finish(true); } })
        ]
      }, opts, { onClose: () => finish(false) }));
    });
  }

  /* --------------------------------------------------------- URL helpers */
  function appBase() {
    // works at /, /therealwindycity/, /therealwindycity/workdesk/, or file://
    let p = location.pathname.replace(/\/[^\/]*$/, '/');
    // on file:// the origin is the string "null", which would produce
    // "nullfile:///..." — return the path alone and let it stay relative
    if (location.protocol === 'file:') return p;
    return location.origin + p;
  }
  function appUrl(rel) { return appBase() + String(rel || '').replace(/^\//, ''); }

  function qs(name, url) {
    const u = new URL(url || location.href);
    return u.searchParams.get(name);
  }

  /* -------------------------------------------------------------- misc  */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const uniq = a => Array.from(new Set(a.filter(Boolean)));

  function debounce(fn, ms) {
    let t; return function () { clearTimeout(t); const a = arguments, c = this; t = setTimeout(() => fn.apply(c, a), ms || 220); };
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // stable, fast, 32-bit string hash — used for dedupe keys and change detection
  function hash(str) {
    let h = 2166136261 >>> 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  }

  function download(filename, text, type) {
    const mime = type || 'application/json';
    // object URL first; a data: URL still works where createObjectURL doesn't
    // (very old browsers, some locked-down embedded webviews). Returns false if
    // nothing could be handed to the user, so callers can say so instead of
    // silently doing nothing.
    let href = null, revoke = false;
    try {
      if (typeof URL !== 'undefined' && URL.createObjectURL) {
        href = URL.createObjectURL(new Blob([text], { type: mime })); revoke = true;
      }
    } catch (e) { href = null; }
    if (!href) {
      try { href = 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(text); } catch (e) { return false; }
    }
    try {
      const a = el('a', { href, download: filename });
      document.body.appendChild(a); a.click();
      setTimeout(() => { if (revoke) { try { URL.revokeObjectURL(a.href); } catch (e) {} } a.remove(); }, 1500);
      return true;
    } catch (e) { return false; }
  }

  function detectEnv() {
    const p = location.protocol;
    return {
      protocol: p,
      isFile: p === 'file:',
      isPages: /\.github\.io$/i.test(location.hostname),
      isLocalhost: /^(localhost|127\.|0\.0\.0\.0|\[::1\]|.*\.e2b\.app)$/i.test(location.hostname),
      origin: location.origin,
      base: appBase(),
      indexedDB: typeof indexedDB !== 'undefined',
      compression: typeof CompressionStream !== 'undefined',
      notifications: 'Notification' in window,
      sw: 'serviceWorker' in navigator
    };
  }

  Object.assign(WD, {
    $, $$, el, on, esc, norm, initials, truncate,
    money, compactMoney, parseDate, ago, durLabel, dayLabel, iso, hoursBetween,
    haversineMiles, roadMiles, driveMinutes, distLabel,
    b64, gzip, gunzip, canCompress, canDecompress, toast, copy,
    modal, closeModal, closeAllModals, confirmModal, modalTemplate,
    appBase, appUrl, qs, sleep, clamp, uniq, debounce, uid, hash, download, detectEnv
  });
})(typeof window !== 'undefined' ? window : globalThis);
