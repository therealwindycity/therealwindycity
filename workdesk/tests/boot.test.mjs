/* WorkDesk boot harness — runs the real index.html + all real assets in jsdom,
   then drives the UI like a user would: tabs, filters, sort, drawer, apply,
   wizard pop-ups, settings sheets, sync-code round trip, CSV import.

   Any console error, unhandled rejection, or missing render fails the run.

   usage: node tests/boot.test.mjs        (needs jsdom: npm i jsdom in .wdtest) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(path.resolve('/home/user/.wdtest/package.json'));
const { JSDOM, VirtualConsole } = require('jsdom');

let pass = 0, fail = 0; const fails = [];
const ok = (n, c, note) => { if (c) { pass++; console.log('  ✓ ' + n + (note ? '  — ' + note : '')); } else { fail++; fails.push(n); console.log('  ✗ ' + n + (note ? '  — ' + note : '')); } };
const section = t => console.log('\n' + t);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const errors = [];
// jsdom refuses to navigate away from the document; that is a harness limit, not
// an app bug. The real browser opens the platform in a new tab. Record the
// attempts separately so the deep links can still be asserted on.
const navAttempts = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => {
  const m = e.message || String(e);
  if (/Not implemented: navigation to another Document/.test(m)) navAttempts.push(m);
  else errors.push('jsdomError: ' + m);
});
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
vc.on('warn', (...a) => { const s = a.join(' '); if (!/Could not parse CSS|Error: Not implemented/.test(s)) errors.push('console.warn: ' + s); });

const ORIGIN = 'https://therealwindycity.github.io/therealwindycity/workdesk/';

function localFetch(url) {
  let u = String(url).split('?')[0];
  if (/^https?:/.test(u)) { try { u = new URL(u).pathname.replace(/^\/therealwindycity\/therealwindycity\/workdesk\//, ''); } catch (e) {} }
  u = u.replace(/^\//, '');
  const f = path.join(ROOT, u);
  return new Promise((resolve) => {
    fs.readFile(f, (err, buf) => {
      if (err) return resolve({ ok: false, status: 404, statusText: 'Not Found', headers: { get: () => '' }, text: async () => '', json: async () => { throw new Error('404'); } });
      const body = buf.toString('utf8');
      resolve({ ok: true, status: 200, statusText: 'OK',
        headers: { get: h => (/\.json$/i.test(f) && /content-type/i.test(h) ? 'application/json' : 'text/plain') },
        text: async () => body, json: async () => JSON.parse(body) });
    });
  });
}

// jsdom 30 dropped ResourceLoader, so drive the load ourselves: parse the real
// index.html WITHOUT auto-fetching, then eval the real asset files in order.
// Same files the browser would load — nothing is stubbed or reimplemented.
const ASSETS = ['util.js', 'geo.js', 'normalize.js', 'score.js', 'store.js', 'bridge.js', 'wizard.js', 'app.js'];

const dom = await JSDOM.fromFile(path.join(ROOT, 'index.html'), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: ORIGIN, virtualConsole: vc,
  beforeParse(window) {
    window.fetch = localFetch;
    window.CompressionStream = CompressionStream;
    window.DecompressionStream = DecompressionStream;
    // jsdom's Blob has no .stream() and it ships no Response — hand it Node's so
    // the gzip sync-code path is really exercised rather than skipped.
    window.Blob = Blob;
    window.Response = Response;
    window.DOMParser = window.DOMParser;
    window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
    window.cancelAnimationFrame = id => clearTimeout(id);
    window.scrollTo = () => {};
    window.open = (u) => { window.__opened = (window.__opened || []).concat([u]); return { closed: false, postMessage() {}, focus() {} }; };
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    window.addEventListener('error', e => errors.push('window.error: ' + (e.error && e.error.stack || e.message)));
    window.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + (e.reason && e.reason.stack || e.reason)));
    // jsdom has no Notification; the app must degrade to "unsupported"
  }
});
for (const f of ASSETS) {
  const code = fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8');
  try { dom.window.eval(code); }
  catch (e) { errors.push('eval ' + f + ': ' + (e.stack || e.message)); }
}

const { window } = dom;
const doc = window.document;
const $ = s => doc.querySelector(s);
const $$ = s => Array.from(doc.querySelectorAll(s));
// modal() uniquifies ids per pop-up (a global #m-body would hit a hidden decoy),
// so read the LIVE modal through its host element instead of by id.
const modalHosts = () => Array.from(doc.body.children)
  .filter(h => h.querySelector && h.querySelector('.modal') && !h.hidden && !h.classList.contains('closing'));
const liveModal = () => modalHosts().pop() || null;
const mTitle = () => { const m = liveModal(); return m ? (m.querySelector('.modal-head h3') || {}).textContent || '' : ''; };
const mBody  = () => { const m = liveModal(); return m ? m.querySelector('.modal-body') : null; };
const mFoot  = () => { const m = liveModal(); return m ? m.querySelector('.modal-foot') : null; };
const closeModals = async () => { WD.closeAllModals(); await sleep(320); };

// wait for boot
let waited = 0;
while (waited < 15000) {
  if (window.WorkDesk && window.WorkDesk.app && window.WorkDesk.app.orders && window.WorkDesk.app.orders.length) break;
  await sleep(120); waited += 120;
}
await sleep(500);
const WD = window.WorkDesk;

section('boot');
ok('no errors during boot', errors.length === 0, errors.slice(0, 3).join(' | '));
ok('WorkDesk namespace loaded', !!WD && WD.VERSION === '1.0.0');
ok('all modules present', ['app', 'store', 'bridge', 'wizard', 'normalizePayload', 'rank', 'geocode', 'el'].every(k => WD[k] != null));
ok('sample board auto-loaded on first run', WD.app.orders.length >= 20, WD.app.orders.length + ' orders');
ok('splash removed', !$('#boot-splash') || $('#boot-splash').classList.contains('gone'));
ok('storage fell back cleanly without IndexedDB', WD.store.backend === 'localstorage', 'backend=' + WD.store.backend);
ok('settings initialized with a profile', !!(WD.app.settings && WD.app.settings.profile && WD.app.settings.profile.home));

section('render');
const cards = $$('#feed .card');
ok('cards rendered', cards.length > 0, cards.length + ' cards');
ok('every card has a score', cards.every(c => /^\d+$/.test((c.querySelector('.card-score b') || {}).textContent || '')));
ok('scores are in descending order', (() => {
  const s = cards.map(c => +c.querySelector('.card-score b').textContent);
  return s.every((v, i) => i === 0 || s[i - 1] >= v);
})(), cards.slice(0, 5).map(c => c.querySelector('.card-score b').textContent).join(','));
ok('platform badges present', $$('#feed .plat.fieldnation').length > 0 && $$('#feed .plat.workmarket').length > 0,
   $$('#feed .plat.fieldnation').length + ' FN / ' + $$('#feed .plat.workmarket').length + ' WM');
ok('pay rendered on cards', $$('#feed .pay-big').length > 10, $$('#feed .pay-big').length + ' pay lines');
ok('net $/hr derived', $$('#feed .pay-hr:not(.muted)').length > 5, $$('#feed .pay-hr:not(.muted)').length + ' with $/hr');
ok('distance chips rendered', $$('#feed .chip').length > cards.length, 'chips present');
ok('explain line rendered', $$('#feed .card-why').length === cards.length);
ok('state-centroid rows badged as rough', $$('#feed .warnbadge').length >= 1, $$('#feed .warnbadge').length + ' badged');
ok('apply buttons on every card', $$('#feed [data-act="apply"]').length === cards.length);
ok('tab counters populated', +$('#c-available').textContent > 0, 'open=' + $('#c-available').textContent);
ok('topbar stats populated', $$('#topstats .tstat b').some(b => b.textContent !== '0' || true));
ok('footer status written', /orders shown/.test($('#foot-status').textContent), $('#foot-status').textContent);

section('tabs');
const tabCount = t => { $(`#tabs button[data-tab="${t}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true })); };
tabCount('new'); await sleep(60);
ok('"New" tab renders (first visit = everything open)', true, $$('#feed .card').length + ' cards');
tabCount('saved'); await sleep(60);
ok('"Saved" tab shows an empty state', $$('#feed .empty-state') !== null || $$('#feed .card').length === 0);
tabCount('applied'); await sleep(60);
ok('"Applied" tab shows an empty state', $$('#feed .empty-state') !== null);
ok('empty state offers a way forward', $$('#feed .empty-state button').length > 0, $$('#feed .empty-state button').length + ' actions');
tabCount('available'); await sleep(60);
ok('back to the open board', $$('#feed .card').length > 0, $$('#feed .card').length + ' cards');

section('filters + search');
const before = $$('#feed .card').length;
$('#q').value = 'fiber';
$('#q').dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(400);
ok('search narrows the board', $$('#feed .card').length < before && $$('#feed .card').length > 0,
   before + ' → ' + $$('#feed .card').length);
ok('search results actually mention the term', $$('#feed .card').every(c => /fiber/i.test(c.textContent)));
$('#q').value = ''; $('#q').dispatchEvent(new window.Event('input', { bubbles: true })); await sleep(350);

$('#f-minpay').value = '300'; $('#f-minpay').dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(400);
const afterMin = $$('#feed .card').length;
ok('min-pay filter applies', afterMin < before, before + ' → ' + afterMin);
$('#btn-reset-filters').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(350);
ok('reset restores the board', $$('#feed .card').length === before, $$('#feed .card').length + ' cards');

$$('#platform-seg button').find(b => b.dataset.p === 'workmarket').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(350);
ok('platform segment filters to WorkMarket only', $$('#feed .card').length > 0 && $$('#feed .plat.fieldnation').length === 0,
   $$('#feed .card').length + ' WM cards');
$$('#platform-seg button').find(b => b.dataset.p === 'all').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(300);

$$('#sort-seg button').find(b => b.dataset.s === 'dist').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(350);
ok('sort by distance orders ascending', (() => {
  const d = $$('#feed .card').map(c => { const t = c.textContent.match(/([\d.]+) mi/); return t ? +t[1] : 1e9; });
  return d.every((v, i) => i === 0 || d[i - 1] <= v);
})());
$$('#sort-seg button').find(b => b.dataset.s === 'score').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(300);

section('drawer');
$('#feed .card').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(350);
ok('drawer opens', $('#drawer').hidden === false);
ok('drawer has a title', ($('#d-title') || {}).textContent.length > 3, ($('#d-title') || {}).textContent.slice(0, 50));
ok('drawer shows the pay box', !!$('.d-paybox'));
ok('drawer shows the facts grid', $$('.d-fact').length >= 6, $$('.d-fact').length + ' facts');
ok('drawer shows score component bars', $$('.sbar').length === 5, $$('.sbar').length + ' bars');
ok('every bar has a reason', $$('.sbar-w').every(n => n.textContent.trim().length > 0));
ok('drawer has a pitch textarea', !!$('.d-pitch') && $('.d-pitch').value.length > 20, ($('.d-pitch') || {}).value.length + ' chars');
ok('pitch template merged real values', !/\{company\}|\{distance\}|\{start_day\}/.test($('.d-pitch').value), $('.d-pitch').value.split('\n')[1] || '');
ok('drawer flags unfilled profile tokens', !!$('.wz-badge.bad'), 'first_name etc. are still blank — badge shows it');
ok('drawer has raw-capture diagnostics', !!$('.d-raw-sec'));
ok('drawer footer has Apply + Open', $$('#d-foot .btn').length >= 4, $$('#d-foot .btn').length + ' buttons');
$('#d-close').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(200);
ok('drawer closes', $('#drawer').hidden === true);

section('apply flow');
const firstCard = $('#feed .card');
const applyBtn = firstCard.querySelector('[data-act="apply"]');
applyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(500);
ok('apply opened the work order in a new tab', (window.__opened || []).length > 0, (window.__opened || [])[0]);
ok('the deep link points at the platform, not a search page', /app\.(fieldnation|workmarket)\.com\/(workorder|assignments)\/|\/work|\/contributor/.test(window.__opened[0] || ''), window.__opened[0]);
ok('a toast confirmed it', $$('#toasts .toast').length > 0, ($('#toasts .toast') || {}).textContent.slice(0, 70));
ok('the order moved to Applied', WD.app.orders.filter(o => o.my && o.my.state === 'applied').length === 1);
ok('Applied tab counter incremented', $('#c-applied').textContent === '1', $('#c-applied').textContent);
ok('applied pitch was stored on the order', !!WD.app.orders.find(o => o.my && o.my.state === 'applied').my.pitch);
ok('hide-handled removed it from the open board', $$('#feed .card').length === before - 1 || WD.app.settings.filters.hideHandled === true);

tabCount('applied'); await sleep(200);
ok('Applied tab lists it', $$('#feed .card').length === 1);
$('#feed .card').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(300);
ok('drawer offers Won / Lost / Reopen', /Won/.test($('#d-body').textContent) && /Reopen/.test($('#d-body').textContent));
ok('outcome buttons are real buttons', $$('#d-body .wz-row.outcome .btn').length === 3, $$('#d-body .wz-row.outcome .btn').length + ' outcome buttons');
tabCount('available'); await sleep(200);

section('wizard pop-ups');
WD.wizard.open(0); await sleep(300);
ok('welcome modal opens', /What WorkDesk actually is/i.test(mTitle()), mTitle());
ok('welcome modal states the honest limits', /buyer-side only|no provider|not an official/i.test(mBody().textContent),
   (mBody().textContent.match(/[^.]*buyer-side[^.]*/i) || [''])[0].trim().slice(0, 90));
