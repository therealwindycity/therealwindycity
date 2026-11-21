/* Point-of-Order Exhibit — core harness (no dependencies).
   Loads the real data file + controller in a vm sandbox with a minimal DOM stub,
   then asserts matrix integrity, IRAC coverage, rebuttal timing, filtering,
   and controller wiring. Not shipped to the site; a dev check.

   usage: node tests/core.test.mjs                                  */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, note) {
  if (cond) { pass++; console.log('  ✓ ' + name + (note ? '  — ' + note : '')); }
  else { fail++; fails.push(name); console.log('  ✗ ' + name + (note ? '  — ' + note : '')); }
}
function section(t) { console.log('\n' + t); }

// ---------------------------------------------------------------- data
section('data file integrity');
const dataSrc = fs.readFileSync(path.join(ROOT, 'data', 'matrix.js'), 'utf8');
const sandbox = { console, globalThis: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(dataSrc, sandbox, { filename: 'matrix.js' });
const M = sandbox.POE_MATRIX;
ok('matrix module loads', !!M && Array.isArray(M.rows));
ok('VERSION present', !!(M.VERSION && /^\d+\.\d+\.\d+/.test(M.VERSION)), M.VERSION);

const errs = M.validate();
ok('validate() returns no errors', errs.length === 0, errs.length ? errs.join(' | ') : 'clean');

section('matrix shape');
ok('exactly 18 rows', M.rows.length === 18, 'got ' + M.rows.length);
const ids = M.rows.map(r => r.id);
ok('ids unique', new Set(ids).size === 18);
ok('ids sequential POE-01..POE-18',
  ids.every((id, i) => id === 'POE-' + String(i + 1).padStart(2, '0')), ids.join(','));

section('citation discipline');
ok('every row has a body', M.rows.every(r => r.body && r.body.length > 3));
ok('every row has a date', M.rows.every(r => r.date && r.date.length > 5));
ok('every row has a source', M.rows.every(r => r.source && r.source.length > 5));
ok('every row has a statute/authority', M.rows.every(r => r.statute && r.statute.length > 5));
ok('no invented clock timestamps in claim/record',
  M.rows.every(r => !/\b\d{1,2}:\d{2}:\d{2}\b/.test(r.claim + r.record)));
ok('no "TODO" or placeholder text', !JSON.stringify(M.rows).match(/TODO|TBD|XXX|lorem/i));
ok('every row carries >=1 repo source file',
  M.rows.every(r => Array.isArray(r.sources) && r.sources.length >= 1 &&
    r.sources.every(s => /\.md$/.test(s))));
// spot-check known sources exist on disk (sources are repo-root-relative)
const REPO = path.resolve(ROOT, '..');
const spot = ['highlands-timeline.md', 'docket-2026-08-24-gb.md',
  'miller-violations-register.md', 'drops-2026-08-24-wy-fresh-endgame.md'];
ok('spot-checked source files exist in repo',
  spot.every(f => fs.existsSync(path.join(REPO, f))), spot.join(', '));

section('IRAC coverage');
ok('every row has all four IRAC parts',
  M.rows.every(r => ['issue', 'rule', 'application', 'conclusion']
    .every(k => r.irac && r.irac[k] && r.irac[k].length > 40)));
ok('IRAC parts are distinct per row',
  M.rows.every(r => new Set([r.irac.issue, r.irac.rule, r.irac.application, r.irac.conclusion]).size === 4));

section('30-second rebuttal scripts');
const wcs = M.rows.map(r => ({ id: r.id, n: M.rebuttalWords(r) }));
ok('all rebuttals inside 55–90 words',
  wcs.every(w => w.n >= 55 && w.n <= 90),
  'min ' + Math.min(...wcs.map(w => w.n)) + ' max ' + Math.max(...wcs.map(w => w.n)));
ok('median in deliberate podium range (55–75)',
  (() => { const s = wcs.map(w => w.n).sort((a, b) => a - b); const m = s[9]; return m >= 55 && m <= 75; })(),
  'median checkpoint ' + wcs.map(w => w.n).sort((a, b) => a - b)[9]);
ok('REBUTTAL_SECONDS is 30', M.REBUTTAL_SECONDS === 30);

const tl = M.rebuttalTimeline(M.rows[0], 30);
ok('timeline yields one token per word', tl.length === M.rows[0].rebuttal.split(/\s+/).length);
ok('timeline spans exactly 30s', Math.abs(tl[tl.length - 1].end - 30) < 1e-9);
ok('timeline monotonic', tl.every((t, i) => i === 0 || t.start >= tl[i - 1].start));

section('filtering');
ok('filter by tag narrows results',
  M.filterRows('', 'annexation').length >= 2 && M.filterRows('', 'annexation').length < 18,
  M.filterRows('', 'annexation').length + ' rows');
ok('filter by text matches statute cite',
  M.filterRows('15-1-113', '').length >= 1);
ok('filter by text matches dollar figure',
  M.filterRows('1,119,258', '').length >= 1);
ok('filter by empty query returns all 18', M.filterRows('', '').length === 18);
ok('unknown tag returns 0', M.filterRows('', 'no-such-tag').length === 0);
ok('allTags() non-empty and sorted',
  M.allTags().length >= 10 && M.allTags().every((t, i, a) => i === 0 || a[i - 1] <= t),
  M.allTags().length + ' tags');
ok('findRow resolves', M.findRow('POE-08') && M.findRow('POE-08').statute.includes('16-4-403'));
ok('findRow misses return null', M.findRow('POE-99') === null);

section('supplied-matrix + repo-row provenance');
ok('rows 1–6 carry the supplied-matrix statutes',
  [M.rows[0].statute, M.rows[1].statute, M.rows[3].statute].every(s => /15-1-402|UDC|5\.7\.1/.test(s)),
  [M.rows[0].statute, M.rows[1].statute, M.rows[3].statute].join(' | '));
ok('row 8 carries the OMA pin-cite correction',
  M.rows[7].statute.includes('16-4-403') && /correction|anti-circumvention/i.test(M.rows[7].statute));
ok('seed cases present (pumphouse, exec-sess, censorship)',
  ['POE-07', 'POE-08', 'POE-09'].every(id => !!M.findRow(id)));
ok('seed dollar figure intact ($1,365,402.00)',
  JSON.stringify(M.rows[6]).includes('1,365,402'));

// ---------------------------------------------------------------- controller
section('controller wiring (vm + DOM stub)');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok('index.html loads matrix.js before exhibit.js',
  html.indexOf('data/matrix.js') !== -1 && html.indexOf('assets/exhibit.js') !== -1 &&
  html.indexOf('data/matrix.js') < html.indexOf('assets/exhibit.js'));
ok('index.html references the stylesheet', /assets\/exhibit\.css/.test(html));
ok('no external http(s) subresources (offline-safe)',
  !/(src|href)\s*=\s*["']https?:\/\//i.test(html),
  'all assets local');
ok('aria dialog stage present', /role="dialog"/.test(html) && /id="stage"/.test(html));

const css = fs.readFileSync(path.join(ROOT, 'assets', 'exhibit.css'), 'utf8');
ok('palette locked (bone/oxblood/pencil)',
  /#EDE7D9/.test(css) && /#A62B1C/.test(css) && /#24456B/.test(css));

// Minimal DOM stub: just enough for exhibit.js to boot without throwing.
function makeEl(tag) {
  return {
    tagName: (tag || 'div').toUpperCase(),
    className: '', textContent: '', innerHTML: '', value: '',
    style: {}, children: [], attrs: {}, listeners: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener() {},
    focus() {}, click() {},
    querySelector() { return makeEl('div'); },
    querySelectorAll() { return []; },
    scrollIntoView() {},
    get textContent() { return this._tc || ''; },
    set textContent(v) { this._tc = String(v); this.children = []; },
    get innerHTML() { return this._ih || ''; },
    set innerHTML(v) { this._ih = String(v); if (v === '') this.children = []; }
  };
}

const byId = {};
const idsNeeded = ['stats', 'chips', 'body', 'count', 'search', 'view-matrix', 'view-cards',
  'stage', 'stage-title', 'stage-where', 'stage-claim', 'teleprompter', 'dial', 'progress',
  'word-pos', 'play', 'reset', 'stage-close'];
for (const id of idsNeeded) byId[id] = makeEl('div');

const doc = {
  readyState: 'complete',
  querySelector(sel) {
    if (sel.startsWith('#')) return byId[sel.slice(1)] || null;
    return makeEl('div');
  },
  querySelectorAll() { return []; },
  createElement(t) { return makeEl(t); },
  createTextNode(t) { return { nodeType: 3, textContent: String(t) }; },
  addEventListener() {},
  body: makeEl('body')
};

const ctrl = {
  console,
  document: doc,
  location: { hash: '' },
  navigator: { clipboard: { writeText: async () => {} } },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  setTimeout, clearTimeout,
  globalThis: null
};
ctrl.window = ctrl;
ctrl.globalThis = ctrl;
// matrix module must be visible to the controller
ctrl.POE_MATRIX = M;
vm.createContext(ctrl);

let bootError = null;
try {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'exhibit.js'), 'utf8'),
    ctrl, { filename: 'exhibit.js' });
} catch (e) { bootError = e; }
ok('controller boots without throwing', !bootError, bootError ? String(bootError.message) : 'clean boot');
ok('controller found POE_MATRIX', !bootError && !!ctrl.POE_MATRIX);

// The matrix table should have been rendered into #body by init()
const rendered = byId['body'].children;
ok('init rendered content into #body', rendered.length > 0,
  rendered.length + ' top-level node(s)');

// search input listener registered
ok('search input has a listener',
  Array.isArray(byId['search'].listeners.input) && byId['search'].listeners.input.length === 1);

// stage controls registered
ok('play button wired', (byId['play'].listeners.click || []).length === 1);
ok('close wired', (byId['stage-close'].listeners.click || []).length === 1);

// Drive a search event and confirm re-render does not throw
let searchErr = null;
try {
  byId['search'].value = '15-1-113';
  byId['search'].listeners.input.forEach(fn => fn({ target: { value: '15-1-113' } }));
} catch (e) { searchErr = e; }
ok('search event re-renders without error', !searchErr,
  searchErr ? String(searchErr.message) : 'clean');

// ---------------------------------------------------------------- summary
console.log('\n' + '─'.repeat(50));
console.log(`POE core harness: ${pass} pass, ${fail} fail`);
if (fail) {
  console.log('Failed:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
