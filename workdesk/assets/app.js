/* ============================================================================
   WorkDesk — app.js
   The board itself: feed, filters, ranking, the detail drawer, application
   tracking, notifications, keyboard, and every settings sheet.
   ========================================================================== */
(function (global) {
  'use strict';
  const WD = (global.WorkDesk = global.WorkDesk || {});
  const { $, $$, el, on, esc, toast, modal, closeModal, confirmModal, copy, money, compactMoney,
          dayLabel, ago, distLabel, truncate, debounce, iso, detectEnv } = WD;

  let SETTINGS = null;
  let ORDERS = [];
  let VIEW = [];
  let LAST_VISIT = null;
  let NOTIFIED = new Set();

  const cachedSettings = () => SETTINGS || WD.store.getSettingsSyncFallback || {};

  /* ============================================================== boot */
  async function boot() {
    const t0 = performance.now();
    const info = await WD.store.init();
    SETTINGS = info.settings;
    LAST_VISIT = await WD.store.getMeta('lastVisit', null);

    bindChrome();
    bindKeyboard();
    bindDropzone();

    // Wire the ingest listeners BEFORE anything loads, so a Sidekick handoff or
    // a postMessage that lands mid-boot still repaints the board.
    WD.bridge.listenPostMessage();
    WD.bridge.onIngested(async () => { ORDERS = await WD.store.allOrders(); rerank(); render(); refreshChrome(); });

    // ingest whatever the Sidekick handed over in the URL before first paint
    let handoff = null;
    try { handoff = await WD.bridge.readFragment(); } catch (e) { console.warn('handoff', e); }

    ORDERS = await WD.store.allOrders();
    if (handoff && handoff.ok) {
      toast('⚡ Sidekick delivered <b>' + handoff.added + '</b> new work order' + (handoff.added === 1 ? '' : 's') +
            ' (' + handoff.updated + ' refreshed)', 'ok', 6000);
    }
    let seededSample = false;
    if (!ORDERS.length) {
      // first run: load the sample board so nothing looks broken
      await loadSample(true);
      seededSample = true;
    }
    const committed = await WD.bridge.pullCommittedFeed().catch(() => null);
    // loadSample() and pullCommittedFeed() both write straight into the store.
    // ORDERS was captured above, so it must be re-read here or the very first
    // paint shows an empty board even though 24 sample orders are on disk.
    if (seededSample || (committed && committed.added)) ORDERS = await WD.store.allOrders();

    await WD.store.setMeta('lastVisit', iso(new Date()));
    if (SETTINGS.relay && SETTINGS.relay.mode !== 'off') {
      WD.bridge.pullRelay(SETTINGS).then(r => { if (r && r.ok && r.added) { toast(r.added + ' new from the relay', 'ok'); reload(); } }).catch(() => {});
      startRelayTimer();
    }

    rerank();
    render();
    refreshChrome();
    $('#boot-splash').classList.add('gone');
    setTimeout(() => { const b = $('#boot-splash'); b && b.remove(); }, 700);
    WD.wizard.resume();
    await WD.store.addLog('boot', { ms: Math.round(performance.now() - t0), orders: ORDERS.length, backend: info.mode });
    console.log('[WorkDesk] ready in ' + Math.round(performance.now() - t0) + 'ms · ' + ORDERS.length + ' orders · storage=' + info.mode);
  }

  /* ======================================================= data plumbing */
  function profile() { return WD.profileOf(SETTINGS); }

  function rerank() {
    const hist = WD.store.buildBuyerHistory(ORDERS);
    VIEW = WD.rankAll(ORDERS.slice(), profile(), hist);
  }

  async function reload() {
    ORDERS = await WD.store.allOrders();
    rerank(); render(); refreshChrome();
  }

  async function getSettings() {
    SETTINGS = await WD.store.getSettings();
    return SETTINGS;
  }

  function newSince() {
    if (!LAST_VISIT) return VIEW.filter(o => o.my && o.my.state === 'open');
    return VIEW.filter(o => (o.harvest && o.harvest.first_seen > LAST_VISIT) || (o.captured_at > LAST_VISIT));
  }

  function stateBucket(o) { return (o.my && o.my.state) || 'open'; }

  function filtered() {
    const f = SETTINGS.filters, ui = SETTINGS.ui;
    const p = profile();
    const q = WD.norm(ui.q || '');
    const must = WD.norm(f.must || '').split(' ').filter(Boolean);
    const not  = WD.norm(f.not || '').split(' ').filter(Boolean).concat((p.blockedKeywords || []).map(k => WD.norm(k))).filter(Boolean);
    const fresh = newSince().map(o => o.dedupe);
    const freshSet = new Set(fresh);
    const now = Date.now();

    return VIEW.filter(o => {
      const st = stateBucket(o);
      // tab gating
      if (ui.tab === 'available' && st !== 'open' && st !== 'saved') return false;
      if (ui.tab === 'available' && f.hideHandled && (st === 'applied' || st === 'ignored')) return false;
      if (ui.tab === 'new' && !(st === 'open' && freshSet.has(o.dedupe))) return false;
      if (ui.tab === 'saved' && st !== 'saved') return false;
      if (ui.tab === 'applied' && st !== 'applied') return false;
      if (ui.tab === 'outcomes' && st !== 'won' && st !== 'lost') return false;
      if (ui.tab === 'ignored' && st !== 'ignored') return false;
      if (ui.tab === 'available' && f.freshOnly && !freshSet.has(o.dedupe)) return false;

      if (ui.platform !== 'all' && o.platform !== ui.platform) return false;

      if (f.minPay) {
        const amt = o.pay && o.pay.amount;
        if (amt == null) return false;
        if (o.pay.type === 'hourly' ? amt < f.minPay : amt < f.minPay) return false;
      }
      if (f.maxDist != null && f.maxDist !== '') {
        if (o.distance_mi == null) return false;
        if (o.distance_mi > f.maxDist) return false;
      }
      if (f.when && f.when !== 'any') {
        const s = o.start ? new Date(o.start) : null;
        if (!s) return false;
        const days = (s - now) / 86400000;
        if (f.when === 'today' && !(days >= -0.5 && days < 1)) return false;
        if (f.when === '3d' && !(days < 3)) return false;
        if (f.when === '7d' && !(days < 7)) return false;
        if (f.when === '14d' && !(days < 14)) return false;
        if (f.when === '30d' && !(days < 30)) return false;
        if (f.when === 'weekend' && ![0, 5, 6].includes(s.getDay())) return false;
      }
      if (must.length) {
        const hay = blobOf(o);
        if (!must.every(m => hay.includes(m))) return false;
      }
      if (not.length) {
        const hay = blobOf(o);
        if (not.some(n => n && hay.includes(n))) return false;
      }
      if (q) {
        const hay = blobOf(o);
        if (!q.split(' ').every(term => hay.includes(term))) return false;
      }
      return true;
    });
  }

  function blobOf(o) {
    if (o.__blob) return o.__blob;
    o.__blob = WD.norm([o.title, o.company, o.city, o.state, o.zip, o.description,
      (o.work_types || []).join(' '), (o.skills || []).join(' '), (o.requirements || []).join(' '),
      o.pay && o.pay.raw, o.id].join(' '));
    return o.__blob;
  }

  function sorted(rows) {
    const s = SETTINGS.ui.sort;
    const r = rows.slice();
    if (s === 'hourly') r.sort((a, b) => effHourly(b) - effHourly(a));
    else if (s === 'pay') r.sort((a, b) => (b.pay && b.pay.amount || 0) - (a.pay && a.pay.amount || 0));
    else if (s === 'dist') r.sort((a, b) => (a.distance_mi == null ? 1e9 : a.distance_mi) - (b.distance_mi == null ? 1e9 : b.distance_mi));
    else if (s === 'fresh') r.sort((a, b) => String(b.posted_at || b.captured_at || '').localeCompare(String(a.posted_at || a.captured_at || '')));
    else if (s === 'start') r.sort((a, b) => String(a.start || '9999').localeCompare(String(b.start || '9999')));
    else r.sort((a, b) => b.rank.score - a.rank.score);
    return r;
  }

  function effHourly(o) {
    if (o.rank && o.rank.netHourly) return o.rank.netHourly.net;
    if (o.hourly) return o.hourly;
    if (o.pay && o.pay.amount != null) return o.pay.amount / (profile().defaultJobHours || 3);
    return -1;
  }

  /* ============================================================ render */
  function render() {
    const rows = sorted(filtered());
    const feed = $('#feed');
    feed.innerHTML = '';
    renderBanners(rows);
    updateCounts();

    if (!rows.length) { feed.appendChild(emptyState()); return; }

    const list = el('div', { class: 'cards ' + (SETTINGS.ui.density === 'dense' ? 'dense' : '') });
    rows.slice(0, 400).forEach((o, i) => list.appendChild(card(o, i)));
    feed.appendChild(list);
    if (rows.length > 400) feed.appendChild(el('div', { class: 'more', text: 'Showing the top 400 of ' + rows.length + ' — tighten a filter to see the rest.' }));
    $('#foot-status').textContent = rows.length + ' of ' + ORDERS.length + ' orders shown · ' +
      uniqPlat(rows) + ' · ranked ' + SETTINGS.ui.sort;
  }

  function uniqPlat(rows) {
    const s = WD.uniq(rows.map(r => r.platform === 'fieldnation' ? 'Field Nation' : r.platform === 'workmarket' ? 'WorkMarket' : 'unmapped'));
    return s.join(' + ');
  }

  function card(o, i) {
    const r = o.rank, p = profile();
    const st = stateBucket(o);
    const hourly = r.netHourly;
    const c = el('article', {
      class: 'card ' + r.label + (st !== 'open' ? ' is-' + st : '') + (isNew(o) ? ' is-new' : ''),
      dataset: { id: o.dedupe }, tabindex: '0', role: 'button',
      'aria-label': (o.title || 'untitled') + ', ' + (o.company || 'unknown company') + ', score ' + r.score
    });

    c.appendChild(el('div', { class: 'card-score ' + r.label, title: 'WorkScore ' + r.score + '/100 — ' + r.label }, [
      el('b', { text: String(r.score) }),
      el('span', { text: r.label })
    ]));

    const main = el('div', { class: 'card-main' });
    main.appendChild(el('div', { class: 'card-top' }, [
      el('span', { class: 'plat ' + o.platform, text: o.platform === 'fieldnation' ? 'FIELD NATION' : o.platform === 'workmarket' ? 'WORKMARKET' : 'UNMAPPED' }),
      o.company ? el('span', { class: 'co', text: o.company }) : null,
      isNew(o) ? el('span', { class: 'newbadge', text: 'NEW' }) : null,
      st !== 'open' ? el('span', { class: 'statebadge ' + st, text: st.toUpperCase() }) : null,
      o.geo_precision === 'state' ? el('span', { class: 'warnbadge', title: 'Location resolved only to a state centroid — distance is rough', text: '≈ dist' }) : null
    ].filter(Boolean)));

    main.appendChild(el('h3', { class: 'card-title', text: o.title || '(no title posted)' }));
    main.appendChild(el('div', { class: 'card-meta' }, [
      metaChip('📍', [o.city, o.state].filter(Boolean).join(', ') || 'location unknown', o.address1 || ''),
      o.distance_mi != null ? metaChip('🚗', distLabel(o.distance_mi) + (o.drive_min ? ' · ~' + fmtMin(o.drive_min) : ''), 'From ' + (p.home.label || 'your base')) : null,
      o.start ? metaChip('🗓', dayLabel(o.start), o.end ? 'window ends ' + dayLabel(o.end) : '') : null,
      o.posted_at || o.captured_at ? metaChip('🕒', 'posted ' + ago(o.posted_at || o.captured_at), '') : null,
      (o.work_types && o.work_types.length) ? metaChip('🏷', truncate(o.work_types.slice(0, 3).join(', '), 34), o.work_types.join(', ')) : null
    ].filter(Boolean)));

    const payLine = el('div', { class: 'card-pay' });
    if (o.pay && o.pay.amount != null) {
      payLine.appendChild(el('span', { class: 'pay-big', text: money(o.pay.amount) + (o.pay.type === 'hourly' ? '/hr' : o.pay.type === 'per_unit' ? ' /' + (o.pay.unit_label || 'unit') : '') }));
      if (hourly) payLine.appendChild(el('span', { class: 'pay-hr', title: hourly.gross !== hourly.net ? 'gross ' + money(hourly.gross, 0) + '/hr less ' + Math.round(hourly.fee * 100) + '% platform fee' : 'stated hourly rate' },
        '≈ ' + money(hourly.net, 0) + '/hr net'));
      else payLine.appendChild(el('span', { class: 'pay-hr muted', title: 'No window or duration posted, so $/hr can\'t be derived', text: '$/hr unknown' }));
      if (o.pay.units > 1) payLine.appendChild(el('span', { class: 'pay-units', text: '× ' + o.pay.units + ' techs' }));
      if (o.pay.raw && o.pay.raw !== String(o.pay.amount)) payLine.appendChild(el('span', { class: 'pay-raw', title: 'Exactly as posted', text: '“' + truncate(o.pay.raw, 40) + '”' }));
    } else {
      payLine.appendChild(el('span', { class: 'pay-none', text: 'no pay posted' }));
    }
    main.appendChild(payLine);

    if (SETTINGS.ui.showExplain && r) {
      main.appendChild(el('div', { class: 'card-why', text: WD.explain(r, o, p) || '—' }));
      if (r.flags && r.flags.length) main.appendChild(el('div', { class: 'card-flags' }, r.flags.slice(0, 3).map(f => el('span', { class: 'flag', text: f }))));
    }
    if (o.description) main.appendChild(el('p', { class: 'card-desc', text: truncate(o.description, SETTINGS.ui.density === 'dense' ? 90 : 190) }));

    const acts = el('div', { class: 'card-acts' }, [
      el('button', { class: 'btn primary sm', text: st === 'applied' ? '✓ Applied' : 'Apply', dataset: { act: 'apply', id: o.dedupe }, disabled: st === 'applied' }),
      el('button', { class: 'btn ghost sm', text: 'Details', dataset: { act: 'open', id: o.dedupe } }),
      el('button', { class: 'btn ghost sm icon', title: 'Save for later', text: st === 'saved' ? '★' : '☆', dataset: { act: 'save', id: o.dedupe } }),
      el('button', { class: 'btn ghost sm icon', title: 'Hide this one', text: '⌫', dataset: { act: 'ignore', id: o.dedupe } })
    ]);
    main.appendChild(acts);

    c.appendChild(main);
    c.addEventListener('click', e => {
      if (e.target.closest('[data-act]')) return;
      openDrawer(o.dedupe);
    });
    c.addEventListener('keydown', e => { if (e.key === 'Enter') openDrawer(o.dedupe); });
    return c;
  }

  function metaChip(icon, text, title) {
    return el('span', { class: 'chip', title: title || text }, [el('i', { text: icon }), el('span', { text })]);
  }
  const fmtMin = m => m >= 60 ? (Math.floor(m / 60) + 'h' + (m % 60 >= 15 ? ' ' + (m % 60) + 'm' : '')) : m + ' min';
  function isNew(o) {
    if (!LAST_VISIT) return false;
    const t = (o.harvest && o.harvest.first_seen) || o.captured_at;
    return t && t > LAST_VISIT;
  }

  function emptyState() {
    const total = ORDERS.length;
    const wrap = el('div', { class: 'empty-state' });
    if (!total) {
      wrap.innerHTML = `<div class="es-mark">⚡</div>
        <h3>Your board is empty</h3>
        <p>WorkDesk has nothing to rank yet. The fastest way to fix that is the Sidekick.</p>`;
      wrap.appendChild(el('div', { class: 'wz-row' }, [
        el('button', { class: 'btn primary', text: '🧭 Open guided setup', onclick: () => WD.wizard.open(0) }),
        el('button', { class: 'btn', text: 'Install the Sidekick', onclick: () => WD.wizard.open('sidekick') }),
        el('button', { class: 'btn ghost', text: 'Import a file / paste listings', onclick: () => openSettings('import') }),
        el('button', { class: 'btn ghost', text: '🧪 Load the sample board', onclick: async () => { await loadSample(); reload(); } })
      ]));
    } else {
      wrap.innerHTML = `<div class="es-mark">🔍</div>
        <h3>Nothing matches</h3>
        <p>${total} orders are on the board but every one is filtered out.</p>`;
      wrap.appendChild(el('div', { class: 'wz-row' }, [
        el('button', { class: 'btn primary', text: 'Clear all filters', onclick: () => resetFilters() }),
        el('button', { class: 'btn ghost', text: 'Show every tab', onclick: () => { SETTINGS.filters.hideHandled = false; SETTINGS.filters.freshOnly = false; persist(); goTab('available'); } })
      ]));
    }
    return wrap;
  }

  function renderBanners(rows) {
    const strip = $('#banner-strip');
    strip.innerHTML = '';
    const add = (kind, html, actions) => {
      const b = el('div', { class: 'banner ' + kind });
      b.appendChild(el('div', { html }));
      if (actions) b.appendChild(el('div', { class: 'wz-row' }, actions));
      strip.appendChild(b);
    };

    const fn = ORDERS.filter(o => o.platform === 'fieldnation').length;
    const wm = ORDERS.filter(o => o.platform === 'workmarket').length;
    const unmapped = ORDERS.filter(o => o.platform === 'unknown').length;

    if (unmapped > 0) add('warn',
      `<b>${unmapped} order${unmapped > 1 ? 's' : ''} could not be matched to a platform.</b> They still rank and you can still apply, but the deep link may go to the wrong site. Open one → <b>Diagnostics</b> in the drawer to see the raw fields.`,
      [el('button', { class: 'btn ghost sm', text: 'Show me how to fix it', onclick: () => advanceModalFromBanner('unmapped platform') })]);

    if (ORDERS.length && !fn && !wm) add('info',
      '<b>No platform recognized yet.</b> If these came from an import, tag them in the drawer so deep links work.');

    const stale = staleHours();
    if (ORDERS.length && stale != null && stale > 6) add('warn',
      `<b>Your board is ${Math.round(stale)}h old.</b> Gig work goes fast — a listing this old is probably gone. Re-send from the Sidekick.`,
      [el('button', { class: 'btn ghost sm', text: 'How do I refresh?', onclick: () => WD.wizard.open('sidekick') })]);

    const underFloor = rows.filter(o => o.rank && o.rank.netHourly && o.rank.netHourly.net < profile().payFloorHourly).length;
    if (underFloor > 0 && rows.length > 3) add('info',
      `<b>${underFloor} of these ${rows.length} pay under your $${profile().payFloorHourly}/hr floor.</b> They're shown because you haven't set a minimum pay filter — the ranking already pushes them down.`);
  }

  function staleHours() {
    const t = ORDERS.map(o => o.harvest && o.harvest.last_seen || o.captured_at).filter(Boolean).sort().pop();
    if (!t) return null;
    return (Date.now() - new Date(t).getTime()) / 3600000;
  }

  function advanceModalFromBanner(topic) {
    WD.wizard.advanceModal(topic, 'Banner: ' + topic);
  }

  function updateCounts() {
    const c = k => ORDERS.filter(o => stateBucket(o) === k).length;
    $('#c-available').textContent = ORDERS.filter(o => ['open', 'saved'].includes(stateBucket(o))).length;
    $('#c-new').textContent = newSince().length;
    $('#c-saved').textContent = c('saved');
    $('#c-applied').textContent = c('applied');
    $('#c-outcomes').textContent = c('won') + c('lost');
    $('#c-ignored').textContent = c('ignored');

    const t = k => $('#topstats .tstat[data-k="' + k + '"] b');
    t('new').textContent = newSince().length;
    t('available').textContent = ORDERS.filter(o => stateBucket(o) === 'open').length;
    t('applied').textContent = c('applied');
    const pipeline = ORDERS.filter(o => stateBucket(o) === 'applied')
      .reduce((s, o) => s + (o.pay && o.pay.amount != null ? (o.pay.type === 'hourly' ? o.pay.amount * (profile().defaultJobHours || 3) : o.pay.amount) : 0), 0);
    t('pipeline').textContent = compactMoney(pipeline);
    $('#foot-version').textContent = 'WorkDesk ' + WD.VERSION;
  }

  function refreshChrome() {
    if (!SETTINGS) return;
    WD.wizard && $('#setup-pill') && setSetupPill(WD.wizard.progress(SETTINGS));
    $$('#platform-seg button').forEach(b => b.classList.toggle('on', b.dataset.p === SETTINGS.ui.platform));
    $$('#sort-seg button').forEach(b => b.classList.toggle('on', b.dataset.s === SETTINGS.ui.sort));
    $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === SETTINGS.ui.tab));
    $('#q').value = SETTINGS.ui.q || '';
    $('#q-clear').hidden = !SETTINGS.ui.q;
    $('#f-minpay').value = SETTINGS.filters.minPay == null ? '' : SETTINGS.filters.minPay;
    $('#f-maxdist').value = SETTINGS.filters.maxDist == null ? '' : SETTINGS.filters.maxDist;
    $('#f-when').value = SETTINGS.filters.when || 'any';
    $('#f-must').value = SETTINGS.filters.must || '';
    $('#f-not').value = SETTINGS.filters.not || '';
    $('#f-fresh').checked = !!SETTINGS.filters.freshOnly;
    $('#f-open').checked = SETTINGS.filters.hideHandled !== false;
    $('#btn-notifications').classList.toggle('on', !!(SETTINGS.notifications && SETTINGS.notifications.enabled));
    updateCounts();
  }

  function setSetupPill(pct) {
    const p = $('#setup-pill'); if (!p) return;
    p.textContent = pct + '%';
    p.className = 'pill ' + (pct >= 100 ? 'done' : pct > 0 ? 'part' : '');
    $('#btn-setup').classList.toggle('pulse', pct < 100);
  }

  /* ============================================================ actions */
  async function setState(dedupe, state, extra) {
    const patch = {}; patch[dedupe] = { my: Object.assign({ state }, extra || {}, { changed_at: iso(new Date()) }) };
    const o = ORDERS.find(x => x.dedupe === dedupe);
    if (o) { o.my = Object.assign({}, o.my, { state }, extra || {}, { changed_at: iso(new Date()) }); }
    await WD.store.patchOrders(patch);
    rerank(); render(); refreshChrome();
    return o;
  }

  function fillTemplate(tpl, order) {
    const p = SETTINGS.profile, m = SETTINGS.my || {};
    const o = order || {};
    const r = o.rank || WD.rank(o, p, {});
    const vals = {
      company: o.company || 'there',
      title: o.title || 'the posted work',
      city: o.city || '', state: o.state || '',
      home_city: (p.home && p.home.city) || '', home_state: (p.home && p.home.state) || '',
      distance: o.distance_mi != null ? distLabel(o.distance_mi) : 'a short drive',
      drive_time: o.drive_min != null ? fmtMin(o.drive_min) : 'under an hour',
      start_day: o.start ? dayLabel(o.start) : 'the posted window',
      pay: o.pay && o.pay.amount != null ? money(o.pay.amount) : 'the posted rate',
      hourly: r.netHourly ? money(r.netHourly.net, 0) + '/hr' : '',
      skills: (o.rank && o.rank.parts && o.rank.parts.match && o.rank.parts.match.hits && o.rank.parts.match.hits.length
                ? o.rank.parts.match.hits : (p.skills || [])).slice(0, 5).join(', ') || 'field service work',
      first_name: m.first_name || '', last_name: m.last_name || '',
      phone: m.phone || '', email: m.email || '',
      certifications: m.certifications || '', experience_years: m.experience_years || '',
      tools: m.tools || '', vehicle: m.vehicle || '',
      platform: o.platform === 'fieldnation' ? 'Field Nation' : o.platform === 'workmarket' ? 'WorkMarket' : 'the platform',
      order_id: o.id || '',
      completed_jobs: String(ORDERS.filter(x => ['won', 'applied'].includes(stateBucket(x))).length)
    };
    let text = String(tpl || '');
    const missing = [];
    text = text.replace(/\{(\w+)\}/g, (_, k) => {
      const v = vals[k];
      if (v === undefined) { missing.push(k); return '{' + k + '}'; }
      if (v === '' || v == null) { missing.push(k); return ''; }
      return v;
    });
    return { text, missing: WD.uniq(missing), vals };
  }

  function firstOpenOrder() {
    const rows = sorted(filtered());
    return rows[0] || VIEW[0] || ORDERS[0] || null;
  }

  async function doApply(o) {
    const t = (SETTINGS.templates || []).find(x => x.id === SETTINGS.activeTemplate) || (SETTINGS.templates || [])[0];
    const filled = fillTemplate(t ? t.body : '', o);
    const okCopy = await copy(filled.text);

    const url = o.apply_url || o.url || WD.LINKS[o.platform] && WD.LINKS[o.platform].search;
    if (url) window.open(url, '_blank', 'noopener');

    await setState(o.dedupe, 'applied', { applied_at: iso(new Date()), pitch: filled.text });
    await WD.store.addLog('apply', { id: o.id, platform: o.platform, company: o.company });

    toast(okCopy
      ? '✅ Marked applied · pitch copied · the work order opened in a new tab — <b>paste and press submit there</b>'
      : '✅ Marked applied · the work order opened in a new tab', 'ok', 9000);

    if (filled.missing.length) {
      setTimeout(() => toast('Heads up: your pitch still had {' + filled.missing.join('}, {') + '} in it — fill those in ⋯ → My profile', 'warn', 9000), 700);
    }
    notifyMaybe(o);
  }

  function notifyMaybe(o) {
    if (!SETTINGS.notifications || !SETTINGS.notifications.enabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (NOTIFIED.has(o.dedupe)) return;
    const n = SETTINGS.notifications;
    if (o.rank.score < (n.minScore || 0)) return;
    if (o.pay && o.pay.amount != null && o.pay.amount < (n.minPay || 0)) return;
    if (o.distance_mi != null && o.distance_mi > (n.maxMiles || 9999)) return;
    NOTIFIED.add(o.dedupe);
    try {
      new Notification('⚡ ' + (o.title || 'New work') + ' — score ' + o.rank.score, {
        body: [o.company, [o.city, o.state].filter(Boolean).join(', '),
               o.pay && o.pay.amount != null ? money(o.pay.amount) : '',
               o.distance_mi != null ? distLabel(o.distance_mi) : ''].filter(Boolean).join(' · '),
        tag: o.dedupe, requireInteraction: false
      });
    } catch (e) {}
  }

  function scanForNotifications() {
    if (!SETTINGS.notifications || !SETTINGS.notifications.enabled) return;
    sorted(filtered()).filter(o => stateBucket(o) === 'open').slice(0, 60).forEach(notifyMaybe);
  }

  async function enableNotifications() {
    if (!('Notification' in window)) return toast('This browser has no Notification API', 'warn');
    const perm = await Notification.requestPermission();
    SETTINGS.notifications.enabled = perm === 'granted';
    await persist();
    refreshChrome();
    toast(perm === 'granted' ? '🔔 Alerts on — you\'ll be pinged for new work that clears your bar' : 'Permission ' + perm, perm === 'granted' ? 'ok' : 'warn');
    if (perm === 'granted') notificationSettingsSheet();
  }

  /* ============================================================ drawer */
  let drawerOrder = null;
  function openDrawer(dedupe) {
    const o = VIEW.find(x => x.dedupe === dedupe) || ORDERS.find(x => x.dedupe === dedupe);
    if (!o) return;
    drawerOrder = o;
    const r = o.rank || WD.rank(o, profile(), {});
    o.rank = r;

    $('#d-kicker').innerHTML = '';
    $('#d-kicker').append(
      el('span', { class: 'plat ' + o.platform, text: o.platform === 'fieldnation' ? 'FIELD NATION' : o.platform === 'workmarket' ? 'WORKMARKET' : 'UNMAPPED' }),
      o.id ? el('span', { class: 'dim', text: 'id ' + o.id }) : null,
      el('span', { class: 'scorepill ' + r.label, text: '★ ' + r.score + ' ' + r.label })
    );
    $('#d-title').textContent = o.title || '(no title posted)';

    const body = $('#d-body');
    body.innerHTML = '';

    // ---- the money box
    const payBox = el('div', { class: 'd-paybox' });
    if (o.pay && o.pay.amount != null) {
      payBox.append(
        el('div', { class: 'd-pay' }, [
          el('b', { text: money(o.pay.amount) + (o.pay.type === 'hourly' ? '/hr' : o.pay.type === 'per_unit' ? ' per ' + (o.pay.unit_label || 'unit') : ' flat') }),
          o.pay.min != null && o.pay.max != null ? el('span', { class: 'dim', text: '(posted range ' + money(o.pay.min) + '–' + money(o.pay.max) + ')' }) : null
        ]),
        r.netHourly ? el('div', { class: 'd-net' }, [
          el('span', { text: '≈ ' + money(r.netHourly.net, 0) + '/hr net' }),
          r.netHourly.fee ? el('span', { class: 'dim', text: ' after ' + Math.round(r.netHourly.fee * 100) + '% platform fee' }) : null
        ]) : el('div', { class: 'd-net dim', text: 'Cannot derive $/hr — no window or duration posted' }),
        r.netTotal ? el('div', { class: 'd-net dim', text: 'job total ≈ ' + money(r.netTotal.net) + ' net' }) : null,
        o.pay.raw ? el('div', { class: 'd-raw', text: 'posted as: “' + o.pay.raw + '”' }) : null
      );
    } else payBox.appendChild(el('div', { class: 'd-net dim', text: 'No pay posted on this listing' }));
    body.appendChild(payBox);

    // ---- facts grid
    const facts = el('div', { class: 'd-facts' });
    const F = (k, v, cls) => { if (v == null || v === '') return; facts.appendChild(el('div', { class: 'd-fact' }, [el('span', { text: k }), el('b', { class: cls || '', text: v })])); };
    F('Company', o.company);
    F('Contact', o.contact);
    F('Location', [o.address1, o.address2, o.city, o.state, o.zip].filter(Boolean).join(', ') || 'not posted', 'mono');
    F('Distance', o.distance_mi != null ? distLabel(o.distance_mi) + (o.drive_min ? ' · ~' + fmtMin(o.drive_min) + ' drive' : '') : 'unresolved');
    F('Geo source', o.geo_precision === 'exact' ? 'posted coordinates' : o.geo_precision === 'city' ? 'city centroid (built-in table)' : o.geo_precision === 'state' ? 'STATE CENTROID — rough' : 'none');
    F('Starts', o.start ? dayLabel(o.start) + ' (' + ago(o.start) + ')' : 'not posted');
    F('Window ends', o.end ? dayLabel(o.end) : '');
    F('Posted', o.posted_at ? ago(o.posted_at) : (o.captured_at ? 'captured ' + ago(o.captured_at) : ''));
    F('Platform status', o.status);
    F('Work types', (o.work_types || []).join(', '));
    F('Skills detected', (o.skills || []).join(', '));
    F('Requirements', (o.requirements || []).join(', '));
    F('Techs wanted', o.pay && o.pay.units > 1 ? String(o.pay.units) : '');
    F('Captured by', (o.harvest && o.harvest.method) + ' · ' + (o.source || ''));
    F('Seen', (o.harvest && o.harvest.seen_count) ? o.harvest.seen_count + '× since ' + ago(o.harvest.first_seen) : '');
    body.appendChild(facts);

    // ---- description
    if (o.description || o.description_html) {
      body.appendChild(el('div', { class: 'd-sec' }, [
        el('h4', { text: 'The posting' }),
        o.description_html
          ? el('div', { class: 'd-desc rich', html: sanitizeHtml(o.description_html) })
          : el('div', { class: 'd-desc', text: o.description })
      ]));
    }

    // ---- why this score
    body.appendChild(el('div', { class: 'd-sec' }, [
      el('h4', { text: 'Why it scored ' + r.score }),
      el('div', { class: 'scorebars' }, [
        scoreBar('Pay', r.parts.pay, SETTINGS.profile.weights.pay),
        scoreBar('Distance', r.parts.distance, SETTINGS.profile.weights.distance),
        scoreBar('Timing', r.parts.timing, SETTINGS.profile.weights.timing),
        scoreBar('Skill match', r.parts.match, SETTINGS.profile.weights.match),
        scoreBar('Buyer history', r.parts.buyer, SETTINGS.profile.weights.buyer)
      ]),
      (r.flags && r.flags.length) ? el('div', { class: 'card-flags' }, r.flags.map(f => el('span', { class: 'flag', text: f }))) : null
    ].filter(Boolean)));

    // ---- my pitch
    const t = (SETTINGS.templates || []).find(x => x.id === SETTINGS.activeTemplate) || (SETTINGS.templates || [])[0];
    const filled = fillTemplate(t ? t.body : '', o);
    const pitchTa = el('textarea', { class: 'd-pitch', rows: '9' });
    pitchTa.value = o.my && o.my.pitch ? o.my.pitch : filled.text;
    const tplSel = el('select');
    (SETTINGS.templates || []).forEach(x => tplSel.appendChild(el('option', { value: x.id, text: x.name, selected: x.id === SETTINGS.activeTemplate })));
    tplSel.addEventListener('change', () => {
      const nt = SETTINGS.templates.find(x => x.id === tplSel.value);
      pitchTa.value = fillTemplate(nt.body, o).text;
    });
    body.appendChild(el('div', { class: 'd-sec' }, [
      el('h4', { text: 'Your application' }),
      el('div', { class: 'wz-row' }, [tplSel,
        el('button', { class: 'btn ghost sm', text: 'Copy pitch', onclick: async () => toast(await copy(pitchTa.value) ? 'Pitch copied' : 'Copy failed', 'ok') }),
        el('button', { class: 'btn ghost sm', text: 'Save edits', onclick: async () => { await setState(o.dedupe, stateBucket(o), { pitch: pitchTa.value }); toast('Saved to this order', 'ok'); } })
      ]),
      pitchTa,
      filled.missing.length ? el('div', { class: 'wz-badge bad', text: 'Unfilled: ' + filled.missing.map(k => '{' + k + '}').join(', ') + ' — set these in ⋯ → My profile' }) : null
    ].filter(Boolean)));

    // ---- my notes / follow-ups
    const noteTa = el('textarea', { rows: '3', placeholder: 'Notes: who you talked to, what they said, what to follow up on…' });
    noteTa.value = (o.my && o.my.note) || '';
    const fu = el('div', { class: 'd-fu' });
    const renderFu = () => {
      fu.innerHTML = '';
      ((o.my && o.my.followups) || []).forEach((f, i) => fu.appendChild(el('div', { class: 'fu' }, [
        el('span', { class: 'dim', text: ago(f.at) }), el('span', { text: f.text }),
        el('button', { class: 'btn ghost sm icon', text: '✕', onclick: async () => { o.my.followups.splice(i, 1); await setState(o.dedupe, stateBucket(o), { followups: o.my.followups, note: noteTa.value }); renderFu(); } })
      ])));
    };
    renderFu();
    body.appendChild(el('div', { class: 'd-sec' }, [
      el('h4', { text: 'Tracking' }), noteTa,
      el('div', { class: 'wz-row' }, [
        el('input', { type: 'text', id: 'd-fu-in', placeholder: 'Add a follow-up note…', onkeydown: async e => {
          if (e.key !== 'Enter') return;
          const v = e.target.value.trim(); if (!v) return;
          o.my.followups = (o.my.followups || []).concat([{ at: iso(new Date()), text: v }]);
          await setState(o.dedupe, stateBucket(o), { followups: o.my.followups, note: noteTa.value });
          e.target.value = ''; renderFu();
        }})
      ]),
      fu,
      el('div', { class: 'wz-row outcome' }, [
        el('span', { class: 'dim', text: 'Outcome:' }),
        el('button', { class: 'btn ghost sm', text: '🏆 Won', onclick: async () => { await setState(o.dedupe, 'won', { note: noteTa.value, outcome_at: iso(new Date()) }); toast('Marked won — that buyer now ranks higher for you', 'ok'); openDrawer(o.dedupe); } }),
        el('button', { class: 'btn ghost sm', text: '✗ Lost / no reply', onclick: async () => { await setState(o.dedupe, 'lost', { note: noteTa.value, outcome_at: iso(new Date()) }); toast('Marked lost', 'info'); openDrawer(o.dedupe); } }),
        el('button', { class: 'btn ghost sm', text: '↩ Reopen', onclick: async () => { await setState(o.dedupe, 'open', { note: noteTa.value, applied_at: null }); toast('Back on the open board', 'ok'); openDrawer(o.dedupe); } })
      ])
    ]));

    // ---- raw / diagnostics
    body.appendChild(el('details', { class: 'd-raw-sec' }, [
      el('summary', { text: 'Raw capture & diagnostics (' + (o.harvest.fields || []).length + ' fields mapped)' }),
      el('div', { class: 'd-rawbody' }, [
        el('div', { class: 'dim small', text: 'Mapped from: ' + (o.harvest.fields || []).join(', ') }),
        el('div', { class: 'dim small', text: 'Dedupe key: ' + o.dedupe + ' · method: ' + (o.harvest.method || '?') + ' · source: ' + (o.source || '?') }),
        o.harvest.page_url ? el('div', { class: 'dim small', text: 'Captured on: ' + o.harvest.page_url }) : null,
        el('pre', { text: (() => { try { return JSON.stringify(o.raw == null ? o : o.raw, null, 1).slice(0, 12000); } catch (e) { return '(unserializable)'; } })() })
      ].filter(Boolean))
    ]));

    // ---- footer actions
    const foot = $('#d-foot');
    foot.innerHTML = '';
    foot.append(
      el('a', { class: 'btn primary', href: o.apply_url || o.url || '#', target: '_blank', rel: 'noopener', text: '↗ Open on ' + (o.platform === 'fieldnation' ? 'Field Nation' : o.platform === 'workmarket' ? 'WorkMarket' : 'the platform'), onclick: () => doApply(o) }),
      el('button', { class: 'btn', text: stateBucket(o) === 'applied' ? '✓ Applied' : 'Apply + copy pitch', onclick: () => doApply(o), disabled: stateBucket(o) === 'applied' }),
      el('button', { class: 'btn ghost', text: stateBucket(o) === 'saved' ? '★ Saved' : '☆ Save', onclick: async () => {
        const ns = stateBucket(o) === 'saved' ? 'open' : 'saved';
        await setState(o.dedupe, ns, { saved_at: ns === 'saved' ? iso(new Date()) : null });
        toast(ns === 'saved' ? 'Saved' : 'Removed from saved', 'ok'); openDrawer(o.dedupe);
      }}),
      el('button', { class: 'btn ghost', text: '⌫ Ignore', onclick: async () => { await setState(o.dedupe, 'ignored', { ignored_at: iso(new Date()), note: noteTa.value }); toast('Hidden. Find it in the Ignored tab.', 'info'); closeDrawer(); } }),
      el('button', { class: 'btn ghost sm', text: '🩺 Not mapped right?', title: 'Report this order so the adapter can be fixed', onclick: async () => {
        const d = await WD.wizard.diagnostics();
        d.problemOrder = { platform: o.platform, id: o.id, mapped: o.harvest.fields, title: o.title, company: o.company,
                           city: o.city, state: o.state, pay: o.pay, start: o.start, distance_mi: o.distance_mi,
                           rawKeys: o.raw && typeof o.raw === 'object' ? Object.keys(o.raw).slice(0, 60) : null };
        toast(await copy(JSON.stringify(d.problemOrder, null, 1)) ? 'Order diagnostic copied — paste it into the issue' : 'Copy failed', 'ok');
        WD.wizard.advanceModal('adapter: ' + o.platform, 'This order did not map correctly. Diagnostic JSON is on my clipboard.');
      }})
    );

    $('#drawer').hidden = false;
    $('#scrim').hidden = false;
    document.body.classList.add('drawer-open');
  }

  function scoreBar(label, part, weight) {
    const pct = Math.round((part.score || 0) * 100);
    return el('div', { class: 'sbar' }, [
      el('span', { class: 'sbar-l', text: label }),
      el('div', { class: 'sbar-t' }, [el('i', { style: 'width:' + pct + '%' })]),
      el('span', { class: 'sbar-v', text: pct + (weight ? ' (w' + weight + ')' : '') }),
      el('span', { class: 'sbar-w dim', text: part.why || '' })
    ]);
  }

  // minimal, allow-list HTML sanitizer for posted descriptions
  function sanitizeHtml(html) {
    const ALLOW = new Set(['B','STRONG','I','EM','U','BR','P','DIV','SPAN','UL','OL','LI','H1','H2','H3','H4','H5','H6','TABLE','THEAD','TBODY','TR','TD','TH','CODE','PRE','BLOCKQUOTE','HR','SMALL','SUB','SUP']);
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    (function walk(node) {
      Array.from(node.children).forEach(child => {
        if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE' || child.tagName === 'IFRAME' ||
            child.tagName === 'OBJECT' || child.tagName === 'EMBED' || child.tagName === 'LINK' || child.tagName === 'META') {
          child.remove(); return;
        }
        if (!ALLOW.has(child.tagName)) {
          const frag = document.createDocumentFragment();
          while (child.firstChild) frag.appendChild(child.firstChild);
          child.replaceWith(frag);
          return;
        }
        Array.from(child.attributes).forEach(a => {
          const n = a.name.toLowerCase();
          if (n.startsWith('on') || (n === 'href' || n === 'src') && /^\s*javascript:/i.test(a.value)) child.removeAttribute(a.name);
          else if (n === 'style' && /expression|url\(/i.test(a.value)) child.removeAttribute(a.name);
          else if (!['href', 'style', 'colspan', 'rowspan'].includes(n)) child.removeAttribute(a.name);
        });
        walk(child);
      });
    })(doc.body);
    return doc.body.innerHTML;
  }

  function closeDrawer() {
    $('#drawer').hidden = true; $('#scrim').hidden = true;
    document.body.classList.remove('drawer-open');
    drawerOrder = null;
  }

  /* ============================================================ chrome */
  function bindChrome() {
    on(document, '#tabs button', 'click', (e, t) => goTab(t.dataset.tab));
    on(document, '#platform-seg button', 'click', (e, b) => { SETTINGS.ui.platform = b.dataset.p; persist(); refreshChrome(); render(); });
    on(document, '#sort-seg button', 'click', (e, b) => { SETTINGS.ui.sort = b.dataset.s; persist(); refreshChrome(); render(); });

    $('#q').addEventListener('input', debounce(e => { SETTINGS.ui.q = e.target.value; $('#q-clear').hidden = !e.target.value; persist(); render(); }, 180));
    $('#q-clear').addEventListener('click', () => { SETTINGS.ui.q = ''; $('#q').value = ''; $('#q-clear').hidden = true; persist(); render(); $('#q').focus(); });

    const bindFilter = (sel, key, transform) => {
      const node = $(sel);
      if (!node) return;
      node.addEventListener(node.type === 'checkbox' || node.tagName === 'SELECT' ? 'change' : 'input',
        debounce(e => { SETTINGS.filters[key] = transform(e.target); persist(); render(); }, 200));
    };
    bindFilter('#f-minpay', 'minPay', t => (t.value === '' ? null : parseFloat(t.value)));
    bindFilter('#f-maxdist', 'maxDist', t => (t.value === '' ? null : parseFloat(t.value)));
    bindFilter('#f-when', 'when', t => t.value);
    bindFilter('#f-must', 'must', t => t.value);
    bindFilter('#f-not', 'not', t => t.value);
    bindFilter('#f-fresh', 'freshOnly', t => t.checked);
    bindFilter('#f-open', 'hideHandled', t => t.checked);
    $('#btn-reset-filters').addEventListener('click', resetFilters);

    // delegate to the ACTION element, not the feed container — closest('#feed')
    // hands back the container itself, whose dataset.act is undefined, which
    // silently killed every Apply / Details / Save / Hide button on the board.
    on(document, '#feed [data-act]', 'click', async (e, btn) => {
      e.stopPropagation();
      const act = btn.dataset.act, id = btn.dataset.id;
      const o = VIEW.find(x => x.dedupe === id); if (!o) return;
      if (act === 'open') return openDrawer(id);
      if (act === 'apply') return doApply(o);
      if (act === 'save') {
        const ns = stateBucket(o) === 'saved' ? 'open' : 'saved';
        await setState(id, ns, { saved_at: ns === 'saved' ? iso(new Date()) : null });
        toast(ns === 'saved' ? '★ Saved' : 'Removed from saved', 'ok', 2000);
      }
      if (act === 'ignore') { await setState(id, 'ignored', { ignored_at: iso(new Date()) }); toast('Hidden — Ignored tab', 'info', 2500); }
    });

    $('#d-close').addEventListener('click', closeDrawer);
    $('#scrim').addEventListener('click', closeDrawer);
    $('#btn-setup').addEventListener('click', () => { const s = WD.wizard.nextUndone(SETTINGS); WD.wizard.open(s ? s.key : 0); });
    $('#btn-refresh').addEventListener('click', async () => {
      $('#btn-refresh').classList.add('spin-me');
      const h = await WD.bridge.readFragment().catch(() => null);
      const f = await WD.bridge.pullCommittedFeed().catch(() => null);
      const r = SETTINGS.relay.mode !== 'off' ? await WD.bridge.pullRelay(SETTINGS).catch(() => null) : null;
      const added = (h && h.added || 0) + (f && f.added || 0) + (r && r.added || 0);
      await reload();
      LAST_VISIT = null;  // a manual refresh should not hide things as "new"
      setTimeout(() => $('#btn-refresh').classList.remove('spin-me'), 600);
      toast(added ? '↻ ' + added + ' new work order(s) pulled' : '↻ Nothing new — board re-ranked', added ? 'ok' : 'info', 4000);
    });
    $('#btn-notifications').addEventListener('click', () => {
      if (SETTINGS.notifications.enabled) { SETTINGS.notifications.enabled = false; persist(); refreshChrome(); return toast('🔕 Alerts off', 'info'); }
      enableNotifications();
    });

    $('#btn-menu').addEventListener('click', e => {
      const p = $('#menu-pop'); p.hidden = !p.hidden;
      e.stopPropagation();
    });
    document.addEventListener('click', e => { if (!e.target.closest('#menu-pop,#btn-menu')) $('#menu-pop').hidden = true; });
    on(document, '#menu-pop button', 'click', (e, b) => { $('#menu-pop').hidden = true; route(b.dataset.act); });
    on(document, '#foot .linkish', 'click', (e, b) => route(b.dataset.act));

    // deep links: #order=<dedupe> opens a drawer (used by the Sidekick "focus this one")
    const dm = location.hash.match(/order=([^&]+)/);
    if (dm) setTimeout(() => openDrawer(decodeURIComponent(dm[1])), 400);
  }

  function route(act) {
    switch (act) {
      case 'wizard': WD.wizard.open(0); break;
      case 'import': openSettings('import'); break;
      case 'sync': openSettings('relay'); break;
      case 'relay': openSettings('relay'); break;
      case 'profile': WD.wizard.open('profile'); break;
      case 'weights': openSettings('weights'); break;
      case 'templates': openSettings('templates'); break;
      case 'export': openSettings('export'); break;
      case 'diagnostics': openSettings('diagnostics'); break;
      case 'advance': WD.wizard.advanceModal(); break;
      case 'docs': openDocs(); break;
      case 'about': openSettings('about'); break;
      default: break;
    }
  }

  function goTab(tab) {
    SETTINGS.ui.tab = tab; persist(); refreshChrome(); render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetFilters() {
    SETTINGS.filters = Object.assign({}, WD.DEFAULT_SETTINGS.filters);
    SETTINGS.ui.q = ''; persist(); refreshChrome(); render();
    toast('Filters cleared', 'info', 2000);
  }

  function persist() { return WD.store.setSettings(SETTINGS); }

  function bindKeyboard() {
    document.addEventListener('keydown', e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (e.key === '/' && !typing) { e.preventDefault(); $('#q').focus(); }
      if (e.key === 'Escape') { if (!$('#drawer').hidden) closeDrawer(); $('#menu-pop').hidden = true; }
      if (typing) return;
      if (e.key === 'r' || e.key === 'R') $('#btn-refresh').click();
      if (e.key === 'g') WD.wizard.open(0);
      if (e.key === 's') openSettings('import');
      if (e.key === '1') goTab('available');
      if (e.key === '2') goTab('new');
      if (e.key === '3') goTab('saved');
      if (e.key === '4') goTab('applied');
      if (e.key === '?' ) openSettings('shortcuts');
    });
  }

  function bindDropzone() {
    ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); document.body.classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); if (ev === 'dragleave' && e.relatedTarget) return; document.body.classList.remove('dragging'); }));
    document.addEventListener('drop', async e => {
      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      let added = 0, errs = [];
      for (const f of files) { const r = await WD.bridge.importFile(f); if (r.ok) added += r.added; else errs.push(f.name + ': ' + r.error); }
      await reload();
      toast(added ? '📥 ' + added + ' new order(s) imported' : 'Nothing imported', added ? 'ok' : 'warn', 6000);
      if (errs.length) toast(errs.join(' · '), 'err', 9000);
    });
    // wizard file input (delegated, it may be created later)
    document.addEventListener('change', async e => {
      if (e.target.id !== 'wz-file' || !e.target.files.length) return;
      const r = await WD.bridge.importFile(e.target.files[0]);
      if (r.ok) { toast('📥 ' + r.added + ' new / ' + r.updated + ' updated', 'ok'); await reload(); }
      else toast('Import failed: ' + r.error, 'err', 7000);
    });
  }

  let relayTimer = null;
  function startRelayTimer() {
    clearInterval(relayTimer);
    const mins = Math.max(2, (SETTINGS.relay.pollMinutes || 15));
    relayTimer = setInterval(async () => {
      const s = await getSettings();
      const r = await WD.bridge.pullRelay(s);
      if (r && r.ok && r.added) { toast('📡 ' + r.added + ' new from the relay', 'ok'); await reload(); scanForNotifications(); }
    }, mins * 60000);
  }

  /* ======================================================= sample data */
  async function loadSample(silent) {
    try {
      const res = await fetch('data/workorders.sample.json?_=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const rows = WD.normalizePayload(j.orders || j, { source: 'sample', method: 'sample', keepRaw: true });
      const r = await WD.bridge.ingestPreNormalized(rows, { source: 'sample' });
      if (!silent) toast(r.added + ' sample orders loaded', 'ok');
      return r.added;
    } catch (e) {
      if (!silent) toast('Could not load the sample file: ' + e.message, 'warn');
      return 0;
    }
  }

  /* ====================================================== settings UI */
  function openSettings(which) {
    const sheets = {
      import: importSheet, relay: relaySheet, weights: weightsSheet, templates: templatesSheet,
      export: exportSheet, diagnostics: diagnosticsSheet, about: aboutSheet,
      notifications: notificationSettingsSheet, shortcuts: shortcutsSheet
    };
    (sheets[which] || aboutSheet)();
  }

  function sheet(title, kicker, build) {
    const body = el('div', { class: 'wz-body' });
    const entry = modal({ title, kicker, body, width: '760px', foot: [el('button', { class: 'btn ghost', text: 'Close', onclick: () => closeModal(entry) })] });
    build(body, entry);
    return entry;
  }

  function importSheet() {
    sheet('Import work orders', 'Any JSON, CSV, TSV, or plain listing text', body => {
      body.appendChild(el('div', { class: 'dropzone big' }, [
        el('div', { html: '<b>Drop files anywhere on this page</b><span class="dim">JSON · CSV · TSV · TXT — you can also drop them outside this dialog</span>' }),
        el('label', { class: 'btn' }, ['Choose files', el('input', { type: 'file', multiple: true, hidden: true, accept: '.json,.csv,.tsv,.txt', onchange: async e => {
          let added = 0; for (const f of e.target.files) { const r = await WD.bridge.importFile(f); added += r.added || 0; }
          toast(added + ' imported', 'ok'); await reload();
        }})])
      ]));
      const ta = el('textarea', { rows: '7', placeholder: 'Paste JSON, CSV, or plain text listings here…' });
      const plat = el('select', {}, [el('option', { value: '', text: 'auto-detect platform' }),
        el('option', { value: 'fieldnation', text: 'Field Nation' }), el('option', { value: 'workmarket', text: 'WorkMarket' })]);
      body.append(
        el('div', { class: 'wz-sec' }, [el('h4', { text: '…or paste it' }), ta,
          el('div', { class: 'wz-row' }, [plat, el('button', { class: 'btn primary', text: 'Ingest', onclick: async () => {
            const r = await WD.bridge.importText(ta.value, { platform: plat.value || undefined, source: 'manual', channel: 'manual', method: 'paste' });
            if (r.ok) { toast(r.added + ' new / ' + r.updated + ' updated', 'ok'); await reload(); }
            else toast('Nothing recognized: ' + r.error, 'err', 7000);
          }})]) ]),
        el('div', { class: 'wz-sec' }, [el('h4', { text: 'Sync code from the Sidekick' }),
          el('div', { class: 'wz-row' }, [
            el('input', { type: 'text', id: 'sc-in', placeholder: 'WD1-…', style: 'flex:1' }),
            el('button', { class: 'btn', text: 'Accept', onclick: async () => {
              const r = await WD.bridge.acceptSyncCode($('#sc-in').value);
              if (r.ok) { toast(r.added + ' new orders', 'ok'); await reload(); } else toast(r.error, 'err', 7000);
            }})
          ]) ]),
        el('div', { class: 'callout' }, [el('div', { class: 'callout-h', text: 'What gets recognized' }),
          el('p', { class: 'dim', html: 'Anything with a title/company/pay/city/date in it. Field names are matched by alias (see <code>assets/normalize.js</code>), so a Field Nation <code>workorder</code> object, a WorkMarket <code>assignment</code>, a CSV export, and text you copied off your phone all land in the same schema. Unrecognized fields are kept in <b>Raw capture</b> on every order so nothing is lost.' }) ])
      );
    });
  }

  function relaySheet() {
    sheet('Sync & relay', 'Optional — only if you want data to arrive without you clicking', async body => {
      const s = await getSettings();
      const r = s.relay;
      const mode = el('select');
      [['off', 'Off — I send data manually (default)'], ['gist', 'GitHub Gist (auto-pull)'],
       ['raw', 'Raw file URL (e.g. raw.githubusercontent.com)'], ['ntfy', 'ntfy.sh topic'],
       ['custom', 'Custom JSON URL']].forEach(([v, t]) => mode.appendChild(el('option', { value: v, text: t, selected: r.mode === v })));
      const gist = el('input', { type: 'text', value: r.gistId || '', placeholder: 'gist id, e.g. 3f1a…' });
      const url = el('input', { type: 'text', value: r.url || '', placeholder: 'https://…' });
      const token = el('input', { type: 'password', value: r.token || '', placeholder: 'only if the relay is private', autocomplete: 'off' });
      const mins = el('input', { type: 'number', min: '2', max: '1440', value: r.pollMinutes || 15 });

      const save = async () => {
        const st = await getSettings();
        st.relay = Object.assign({}, st.relay, { mode: mode.value, gistId: gist.value.trim(), url: url.value.trim(),
          token: token.value.trim(), pollMinutes: parseInt(mins.value, 10) || 15 });
        await WD.store.setSettings(st);
        startRelayTimer();
        toast('Relay settings saved', 'ok');
        if (st.relay.mode !== 'off') {
          const res = await WD.bridge.pullRelay(st);
          toast(res.ok ? '✓ Relay pull worked — ' + res.added + ' new' : 'Relay pull failed: ' + res.error, res.ok ? 'ok' : 'err', 8000);
          if (res.ok) await reload();
        }
      };

      body.append(
        el('div', { class: 'wz-grid' }, [
          el('label', { class: 'wz-fld' }, [el('span', { text: 'Mode' }), mode]),
          el('label', { class: 'wz-fld' }, [el('span', { text: 'Gist id' }), gist]),
          el('label', { class: 'wz-fld' }, [el('span', { text: 'URL' }), url]),
          el('label', { class: 'wz-fld' }, [el('span', { text: 'Token (optional)' }), token]),
          el('label', { class: 'wz-fld' }, [el('span', { text: 'Poll every (minutes)' }), mins])
        ]),
        el('div', { class: 'wz-row' }, [el('button', { class: 'btn primary', text: 'Save & test', onclick: save }),
          el('button', { class: 'btn ghost', text: 'Pull committed feed now', onclick: async () => {
            const res = await WD.bridge.pullCommittedFeed();
            toast(res.ok ? res.added + ' new from data/feed.json' : 'No committed feed yet (that appears once worker/poll.py runs with real API keys)', res.ok ? 'ok' : 'info', 7000);
            if (res.ok) await reload();
          }})]),
        el('div', { class: 'callout warn' }, [el('div', { class: 'callout-h', text: 'Tokens' }),
          el('p', { html: 'A token typed here is stored in <b>this browser only</b> and is never committed, exported, or included in diagnostics. Prefer a <b>public</b> gist or a public raw URL so no token is needed at all — a fine-grained PAT limited to one gist is the next best thing. Never paste a classic PAT with repo scope.' }) ]),
        el('div', { class: 'callout' }, [el('div', { class: 'callout-h', text: 'Phone push (free, no account)' }),
          el('p', { html: 'In the Sidekick settings, set an <b>ntfy.sh topic</b> (any random word — it acts as the password). The Sidekick posts a summary there whenever it captures new work. Install the <a href="https://ntfy.sh" target="_blank" rel="noopener">ntfy</a> app, subscribe to that topic, and your phone buzzes. Set the same topic here as mode <b>ntfy</b> and this board pulls from it too.' }) ])
      );
    });
  }

  function weightsSheet() {
    sheet('Ranking weights', 'What "★ Best" means — tune it to how you actually pick work', async body => {
      const s = await getSettings();
      const w = s.profile.weights;
      const rows = [['pay', 'Pay (net $/hr)'], ['distance', 'Distance from base'], ['timing', 'Timing & freshness'],
                    ['match', 'Skill match'], ['buyer', 'Buyer history (learned from your own results)']];
      const inputs = {};
      const grid = el('div', { class: 'wz-grid' });
      rows.forEach(([k, label]) => {
        const i = el('input', { type: 'range', min: '0', max: '50', value: w[k] || 0 });
        const out = el('b', { text: String(w[k] || 0) });
        i.addEventListener('input', () => { out.textContent = i.value; });
        inputs[k] = i;
        grid.appendChild(el('label', { class: 'wz-fld' }, [el('span', {}, [label, ' ', out]), i]));
      });
      const prev = el('div', { class: 'wz-preview' });
      const rerender = () => {
        const p = WD.profileOf({ profile: Object.assign({}, s.profile, { weights: Object.fromEntries(Object.keys(inputs).map(k => [k, +inputs[k].value])) }) });
        const top = ORDERS.slice(0, 400).map(o => ({ o, r: WD.rank(o, p, WD.store.buildBuyerHistory(ORDERS)) }))
          .sort((a, b) => b.r.score - a.r.score).slice(0, 6);
        prev.innerHTML = '<h4>Top 6 with these weights</h4>' +
          top.map(t => '<div class="mini"><b>' + t.r.score + '</b> ' + esc(truncate(t.o.title || '(untitled)', 54)) +
            ' <span class="dim">' + esc(t.o.company || '') + ' · ' + esc((t.o.city || '') + ' ' + (t.o.state || '')) + '</span></div>').join('');
      };
      Object.values(inputs).forEach(i => i.addEventListener('input', debounce(rerender, 200)));
      body.append(grid,
        el('div', { class: 'wz-row' }, [
          el('button', { class: 'btn primary', text: 'Save weights', onclick: async () => {
            const st = await getSettings();
            st.profile.weights = Object.fromEntries(Object.keys(inputs).map(k => [k, +inputs[k].value]));
            await WD.store.setSettings(st); SETTINGS = st; rerank(); render(); toast('Weights saved — board re-ranked', 'ok');
          }}),
          el('button', { class: 'btn ghost', text: 'Reset to defaults', onclick: () => {
            Object.keys(inputs).forEach(k => { inputs[k].value = WD.DEFAULT_WEIGHTS[k]; }); rerender();
          }})
        ]), prev);
      rerender();
    });
  }

  function templatesSheet() {
    sheet('Pitch templates', 'Merge tokens fill themselves from each order', async body => {
      const s = await getSettings();
      const list = el('div', { class: 'tpl-list' });
      const tokens = ['company','title','city','state','home_city','home_state','distance','drive_time','start_day','pay','hourly','skills','first_name','last_name','phone','email','certifications','experience_years','tools','vehicle','platform','order_id','completed_jobs'];
      const render = () => {
        list.innerHTML = '';
        s.templates.forEach((t, idx) => {
          const name = el('input', { type: 'text', value: t.name });
          const ta = el('textarea', { rows: '9' }); ta.value = t.body;
          const row = el('div', { class: 'tpl' + (t.id === s.activeTemplate ? ' active' : '') }, [
            el('div', { class: 'wz-row' }, [name,
              el('button', { class: 'btn ghost sm', text: t.id === s.activeTemplate ? '★ default' : 'Make default', onclick: async () => {
                s.activeTemplate = t.id; await WD.store.setSettings(s); SETTINGS = s; render(); toast('Default pitch set', 'ok');
              }}),
              el('button', { class: 'btn ghost sm', text: 'Delete', onclick: async () => {
                if (s.templates.length <= 1) return toast('Keep at least one template', 'warn');
                if (!await confirmModal({ title: 'Delete this template?', body: '<p>"' + esc(t.name) + '" will be gone.</p>', okText: 'Delete' })) return;
                s.templates.splice(idx, 1); if (s.activeTemplate === t.id) s.activeTemplate = s.templates[0].id;
                await WD.store.setSettings(s); SETTINGS = s; render();
              }})]),
            ta
          ]);
          name.addEventListener('input', debounce(() => { t.name = name.value; }, 300));
          ta.addEventListener('input', debounce(async () => { t.body = ta.value; await WD.store.setSettings(s); SETTINGS = s; }, 400));
          list.appendChild(row);
        });
      };
      render();
      body.append(list,
        el('div', { class: 'wz-row' }, [el('button', { class: 'btn', text: '+ Add template', onclick: async () => {
          const st = await getSettings();
          st.templates.push({ id: 'tpl' + Date.now().toString(36), name: 'New template', body: 'Hi {company},\n\n' });
          await WD.store.setSettings(st); SETTINGS = st; s = st; render();
        }})]),
        el('div', { class: 'callout' }, [el('div', { class: 'callout-h', text: 'Tokens you can use' }),
          el('div', { class: 'tokenlist' }, tokens.map(t => el('code', { text: '{' + t + '}', title: 'fills from the order + your profile' })))]));
    });
  }

  function exportSheet() {
    sheet('Export & backup', 'Your data is local — this is how you keep it', body => {
      body.append(
        el('div', { class: 'wz-cards' }, [
          el('div', { class: 'wz-card' }, [el('b', { text: '💾 Full backup (JSON)' }),
            el('span', { text: 'Every order, your tracking state, notes, settings, and templates. Restores onto any device.' }),
            el('button', { class: 'btn sm', text: 'Download backup', onclick: async () => { const n = await WD.bridge.exportBackup(); toast('Backup written — ' + n + ' orders', 'ok'); } })]),
          el('div', { class: 'wz-card' }, [el('b', { text: '📄 Spreadsheet (CSV)' }),
            el('span', { text: 'The current view, one row per order — for your own 1099 / mileage / hours records.' }),
            el('button', { class: 'btn sm', text: 'Export CSV', onclick: () => WD.bridge.exportCSV(sorted(filtered())) })]),
          el('div', { class: 'wz-card' }, [el('b', { text: '↩️ Restore' }),
            el('span', { text: 'Load a backup file back in. Merges by dedupe key; your tracking state on existing orders is preserved.' }),
            el('label', { class: 'btn sm' }, ['Choose backup', el('input', { type: 'file', hidden: true, accept: '.json', onchange: async e => {
              try { const n = await WD.bridge.restoreBackup(await e.target.files[0].text()); toast('Restored ' + n + ' orders', 'ok'); await reload(); }
              catch (err) { toast('Restore failed: ' + err.message, 'err', 7000); }
            }})])]),
          el('div', { class: 'wz-card danger' }, [el('b', { text: '🗑 Erase everything' }),
            el('span', { text: 'Deletes all orders and tracking from this browser. Settings and templates are kept.' }),
            el('button', { class: 'btn sm ghost', text: 'Erase all orders', onclick: async () => {
              if (!await confirmModal({ title: 'Erase every work order?', body: '<p>This cannot be undone. Download a backup first if you might want it.</p>', okText: 'Erase' })) return;
              await WD.store.clearOrders(); await reload(); toast('Board cleared', 'info');
            }})])
        ])
      );
    });
  }

  async function diagnosticsSheet() {
    const body = el('div', { class: 'wz-body' });
    const entry = sheet('Diagnostics & self-test', 'Everything WorkDesk knows about itself', b => b.appendChild(body));
    body.appendChild(el('div', { class: 'spin' }));
    const d = await WD.wizard.diagnostics();
    body.innerHTML = '';

    const results = [];
    const test = async (name, fn) => {
      let ok = false, note = '';
      try { const r = await fn(); ok = r !== false; note = typeof r === 'string' ? r : ''; }
      catch (e) { ok = false; note = e.message; }
      results.push({ name, ok, note });
    };

    await test('Storage backend', () => WD.store.backend === 'idb' ? 'IndexedDB' : 'FALLBACK: ' + WD.store.backend + ' (smaller capacity)');
    await test('gzip payloads (CompressionStream)', () => detectEnv().compression ? 'available' : 'MISSING — sync codes will be larger but still work');
    await test('City table loaded', () => WD.CITY_COUNT + ' cities indexed');
    await test('Geocode Cheyenne, WY', () => { const g = WD.lookupCity('Cheyenne', 'WY'); return g && Math.abs(g.lat - 41.14) < 0.2 ? g.lat.toFixed(3) + ', ' + g.lng.toFixed(3) : false; });
    await test('Distance math', () => {
      const m = WD.haversineMiles({ lat: 41.14, lng: -104.82 }, { lat: 39.7392, lng: -104.9903 });
      return m > 90 && m < 110 ? 'Cheyenne→Denver ' + Math.round(m) + ' mi straight-line, ' + Math.round(WD.roadMiles(m)) + ' mi road' : false;
    });
    await test('Pay parsing "$25 - $35/hr"', () => { const p = WD.parsePay('$25 - $35/hr'); return p.type === 'hourly' && p.amount === 30 ? 'hourly, mid $30' : false; });
    await test('Pay parsing "$150 flat"', () => { const p = WD.parsePay('$150 flat'); return p.amount === 150 ? 'flat $150' : false; });
    await test('Pay parsing "150 USD x 2 techs"', () => { const p = WD.parsePay('150 USD x 2 techs'); return p.amount === 150 && p.units === 2 ? '$150 × 2' : false; });
    await test('Field Nation shape adapter', () => {
      const rows = WD.normalizePayload({ title: 'Install POS', description: { html: 'Swap terminal' },
        location: { address1: '123 Main St', city: 'Minneapolis', state: 'MN', zip: '55401' },
        schedule: { service_window: { mode: 'exact', start: { utc: '2026-07-15 09:00:00' } } },
        pay: { type: 'fixed', base: { amount: 150, units: 1 } } }, { source: 'selftest' });
      const r = rows[0];
      return r && r.city === 'Minneapolis' && r.pay.amount === 150 && r.start ? 'title+city+pay+start all mapped' : false;
    });
    await test('WorkMarket-ish shape adapter', () => {
      const rows = WD.normalizePayload({ assignments: [{ id: 'a1', title: 'Site survey', company: { name: 'Acme' },
        city: 'Denver', state: 'CO', pay_rate: '$45/hr', start_date: '2026-08-02' }] }, { source: 'selftest' });
      const r = rows[0];
      return r && r.company === 'Acme' && r.pay.amount === 45 ? 'nested company + hourly rate mapped' : false;
    });
    await test('CSV import', () => {
      const rows = WD.normalizeCSV('title,company,city,state,pay,start\nReset router,ISP Co,Casper,WY,"$120 flat",2026-08-01', { source: 'selftest' });
      return rows.length === 1 && rows[0].pay.amount === 120 ? '1 row parsed' : false;
    });
    await test('Pasted-text import', () => {
      const rows = WD.normalizePasted('POS Refresh - Denver, CO - $150 flat - Starts Jul 15\n\nCabling pull - Casper, WY - $28/hr - Starts Jul 20', { source: 'selftest' });
      return rows.length === 2 && rows[0].city === 'Denver' ? '2 blocks, cities parsed' : false;
    });
    await test('Sync code round-trip', async () => {
      const code = await WD.bridge.makeSyncCode({ orders: [{ title: 't', city: 'Cheyenne', state: 'WY', pay: 100 }] });
      const back = await WD.bridge.decodePayload(code);
      return back && back.orders && back.orders[0].title === 't' ? code.length + ' chars' : false;
    });
    await test('Dedupe stability', () => {
      const a = WD.normalizePayload([{ id: '77', title: 'Same', city: 'Laramie', state: 'WY' }], { source: 'selftest' })[0];
      const b = WD.normalizePayload([{ id: '77', title: 'Same', city: 'Laramie', state: 'WY', pay: 999 }], { source: 'selftest' })[0];
      return a.dedupe === b.dedupe ? 'same key across captures' : false;
    });
    await test('Relay reachability', async () => {
      if (!SETTINGS.relay || SETTINGS.relay.mode === 'off') return 'off (not an error)';
      const r = await WD.bridge.pullRelay(SETTINGS);
      if (r.ok) return 'pulled ' + r.added + ' new';
      throw new Error(r.error || 'unreachable');
    });
    await test('Committed API feed', async () => {
      const r = await WD.bridge.pullCommittedFeed();
      return r.ok ? 'data/feed.json live: ' + r.added + ' new' : 'not present yet (expected without API keys)';
    });

    body.append(
      el('div', { class: 'diag-summary' }, [
        el('b', { text: results.filter(r => r.ok).length + ' / ' + results.length + ' checks passed' }),
        el('span', { class: 'dim', text: ' · ' + d.stats.total + ' orders · backend ' + d.backend + ' · WorkDesk ' + d.version })
      ]),
      el('div', { class: 'diag-list' }, results.map(r => el('div', { class: 'diag ' + (r.ok ? 'ok' : 'fail') }, [
        el('span', { class: 'diag-m', text: r.ok ? '✓' : '✗' }),
        el('span', { class: 'diag-n', text: r.name }),
        el('span', { class: 'diag-v', text: r.note })
      ]))),
      el('div', { class: 'wz-sec' }, [el('h4', { text: 'Bridge counters' }),
        el('pre', { class: 'wz-diag', text: JSON.stringify({ counts: d.bridge.counts, lastHandoffAt: d.bridge.lastHandoffAt,
          lastRelayAt: d.bridge.lastRelayAt, errors: d.bridge.errors }, null, 1) })]),
      el('div', { class: 'wz-sec' }, [el('h4', { text: 'Environment' }),
        el('pre', { class: 'wz-diag', text: JSON.stringify(d.env, null, 1) })]),
      el('div', { class: 'wz-sec' }, [el('h4', { text: 'Recent activity log' }),
        el('pre', { class: 'wz-diag', text: (await WD.store.getLog(30)).map(l => l.t + '  ' + l.kind + '  ' + JSON.stringify(l.detail || '')).join('\n') })]),
      el('div', { class: 'wz-row' }, [
        el('button', { class: 'btn', text: 'Run again', onclick: () => { closeModal(entry); diagnosticsSheet(); } }),
        el('button', { class: 'btn ghost', text: 'Copy diagnostics', onclick: async () => toast(await copy(JSON.stringify({ d, results }, null, 1)) ? 'Copied' : 'Copy failed', 'ok') }),
        el('button', { class: 'btn ghost', text: '🚀 Send to the builder', onclick: () => WD.wizard.advanceModal('diagnostics', results.filter(r => !r.ok).map(r => r.name + ': ' + r.note).join('\n')) })
      ])
    );
  }

  function notificationSettingsSheet() {
    sheet('Alerts', 'Only fires for work that clears your bar', async body => {
      const s = await getSettings(); const n = s.notifications;
      const minScore = el('input', { type: 'number', value: n.minScore, min: '0', max: '100' });
      const minPay = el('input', { type: 'number', value: n.minPay, min: '0', step: '25' });
      const maxMiles = el('input', { type: 'number', value: n.maxMiles, min: '0', step: '10' });
      body.append(
        el('p', { class: 'dim', text: 'Notifications fire while this tab is open, for new orders that pass all three bars. For phone alerts when the tab is closed, use an ntfy.sh topic in the Sidekick settings — see the relay sheet.' }),
        el('div', { class: 'wz-grid' }, [
          el('label', { class: 'wz-fld' }, [el('span', { text: 'Minimum WorkScore' }), minScore]),
          el('label', { class: 'wz-fld' }, [el('span', { text: 'Minimum pay ($)' }), minPay]),
          el('label', { class: 'wz-fld' }, [el('span', { text: 'Maximum miles' }), maxMiles])
        ]),
        el('div', { class: 'wz-row' }, [
          el('button', { class: 'btn primary', text: 'Save', onclick: async () => {
            const st = await getSettings();
            st.notifications = Object.assign({}, st.notifications, { minScore: +minScore.value, minPay: +minPay.value, maxMiles: +maxMiles.value });
            await WD.store.setSettings(st); SETTINGS = st; toast('Alert thresholds saved', 'ok');
          }}),
          el('button', { class: 'btn ghost', text: 'Send a test alert', onclick: () => {
            if (!('Notification' in window)) return toast('Unsupported browser', 'warn');
            new Notification('⚡ WorkDesk test alert', { body: 'If you saw this, alerts work.' });
          }})
        ])
      );
    });
  }

  function shortcutsSheet() {
    sheet('Keyboard', 'Built for one-hand use on a laptop in a truck', body => {
      const keys = [['/', 'Focus search'], ['R', 'Refresh / re-pull'], ['G', 'Guided setup'], ['S', 'Import / sync'],
        ['1', 'Open board'], ['2', 'New'], ['3', 'Saved'], ['4', 'Applied'], ['Enter', 'Open the focused card'], ['Esc', 'Close drawer or dialog']];
      body.appendChild(el('div', { class: 'kbds' }, keys.map(([k, v]) => el('div', { class: 'kbd-row' }, [el('kbd', { text: k }), el('span', { text: v })]))));
    });
  }

  function aboutSheet() {
    sheet('About WorkDesk — and its honest limits', 'Read this before you trust a number on this board', body => {
      body.innerHTML = `
      <div class="wz-prose">
        <p><b>WorkDesk ${esc(WD.VERSION)}</b> — one board for Field Nation + WorkMarket. Static site, no server, no account,
        no analytics, no third-party calls. Your orders, notes and tracking live in this browser's IndexedDB.</p>

        <h4>What it does well</h4>
        <ul>
          <li>Puts both platforms in one ranked feed with one consistent <b>net $/hr</b> number.</li>
          <li>Ranks by what actually matters: net pay, drive distance, timing, your skills, and <b>your own history</b>
              with each buyer (companies you've won work from rank higher; ones you've ignored rank lower).</li>
          <li>Explains every score — open any order and it shows the five component bars and why each landed where it did.</li>
          <li>Tracks the pipeline: applied → won / lost, with notes and follow-ups, exportable to CSV for your own records.</li>
          <li>Dedupes across captures, so refreshing never gives you forty copies of the same job.</li>
        </ul>

        <h4>What it cannot do, and why</h4>
        <ul>
          <li><b>It cannot browse the platforms for you.</b> A static page on GitHub Pages cannot log in as you, cannot
              read another origin's DOM, and is blocked by CORS from calling their internal endpoints. That is a browser
              security boundary, not a missing feature. The Sidekick exists precisely to work <i>inside</i> that boundary
              — it runs on the page you already have open.</li>
          <li><b>There is no provider-side API to use.</b> Field Nation's REST API requires a Buyer account and an
              integration contract, and its endpoints are about work orders <i>you post</i>. WorkMarket's Open API is sold
              to the companies managing contractors. If that ever changes, <code>worker/poll.py</code> is already written
              for both and only needs credentials.</li>
          <li><b>It will not auto-submit applications.</b> Both platforms prohibit automated applying and providers lose
              accounts over it. WorkDesk gets you to the exact order in one click with the pitch on your clipboard; you
              press submit.</li>
          <li><b>Distances are estimates.</b> Straight-line miles × 1.22 for roads. When a platform posts coordinates the
              number is good; when it only posts a city you get a city centroid; when it only posts a state you get a
              state centroid and the card is badged <b>≈ dist</b> so you know not to trust it.</li>
          <li><b>$/hr on a flat-rate job is a guess</b> unless the posting includes a window or duration. It divides by
              your "typical job length" setting and says so in the tooltip. Fix the setting, fix the number.</li>
          <li><b>Selectors break.</b> The platforms change their pages. When capture stops working, the Sidekick's
              "Teach me the page" mode and the raw-capture dump on every order are how you (or the builder) fix it fast.</li>
        </ul>

        <h4>Terms of service — your responsibility</h4>
        <p>The Sidekick reads pages <b>you</b> are authenticated to view, at a human rate, and stores them locally. It does
        not scrape anonymously, bypass a login, or hit endpoints in a loop. Whether even that is acceptable is governed by
        your agreements with Field Nation and WorkMarket — <b>read them</b>. Nothing here is legal advice, and nothing here
        is designed to circumvent a technical protection measure.</p>

        <h4>Where the code lives</h4>
        <p class="mono small">${esc(location.href.split('#')[0])}</p>
      </div>`;
      body.appendChild(el('div', { class: 'wz-row' }, [
        el('button', { class: 'btn ghost', text: '📖 Setup guide', onclick: () => openDocs() }),
        el('button', { class: 'btn ghost', text: '🩺 Diagnostics', onclick: () => openSettings('diagnostics') }),
        el('button', { class: 'btn', text: '🚀 Advance the program', onclick: () => WD.wizard.advanceModal() })
      ]));
    });
  }

  function openDocs(anchor) {
    window.open(WD.appUrl('docs/SETUP.html') + (anchor || ''), '_blank', 'noopener');
  }

  /* ============================================================== API */
  WD.app = {
    boot, reload, rerank, render, getSettings, cachedSettings: () => SETTINGS || {},
    refreshChrome, setSetupPill, goTab, openSettings, openDocs, openDrawer, closeDrawer,
    fillTemplate, firstOpenOrder, loadSample, enableNotifications, setState, doApply,
    persist, resetFilters, sorted, filtered, scanForNotifications,
    get orders() { return ORDERS; }, get view() { return VIEW; }, get settings() { return SETTINGS; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