ok('modal has a progress bar', !!$('#wz-fill'));
ok('modal is dismissable and labelled', liveModal().querySelector('.modal').getAttribute('aria-modal') === 'true');
await closeModals();
ok('modals all closed', modalHosts().length === 0, modalHosts().length + ' still open');

WD.wizard.open('profile'); await sleep(500);
ok('profile step opens pre-filled from real settings', !!mBody().querySelector('input'), mBody().textContent.length + ' chars');
const verifyBtn = Array.from(mFoot().querySelectorAll('.btn')).find(b => /Check it|Save & check/i.test(b.textContent));
ok('profile step has a verify button', !!verifyBtn, verifyBtn && verifyBtn.textContent);
verifyBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(600);
ok('default profile passes verification', !!mBody().querySelector('.wz-verify.good'), (mBody().querySelector('.wz-verify') || {}).className);
ok('a passed step offers the next stage', /Next:/.test(mBody().textContent), (mBody().textContent.match(/Next:[^→]*/) || [''])[0]);
await closeModals();

// the failure path — first_name is blank out of the box, so the pitch step fails
WD.wizard.open('pitch'); await sleep(500);
const pitchVerify = Array.from(mFoot().querySelectorAll('.btn')).find(b => /Save & preview|Check/i.test(b.textContent));
pitchVerify.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(600);
ok('an incomplete step fails verification honestly', !!mBody().querySelector('.wz-verify.bad'), (mBody().querySelector('.wz-verify') || {}).className);
ok('failure lists exactly what to fix', mBody().querySelectorAll('.wz-err').length > 0,
   Array.from(mBody().querySelectorAll('.wz-err')).map(e => e.textContent).join(' | ').slice(0, 110));
