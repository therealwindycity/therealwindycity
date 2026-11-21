/* Point-of-Order Exhibit — UI controller
   Renders the 18-row matrix, IRAC detail, and the interactive 30-second
   podium rebuttal (karaoke teleprompter). No network, no build step. */

(function () {
  'use strict';

  const M = globalThis.POE_MATRIX;
  if (!M) throw new Error('POE_MATRIX missing — load data/matrix.js first');

  const state = {
    q: '',
    tag: '',
    view: 'matrix',      // 'matrix' | 'cards'
    open: null,          // expanded row id
    stage: null,         // row id loaded in rebuttal stage
    playing: false,
    t0: 0,               // performance.now() at play
    elapsed: 0,          // frozen seconds when paused
    raf: 0
  };

  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };

  // ---------- stats ----------
  function renderStats() {
    const strip = $('#stats');
    strip.innerHTML = '';
    const errs = M.validate();
    const facts = [
      ['ROWS', M.rows.length],
      ['TAGS', M.allTags().length],
      ['BODIES', M.allBodies().length],
      ['REBUTTAL', M.REBUTTAL_SECONDS + 's'],
      ['VALIDATE', errs.length === 0 ? 'PASS' : errs.length + ' FAIL']
    ];
    for (const [k, v] of facts) {
      const s = el('div', 'stat');
      s.appendChild(el('b', null, String(v)));
      s.appendChild(document.createTextNode(' ' + k));
      strip.appendChild(s);
    }
    if (errs.length) console.error('POE validate:', errs);
  }

  // ---------- chips ----------
  function renderChips() {
    const box = $('#chips');
    box.innerHTML = '';
    const mk = (label, val, kind) => {
      const b = el('button', 'chip', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state[kind] === val));
      b.addEventListener('click', () => {
        state[kind] = state[kind] === val ? '' : val;
        renderChips();
        renderBody();
      });
      return b;
    };
    box.appendChild(mk('ALL', '', 'tag'));
    for (const t of M.allTags()) box.appendChild(mk(t, t, 'tag'));
  }

  // ---------- filtering ----------
  function visibleRows() { return M.filterRows(state.q, state.tag); }

  // ---------- IRAC detail block ----------
  function buildDetail(row) {
    const td = document.createElement('td');
    td.colSpan = 5;

    const irac = el('div', 'irac');
    const cells = [
      ['ISSUE', row.irac.issue, ''],
      ['RULE', row.irac.rule, 'rule'],
      ['APPLICATION', row.irac.application, ''],
      ['CONCLUSION', row.irac.conclusion, 'conclusion']
    ];
    for (const [h, body, cls] of cells) {
      const c = el('div', 'irac-cell' + (cls ? ' ' + cls : ''));
      c.appendChild(el('h4', null, h));
      c.appendChild(el('p', null, body));
      irac.appendChild(c);
    }
    td.appendChild(irac);

    const lever = el('div', 'lever');
    lever.appendChild(el('b', null, 'Actionable leverage'));
    lever.appendChild(el('span', null, row.leverage));
    td.appendChild(lever);

    const src = el('div', 'sources', 'SOURCES: ' + row.sources.join(' · '));
    td.appendChild(src);

    const acts = el('div', 'actions');
    const runBtn = el('button', 'btn red', '▶ Run 30s rebuttal');
    runBtn.type = 'button';
    runBtn.addEventListener('click', e => { e.stopPropagation(); openStage(row.id); });
    const copyBtn = el('button', 'btn ghost', 'Copy rebuttal');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(row.rebuttal);
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy rebuttal'; }, 1400);
      } catch (_) {
        copyBtn.textContent = 'Copy blocked';
        setTimeout(() => { copyBtn.textContent = 'Copy rebuttal'; }, 1400);
      }
    });
    acts.appendChild(runBtn);
    acts.appendChild(copyBtn);
    td.appendChild(acts);

    return td;
  }

  // ---------- matrix view ----------
  function renderMatrix(rows) {
    const host = $('#body');
    host.innerHTML = '';
    if (!rows.length) {
      host.appendChild(el('div', 'empty', 'No rows match. Clear the search or tag filter.'));
      return;
    }
    const table = el('table', 'matrix');
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const h of ['ID', 'Date / Body', 'Spoken representation', 'Statute / leverage', '']) {
      hr.appendChild(el('th', null, h));
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tb = document.createElement('tbody');
    for (const row of rows) {
      const tr = el('tr', 'row' + (state.open === row.id ? ' open' : ''));
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-expanded', String(state.open === row.id));
      const toggle = () => {
        state.open = state.open === row.id ? null : row.id;
        renderBody();
      };
      tr.addEventListener('click', toggle);
      tr.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });

      tr.appendChild(el('td', 'c-id', row.id));
      const meta = document.createElement('td');
      meta.appendChild(el('div', 'c-date', row.date));
      meta.appendChild(el('div', 'c-body', row.body));
      meta.appendChild(el('div', null, row.source));
      tr.appendChild(meta);

      const spoken = document.createElement('td');
      const claim = el('span', 'claim', row.claim);
      const record = el('span', 'record', row.record);
      spoken.appendChild(claim);
      spoken.appendChild(record);
      const tags = el('div', 'tagline');
      for (const t of row.tags) tags.appendChild(el('span', 'tag', t));
      spoken.appendChild(tags);
      tr.appendChild(spoken);

      const law = document.createElement('td');
      law.appendChild(el('div', 'c-statute', row.statute));
      const lev = el('div', null, row.leverage);
      lev.style.fontSize = '13px';
      lev.style.marginTop = '6px';
      law.appendChild(lev);
      tr.appendChild(law);

      tr.appendChild(el('td', 'c-id', state.open === row.id ? '▾' : '▸'));
      tb.appendChild(tr);

      if (state.open === row.id) {
        const dr = el('tr', 'detail');
        dr.appendChild(buildDetail(row));
        tb.appendChild(dr);
      }
    }
    table.appendChild(tb);
    host.appendChild(table);
  }

  // ---------- card view ----------
  function renderCards(rows) {
    const host = $('#body');
    host.innerHTML = '';
    if (!rows.length) {
      host.appendChild(el('div', 'empty', 'No rows match. Clear the search or tag filter.'));
      return;
    }
    const grid = el('div', 'cards');
    for (const row of rows) {
      const card = el('div', 'card');
      card.appendChild(el('div', 'bar'));
      const inner = el('div', 'inner');
      inner.appendChild(el('h3', null, row.id + ' — ' + row.statute));
      inner.appendChild(el('div', 'meta', row.date + ' · ' + row.body));
      const snip = el('div', 'snippet');
      snip.appendChild(document.createTextNode(row.claim));
      snip.appendChild(el('span', 'record', row.record));
      inner.appendChild(snip);
      const acts = el('div', 'actions');
      const openBtn = el('button', 'btn ghost', 'IRAC');
      openBtn.type = 'button';
      openBtn.addEventListener('click', () => {
        state.view = 'matrix';
        state.open = row.id;
        syncViewButtons();
        renderBody();
        const target = document.querySelector('tr.row.open');
        if (target) target.scrollIntoView({ block: 'center' });
      });
      const runBtn = el('button', 'btn red', '▶ 30s');
      runBtn.type = 'button';
      runBtn.addEventListener('click', () => openStage(row.id));
      acts.appendChild(openBtn);
      acts.appendChild(runBtn);
      inner.appendChild(acts);
      card.appendChild(inner);
      grid.appendChild(card);
    }
    host.appendChild(grid);
  }

  function renderBody() {
    const rows = visibleRows();
    $('#count').textContent = rows.length + ' / ' + M.rows.length + ' rows';
    if (state.view === 'cards') renderCards(rows);
    else renderMatrix(rows);
  }

  function syncViewButtons() {
    $('#view-matrix').setAttribute('aria-pressed', String(state.view === 'matrix'));
    $('#view-cards').setAttribute('aria-pressed', String(state.view === 'cards'));
  }

  // ---------- rebuttal stage ----------
  // Statute / dollar tokens get the red "hot" treatment in the teleprompter.
  const HOT_WORD = /(\$[\d,]|§|Stat\.|\bUDC\b|\bRONR\b|Amendment|\bWyo\b)/i;

  function openStage(id) {
    const row = M.findRow(id);
    if (!row) return;
    state.stage = id;
    stopClock(true);

    $('#stage-title').textContent = row.id + ' — 30-Second Podium Rebuttal';
    $('#stage-where').textContent = row.date + ' · ' + row.body + ' · ' + row.statute;

    const claimBox = $('#stage-claim');
    claimBox.innerHTML = '';
    claimBox.appendChild(el('b', null, 'On the record (' + row.source + ')'));
    claimBox.appendChild(document.createTextNode(row.claim));

    // build teleprompter words
    const tp = $('#teleprompter');
    tp.innerHTML = '';
    for (const w of row.rebuttal.split(/\s+/).filter(Boolean)) {
      const s = el('span', 'w', w);
      if (HOT_WORD.test(w) || /\$?\d[\d,]*\.\d\d/.test(w)) {
        s.classList.add('hot');
      }
      tp.appendChild(s);
    }

    $('#stage').classList.add('on');
    $('#stage').focus();
    updateClockUI(0);
  }

  function closeStage() {
    stopClock(true);
    $('#stage').classList.remove('on');
    state.stage = null;
  }

  function totalWords() { return document.querySelectorAll('#teleprompter .w').length; }

  function updateClockUI(elapsed) {
    const remain = Math.max(0, M.REBUTTAL_SECONDS - elapsed);
    const dial = $('#dial');
    dial.textContent = remain.toFixed(remain < 10 && state.playing ? 1 : 0);
    dial.classList.toggle('run', state.playing && remain > 0);
    dial.classList.toggle('done', remain <= 0);
    $('#progress').style.width = Math.min(100, (elapsed / M.REBUTTAL_SECONDS) * 100) + '%';

    const words = document.querySelectorAll('#teleprompter .w');
    const n = words.length;
    const idx = Math.min(n, Math.floor((elapsed / M.REBUTTAL_SECONDS) * n));
    words.forEach((w, i) => {
      w.classList.toggle('spoken', i < idx);
      w.classList.toggle('live', state.playing && i === idx && idx < n);
    });
    $('#word-pos').textContent = Math.min(n, idx) + ' / ' + n + ' words';
  }

  function tick() {
    if (!state.playing) return;
    const elapsed = state.elapsed + (performance.now() - state.t0) / 1000;
    if (elapsed >= M.REBUTTAL_SECONDS) {
      state.playing = false;
      state.elapsed = M.REBUTTAL_SECONDS;
      updateClockUI(M.REBUTTAL_SECONDS);
      $('#play').textContent = '↻ Restart';
      return;
    }
    updateClockUI(elapsed);
    state.raf = requestAnimationFrame(tick);
  }

  function play() {
    if (state.elapsed >= M.REBUTTAL_SECONDS) state.elapsed = 0;
    state.playing = true;
    state.t0 = performance.now();
    $('#play').textContent = '⏸ Pause';
    state.raf = requestAnimationFrame(tick);
  }

  function pause() {
    if (!state.playing) return;
    state.elapsed += (performance.now() - state.t0) / 1000;
    state.playing = false;
    cancelAnimationFrame(state.raf);
    $('#play').textContent = '▶ Resume';
    updateClockUI(state.elapsed);
  }

  function stopClock(reset) {
    state.playing = false;
    cancelAnimationFrame(state.raf);
    state.elapsed = 0;
    if (reset) {
      $('#play').textContent = '▶ Start';
      const dial = $('#dial');
      if (dial) { dial.textContent = '30'; dial.classList.remove('run', 'done'); }
      const p = $('#progress');
      if (p) p.style.width = '0%';
    }
  }

  // ---------- wiring ----------
  function init() {
    renderStats();
    renderChips();
    syncViewButtons();
    renderBody();

    $('#search').addEventListener('input', e => {
      state.q = e.target.value;
      renderBody();
    });

    $('#view-matrix').addEventListener('click', () => {
      state.view = 'matrix'; syncViewButtons(); renderBody();
    });
    $('#view-cards').addEventListener('click', () => {
      state.view = 'cards'; syncViewButtons(); renderBody();
    });

    $('#play').addEventListener('click', () => {
      if (state.playing) pause();
      else play();
    });
    $('#reset').addEventListener('click', () => {
      stopClock(true);
      $('#play').textContent = '▶ Start';
      const words = document.querySelectorAll('#teleprompter .w');
      words.forEach(w => w.classList.remove('spoken', 'live'));
      updateClockUI(0);
      $('#dial').textContent = '30';
      $('#progress').style.width = '0%';
    });
    $('#stage-close').addEventListener('click', closeStage);
    $('#stage').addEventListener('click', e => {
      if (e.target === $('#stage')) closeStage();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && $('#stage').classList.contains('on')) closeStage();
      if (e.key === ' ' && $('#stage').classList.contains('on')) {
        e.preventDefault();
        if (state.playing) pause(); else play();
      }
    });

    // deep-link: #POE-07 opens that row
    const hash = (location.hash || '').replace('#', '');
    if (hash && M.findRow(hash)) {
      state.open = hash;
      renderBody();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