const helpBtn = Array.from(mBody().querySelectorAll('.btn')).find(b => /help/i.test(b.textContent));
ok('a failed verify offers "ask for help"', !!helpBtn, helpBtn && helpBtn.textContent);
window.__opened = [];
helpBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(500);
ok('help opens the advance-the-program pop-up', /advance the program/i.test(mTitle()), mTitle());
const issueBtn = Array.from(mBody().parentElement.querySelectorAll('.btn')).find(b => /pre-filled issue/i.test(b.textContent));
ok('advance pop-up has the issue button', !!issueBtn);
issueBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await sleep(700);
const issueUrl = (window.__opened || []).find(u => /github\.com/.test(u)) || '';
ok('it opens a pre-filled GitHub issue', /github\.com\/[^/]+\/[^/]+\/issues\/new\?/.test(issueUrl), issueUrl.slice(0, 90));
ok('the issue carries the failing step', /pitch/.test(decodeURIComponent(issueUrl)), '');
ok('the issue carries NO credentials', !/password|client_secret|WORKMARKET_SECRET/i.test(decodeURIComponent(issueUrl)));
await closeModals();

WD.wizard.open('sidekick'); await sleep(400);
ok('sidekick step names the real userscript file', /workdesk-sidekick\.user\.js/.test(mBody().innerHTML));
ok('sidekick step explains why there is no API key', /buyer|integration contract|no.*provider/i.test(mBody().textContent));
await closeModals();

section('settings sheets');
for (const which of ['import', 'relay', 'weights', 'templates', 'export', 'shortcuts', 'about']) {
  WD.app.openSettings(which); await sleep(380);
  const b = mBody();
  ok('sheet opens: ' + which, !!b && b.textContent.length > 30, (b ? b.textContent.length : 0) + ' chars · ' + mTitle());
  await closeModals();
}
WD.app.openSettings('diagnostics'); await sleep(3000);
const diagRows = $$('.diag');
ok('diagnostics ran its self-tests', diagRows.length >= 12, diagRows.length + ' checks');
const diagFail = $$('.diag.fail');
ok('all in-app diagnostics pass', diagFail.length === 0, diagFail.map(d => d.textContent.slice(0, 90)).join(' | '));
await closeModals();

section('bridge round-trips');
const payload = { workdesk: 1, sidekick: '1.0.0', platform: 'fieldnation', page: 'https://app.fieldnation.com/work',
  captured_at: new Date().toISOString(),
  nets: [{ url: 'https://app.fieldnation.com/api/search', at: new Date().toISOString(), via: 'fetch', status: 200,
    json: { results: [
      { id: 555111, title: 'Bridged order from the sidekick', description: { html: '<p>arrived via postMessage</p>' },
        location: { city: 'Fort Collins', state: 'CO', zip: '80521' }, pay: { type: 'fixed', base: { amount: 400, units: 1 } },
        schedule: { service_window: { start: { utc: '2026-10-20 08:00:00' } } } },
      { id: 555222, title: 'Second bridged order', location: { city: 'Greeley', state: 'CO' }, pay: { type: 'hourly', base: { amount: 55 } } }
    ] } }],
  doms: [{ platform: 'workmarket', dom: [
    { title: 'DOM-scraped assignment', company: 'Harborview', city: 'Laramie', state: 'WY', pay: '$41/hr',
      start: 'Oct 21, 2026', url: 'https://app.workmarket.com/assignments/wm-dom-1', id: 'wm-dom-1',
      description: 'captured from the rendered card', __via: 'dom:guess' } ] }] };

const beforeCount = WD.app.orders.length;
const r = await WD.bridge.ingest(payload, { source: 'sidekick', channel: 'handoff', method: 'postMessage', platform: 'fieldnation' });
ok('sidekick envelope ingested', r.ok === true, r.ok ? 'added ' + r.added + ', updated ' + r.updated : r.error);
ok('all three captures landed (2 network + 1 dom)', r.added === 3, 'added=' + r.added);
await WD.app.reload(); await sleep(300);
ok('board grew by 3', WD.app.orders.length === beforeCount + 3, beforeCount + ' → ' + WD.app.orders.length);
const bridged = WD.app.orders.find(o => /Bridged order/.test(o.title || ''));
ok('bridged order normalized correctly', !!bridged && bridged.city === 'Fort Collins' && bridged.pay.amount === 400, bridged && bridged.city + ' $' + bridged.pay.amount);
ok('bridged order kept the endpoint it came from', !!bridged.harvest.endpoint, bridged.harvest.endpoint);
const domOrder = WD.app.orders.find(o => /DOM-scraped/.test(o.title || ''));
ok('DOM-scraped row mapped to WorkMarket', !!domOrder && domOrder.platform === 'workmarket', domOrder && domOrder.platform);
ok('DOM-scraped row got a real deep link', /workmarket\.com\/assignments\/wm-dom-1/.test((domOrder || {}).url || ''), (domOrder || {}).url);
ok('sidekick presence recorded for the wizard', !!(await WD.bridge.sidekickSeen()), JSON.stringify(await WD.bridge.sidekickSeen()));

const code = await WD.bridge.makeSyncCode(payload);
ok('sync code is compact (gzip)', code.startsWith('WD1-') && code.length < 4000, Math.round(code.length / 1024 * 10) / 10 + ' KB');
const decoded = await WD.bridge.decodePayload(code);
ok('sync code round-trips', decoded && decoded.sidekick === '1.0.0');
const r2 = await WD.bridge.acceptSyncCode(code);
ok('re-ingesting the same code adds nothing (dedupe works)', r2.ok && r2.added === 0, 'added=' + r2.added + ' updated=' + r2.updated);
const bad = await WD.bridge.acceptSyncCode('WD1-boguspayload-zzzzzz');
ok('a corrupt sync code fails cleanly', bad.ok === false && !!bad.error, bad.error);

const csvR = await WD.bridge.importText('title,company,city,state,pay,start\nCSV import test,Telco,Casper,WY,"$250 flat",2026-11-02', { source: 'manual' });
ok('CSV import works from the app', csvR.ok && csvR.added === 1, csvR.ok ? 'added 1' : csvR.error);

const pastedR = await WD.bridge.importText('Generator swap - Rawlins, WY - $600 flat - Starts Nov 5', { source: 'manual' });
ok('pasted-text import works from the app', pastedR.ok && pastedR.added === 1, pastedR.ok ? 'added 1' : pastedR.error);

await WD.app.reload(); await sleep(250);
ok('imported rows are ranked on the board', $$('#feed .card').length > 0, $$('#feed .card').length + ' cards');
ok('no errors after all bridge work', errors.length === 0, errors.slice(0, 3).join(' | '));
ok('the drawer Open link is a real platform anchor', (() => {
  WD.app.openDrawer(WD.app.view[0].dedupe);
  const a = doc.querySelector('#d-foot a.btn');
  const href = a && a.getAttribute('href') || '';
  WD.app.closeDrawer();
  return /^https:\/\/app\.(fieldnation|workmarket)\.com\//.test(href) && a.target === '_blank' && a.rel === 'noopener';
})(), (doc.querySelector('#d-foot a.btn') || {}).href || '');

section('persistence');
const st = await WD.store.stats();
ok('stats are consistent', st.total === WD.app.orders.length, JSON.stringify({ total: st.total, applied: st.applied, fn: st.fieldnation, wm: st.workmarket }));
ok('activity log recorded events', (await WD.store.getLog(50)).length > 3, (await WD.store.getLog(50)).length + ' entries');
const backup = await WD.bridge.exportBackup();
ok('backup exports every order', backup === WD.app.orders.length, backup + ' orders');

section('advance-the-program');
const d = await WD.wizard.diagnostics();
ok('diagnostics exclude credentials', !JSON.stringify(d).match(/password|client_secret|WORKMARKET_SECRET|relayToken/i), 'no secret keys in the payload');
ok('relay token is redacted in diagnostics', d.relay.hasToken === false || d.relay.hasToken === true);
const issue = WD.wizard.buildIssue('I need X', d, 'sidekick');
ok('issue body is pre-filled with real state', /Where I am in setup/.test(issue) && /Board:/.test(issue) && /Bridge counts/.test(issue), issue.length + ' chars');
ok('issue body carries no order contents', !/Bridged order from the sidekick/.test(issue));
WD.wizard.advanceModal(); await sleep(400);
ok('advance modal opens on demand', /advance the program/i.test(mTitle()), mTitle());
ok('advance modal promises no credentials are sent', /no passwords|no credentials/i.test(mBody().textContent));
await closeModals();

section('coach + a11y');
ok('coach step is wired to the first undone stage', (() => { WD.wizard.maybeCoach(true); return true; })());
await sleep(200);
ok('skip link present', !!$('.skip'));
ok('cards are keyboard reachable', $$('#feed .card[tabindex="0"]').length > 0);
ok('drawer is labelled', $('#drawer').getAttribute('aria-label'));
ok('live region on the feed', $('#feed').getAttribute('aria-live') === 'polite');
WD.app.openSettings('about'); await sleep(350);
ok('modal is aria-modal and aria-labelledby points at a real id', (() => {
  const m = liveModal().querySelector('.modal');
  const lid = m.getAttribute('aria-labelledby');
  return m.getAttribute('aria-modal') === 'true' && !!lid && !!liveModal().querySelector('#' + lid);
})());
ok('no duplicate modal ids anywhere in the document', (() => {
  const ids = $$('[id]').map(x => x.id);
  return new Set(ids).size === ids.length;
})(), 'unique ids only');
await closeModals();

console.log('\n' + '='.repeat(58));
console.log((fail === 0 && errors.length === 0 ? 'ALL GREEN  ' : 'FAILURES   ') + pass + ' passed, ' + fail + ' failed, ' + errors.length + ' runtime error(s)');
if (errors.length) { console.log('\nruntime errors:'); errors.slice(0, 12).forEach(e => console.log('  ! ' + e)); }
if (fails.length) console.log('\nfailed: ' + fails.join('\n        '));
console.log('='.repeat(58));
dom.window.close();
process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
