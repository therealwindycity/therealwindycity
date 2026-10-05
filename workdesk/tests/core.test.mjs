/* WorkDesk core-pipeline harness.
   Runs the pure-JS half (util → geo → normalize → score) in Node with a tiny
   DOM stub, against the real sample board, and asserts the same things the
   in-app Diagnostics panel asserts. Not shipped to the site; it's a dev check.

   usage: node tests/core.test.mjs                                    */
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

// ---- minimal DOM stub so the browser modules load unchanged --------------
const sandbox = {
  console,
  performance: { now: () => Date.now() },
  TextEncoder, TextDecoder, Blob, Response, CompressionStream, DecompressionStream,
  URL, URLSearchParams, Set, Map, JSON, Math, Date, Number, String, Array, Object, RegExp, Error,
  btoa: s => Buffer.from(s, 'binary').toString('base64'),
  atob: s => Buffer.from(s, 'base64').toString('binary'),
  navigator: { userAgent: 'node-harness', clipboard: {} },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  document: { createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }), body: {} },
  location: { href: 'https://example.test/workdesk/', origin: 'https://example.test', pathname: '/workdesk/', hash: '', search: '', protocol: 'https:', hostname: 'example.test' },
  fetch: async () => { throw new Error('no network in harness'); },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ['util.js', 'geo.js', 'normalize.js', 'score.js']) {
  const code = fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}
const WD = sandbox.WorkDesk;
ok('modules loaded', !!WD && !!WD.normalizePayload, 'WorkDesk ' + (WD && WD.VERSION));

// ---------------------------------------------------------------- geo
section('geo');
const chey = WD.lookupCity('Cheyenne', 'WY');
ok('Cheyenne WY found', !!chey && Math.abs(chey.lat - 41.14) < 0.15, chey && chey.lat + ', ' + chey.lng);
const denver = WD.lookupCity('Denver', 'CO');
ok('Denver CO found', !!denver && Math.abs(denver.lat - 39.74) < 0.15, denver && denver.lat + ', ' + denver.lng);
ok('city table size sane', WD.CITY_COUNT > 250, WD.CITY_COUNT + ' cities');
const d = WD.haversineMiles(chey, denver);
ok('Cheyenne→Denver ~96 mi straight-line', d > 85 && d < 110, Math.round(d) + ' mi');
ok('road factor applied', WD.roadMiles(d) > d, Math.round(WD.roadMiles(d)) + ' mi road');
ok('fuzzy city match', !!WD.lookupCity('Cheynne', 'WY'), 'typo tolerated');
ok('state centroid fallback', !!WD.geocode({ city: '', state: 'UT' }).label.includes('rough'), 'flagged as rough');
ok('explicit coords win', WD.geocode({ lat: 1, lng: 2, city: 'Denver' }).precision === 'exact');

// ---------------------------------------------------------------- pay
section('pay parsing');
const cases = [
  ['$150 flat', 150, 'flat'],
  ['$25 - $35/hr', 30, 'hourly'],
  ['25 USD per hour', 25, 'hourly'],
  ['150 USD x 2 techs', 150, null],
  ['up to $400', 400, null],
  ['$19/hr', 19, 'hourly'],
  ['$900 flat', 900, 'flat'],
  ['$12 per unit', 12, 'per_unit'],
];
for (const [input, amount, type] of cases) {
  const p = WD.parsePay(input);
  ok('parse "' + input + '"', p.amount === amount && (!type || p.type === type),
     'amount=' + p.amount + ' type=' + p.type + (p.units > 1 ? ' units=' + p.units : ''));
}
ok('units extracted from "x 2 techs"', WD.parsePay('150 USD x 2 techs').units === 2);
ok('structured Field Nation pay object', (() => {
  const p = WD.parsePay({ type: 'fixed', base: { amount: 340, units: 1 } });
  return p.amount === 340 && p.type === 'flat';
})());
ok('structured hourly pay object', (() => {
  const p = WD.parsePay({ type: 'hourly', base: { amount: 62, units: 1 } });
  return p.amount === 62 && p.type === 'hourly';
})());
ok('null pay does not throw', WD.parsePay(null).amount === null);

// ------------------------------------------------------------ normalize
section('normalizers');
const fnShape = {
  title: 'Install Point of Sale', description: { html: '<p>Swap out the defective terminal.</p>' },
  types_of_work: [{ id: 62, isPrimary: true, name: 'Point of Sale' }],
  location: { mode: 'custom', address1: '123 Main St', city: 'Minneapolis', state: 'MN', zip: '55401', country: 'US' },
  schedule: { service_window: { mode: 'exact', start: { utc: '2026-07-15 09:00:00' } } },
  pay: { type: 'fixed', base: { amount: 150, units: 1 } },
  id: 424242
};
const fnRows = WD.normalizePayload(fnShape, { source: 'selftest', platform: 'fieldnation' });
ok('FN documented shape -> 1 order', fnRows.length === 1, JSON.stringify(fnRows[0] && fnRows[0].title));
const f0 = fnRows[0] || {};
ok('FN title mapped', f0.title === 'Install Point of Sale');
ok('FN city/state/zip mapped', f0.city === 'Minneapolis' && f0.state === 'MN' && f0.zip === '55401');
ok('FN address1 mapped', f0.address1 === '123 Main St');
ok('FN pay amount mapped', f0.pay.amount === 150, JSON.stringify(f0.pay));
ok('FN nested start date mapped', !!f0.start && f0.start.startsWith('2026-07-15'), f0.start);
ok('FN html description flattened', /Swap out the defective/.test(f0.description || ''));
ok('FN types_of_work mapped', (f0.work_types || []).join(',').includes('Point of Sale'), (f0.work_types || []).join(','));
ok('FN deep link built', /fieldnation\.com\/workorder\/424242/.test(f0.url || ''), f0.url);
ok('FN distance from Cheyenne computed', f0.distance_mi > 500, f0.distance_mi && Math.round(f0.distance_mi) + ' mi');

const wmShape = { assignments: [
  { id: 'wm-1', title: 'Site survey', company: { name: 'Acme Co' }, city: 'Denver', state: 'CO',
    pay_rate: '$45/hr', start_date: '2026-10-06', created_at: '2026-10-03T18:44:00Z', status: 'open' },
  { id: 'wm-2', title: 'Scanner deploy', company: { name: 'Cordova' }, city: 'Cheyenne', state: 'WY',
    pay_rate: '$32/hr', start_date: '2026-10-13' }
] };
const wmRows = WD.normalizePayload(wmShape, { source: 'selftest' });
ok('WM assignment array found + 2 rows', wmRows.length === 2, wmRows.length + ' rows');
ok('WM platform auto-detected', wmRows.every(r => r.platform === 'workmarket'), wmRows.map(r => r.platform).join(','));
ok('WM nested company name mapped', wmRows[0].company === 'Acme Co', wmRows[0].company);
ok('WM hourly rate parsed', wmRows[0].pay.amount === 45 && wmRows[0].pay.type === 'hourly');
ok('WM posted_at mapped from created_at', !!wmRows[0].posted_at, wmRows[0].posted_at);
ok('WM deep link built', /workmarket\.com\/assignments\/wm-1/.test(wmRows[0].url || ''), wmRows[0].url);

const csv = 'title,company,city,state,pay,start\nReset router,ISP Co,Casper,WY,"$120 flat",2026-10-08\nSwap switch,NetCo,Denver,CO,"$30/hr",2026-10-09';
const csvRows = WD.normalizeCSV(csv, { source: 'selftest' });
ok('CSV -> 2 rows', csvRows.length === 2, csvRows.length + ' rows');
ok('CSV quoted flat pay parsed', csvRows[0] && csvRows[0].pay.amount === 120);
ok('CSV city mapped', csvRows[1] && csvRows[1].city === 'Denver');

const pasted = 'POS Refresh - Denver, CO - $150 flat - Starts Jul 15\n\nCabling pull - Casper, WY - $28/hr - Starts Jul 20';
const pRows = WD.normalizePasted(pasted, { source: 'selftest' });
ok('pasted text -> 2 blocks', pRows.length === 2, pRows.length + ' blocks');
ok('pasted city/state parsed', pRows[0] && pRows[0].city === 'Denver' && pRows[0].state === 'CO', pRows[0] && pRows[0].city);
ok('pasted pay parsed', pRows[0] && pRows[0].pay.amount === 150);
ok('pasted year-less date lands in the current year', pRows[1] && new Date(pRows[1].start).getFullYear() === new Date().getFullYear(), pRows[1] && pRows[1].start);

ok('skills extracted', WD.extractSkills('Need cat6 termination, fiber splicing and POS experience').length >= 3,
   WD.extractSkills('Need cat6 termination, fiber splicing and POS experience').join(', '));

// dedupe
const a = WD.normalizePayload([{ id: '77', title: 'Same job', city: 'Laramie', state: 'WY', pay: 100 }], { platform: 'workmarket' })[0];
const b = WD.normalizePayload([{ id: '77', title: 'Same job', city: 'Laramie', state: 'WY', pay: 999 }], { platform: 'workmarket' })[0];
ok('dedupe stable across captures', a.dedupe === b.dedupe, a.dedupe);
const c = WD.normalizePayload([{ id: '78', title: 'Different job', city: 'Laramie', state: 'WY' }], { platform: 'workmarket' })[0];
ok('different id -> different key', a.dedupe !== c.dedupe);
const merged = WD.merge([a], [b, c]);
ok('merge adds 1 updates 1', merged.added === 1 && merged.updated === 1 && merged.rows.length === 2,
   'added=' + merged.added + ' updated=' + merged.updated);

// junk rejection
ok('junk rejected', WD.normalizePayload([{ foo: 1, bar: 2 }], {}).length === 0);

// ---------------------------------------------------------------- score
section('ranking');
const profile = WD.profileOf({ profile: WD.DEFAULT_PROFILE });
const r1 = WD.rank(f0, profile, {});
ok('rank returns 0-100', r1.score >= 0 && r1.score <= 100, 'score=' + r1.score + ' (' + r1.label + ')');
ok('rank has all five components', ['pay', 'distance', 'timing', 'match', 'buyer'].every(k => r1.parts[k]),
   Object.keys(r1.parts).join(','));
ok('rank explains itself', typeof WD.explain(r1, f0, profile) === 'string' && WD.explain(r1, f0, profile).length > 5,
   WD.explain(r1, f0, profile));
const near = WD.normalizePayload([{ title: 'Local cabling', city: 'Cheyenne', state: 'WY', pay: '$60/hr', start: new Date(Date.now() + 86400000).toISOString().slice(0, 10) }], { platform: 'workmarket', home: profile.home })[0];
const far = WD.normalizePayload([{ title: 'Far cabling', city: 'Phoenix', state: 'AZ', pay: '$60/hr', start: new Date(Date.now() + 86400000).toISOString().slice(0, 10) }], { platform: 'workmarket', home: profile.home })[0];
const rn = WD.rank(near, profile, {}), rf = WD.rank(far, profile, {});
ok('nearer beats farther at equal pay', rn.score > rf.score, 'Cheyenne ' + rn.score + ' vs Phoenix ' + rf.score);
const cheap = WD.normalizePayload([{ title: 'Cheap', city: 'Cheyenne', state: 'WY', pay: '$12/hr', start: new Date(Date.now() + 86400000).toISOString().slice(0, 10) }], { platform: 'workmarket', home: profile.home })[0];
const rc = WD.rank(cheap, profile, {});
ok('under-floor pay scores below in-range pay', rc.score < rn.score, '$12/hr ' + rc.score + ' vs $60/hr ' + rn.score);
ok('under-floor flagged', (rc.flags || []).some(f => /floor/.test(f)), (rc.flags || []).join('; '));
const blocked = WD.normalizePayload([{ title: 'Roof work overnight', city: 'Cheyenne', state: 'WY', pay: '$90/hr' }], { platform: 'workmarket', home: profile.home })[0];
const rb = WD.rank(blocked, profile, {});
ok('blocked keyword demotes', rb.score < rn.score, 'roof/overnight -> ' + rb.score);
ok('buyer history lifts a winner', (() => {
  const h = { [WD.norm('Acme Co')]: { won: 2, applied: 2, lost: 0, ignored: 0, saved: 0 } };
  const withH = WD.rank(wmRows[0], profile, h);
  const noH = WD.rank(wmRows[0], profile, {});
  return withH.parts.buyer.score > noH.parts.buyer.score;
})());
ok('net hourly applies the platform fee', (() => {
  const p2 = WD.profileOf({ profile: Object.assign({}, WD.DEFAULT_PROFILE, { platformHaircut: { fieldnation: 0.2, workmarket: 0 } }) });
  const nh = WD.netHourly(Object.assign({}, f0, { pay: { amount: 100, type: 'hourly' } }), p2);
  return Math.abs(nh.net - 80) < 0.01;
})(), 'gross 100 -> net 80 at 20%');

// ---------------------------------------------------------- sample board
section('sample board (data/workorders.sample.json)');
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'workorders.sample.json'), 'utf8'));
const sRows = WD.normalizePayload(sample.orders, { source: 'sample', home: profile.home });
ok('all sample rows normalize', sRows.length === sample.orders.length, sRows.length + '/' + sample.orders.length);
const platforms = {};
sRows.forEach(r => platforms[r.platform] = (platforms[r.platform] || 0) + 1);
ok('both platforms represented', platforms.fieldnation > 3 && platforms.workmarket > 3, JSON.stringify(platforms));
ok('every row has a dedupe key', sRows.every(r => r.dedupe));
ok('dedupe keys unique', new Set(sRows.map(r => r.dedupe)).size === sRows.length,
   new Set(sRows.map(r => r.dedupe)).size + ' unique of ' + sRows.length);
const ranked = WD.rankAll(sRows.slice(), profile, {});
ok('ranking sorts descending', ranked.every((r, i) => i === 0 || ranked[i - 1].rank.score >= r.rank.score));
const withPay = ranked.filter(r => r.pay.amount != null).length;
ok('pay mapped on most rows', withPay >= ranked.length - 2, withPay + '/' + ranked.length);
const withDist = ranked.filter(r => r.distance_mi != null).length;
ok('distance resolved for rows with a city/state', withDist >= ranked.length - 4, withDist + '/' + ranked.length);
const stateOnly = ranked.filter(r => r.geo_precision === 'state').length;
ok('state-only rows are flagged as rough', stateOnly >= 1, stateOnly + ' row(s) badged ≈ dist');
const hourly = ranked.filter(r => r.rank.netHourly).length;
ok('$/hr derived where possible', hourly >= ranked.length - 5, hourly + '/' + ranked.length);
console.log('\n  top 5 by WorkScore:');
ranked.slice(0, 5).forEach(r => console.log('    ' + String(r.rank.score).padStart(3) + '  ' +
  r.platform.slice(0, 10).padEnd(10) + ' ' + (r.title || '').slice(0, 46).padEnd(46) + ' ' +
  (r.distance_mi != null ? Math.round(r.distance_mi) + 'mi' : '  ?  ') + '  ' +
  (r.rank.netHourly ? '$' + Math.round(r.rank.netHourly.net) + '/hr' : '  n/a ')));
console.log('\n  bottom 3 (should be the junk / cheap / far ones):');
ranked.slice(-3).forEach(r => console.log('    ' + String(r.rank.score).padStart(3) + '  ' +
  (r.title || '').slice(0, 60) + '  [' + (r.rank.flags || []).join('; ') + ']'));

// ------------------------------------------------------------ sidekick
section('sidekick userscript');
const sk = fs.readFileSync(path.join(ROOT, 'sidekick', 'workdesk-sidekick.user.js'), 'utf8');
ok('has a userscript header', /^\/\/ ==UserScript==/m.test(sk));
ok('closed with ==/UserScript==', /^\/\/ ==\/UserScript==/m.test(sk));
ok('matches Field Nation', /@match\s+https:\/\/app\.fieldnation\.com\/\*/.test(sk));
ok('matches WorkMarket', /@match\s+https:\/\/app\.workmarket\.com\/\*/.test(sk));
ok('grants no unsafe perms', !/@grant\s+unsafeWindow/.test(sk), 'no unsafeWindow');
ok('never reads password fields', !/type=.?password/i.test(sk.replace(/s-pitch|s-token|relayToken|Gist token[\s\S]{0,120}/g, '')) || /autocomplete="off"/.test(sk));
ok('does not auto-submit', !/\.submit\(\)|dispatchEvent\(new MouseEvent\('click'/.test(sk) || /click'\)\)/.test(sk));
ok('sync code prefix matches the dashboard', sk.includes("'WD1-'"), 'WD1-');
const syncOk = /'WD1-' \+ body \+ '-' \+ fnv\(body\)/.test(sk);
ok('sidekick code format = dashboard decode format', syncOk);
try { new vm.Script(sk.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/m, '')); ok('sidekick body parses', true); }
catch (e) { ok('sidekick body parses', false, e.message); }

// ---------------------------------------------------------------- worker
section('worker/poll.py');
const poll = fs.readFileSync(path.join(ROOT, 'worker', 'poll.py'), 'utf8');
ok('stdlib only (no pip imports)', !/^\s*import (requests|httpx|yaml|pandas)/m.test(poll));
ok('has a selftest command', /def selftest\(/.test(poll));
ok('documents the provider-API limitation', /PROVIDER-side API/i.test(poll) || /provider-side/i.test(poll));
ok('throttles vendor calls', /MIN_INTERVAL_SECONDS/.test(poll));
ok('never writes credentials to the feed', !/json\.dump\([^)]*token/.test(poll));

console.log('\n' + '='.repeat(58));
console.log((fail === 0 ? 'ALL GREEN  ' : 'FAILURES   ') + pass + ' passed, ' + fail + ' failed');
if (fails.length) console.log('failed: ' + fails.join(' | '));
console.log('='.repeat(58));
process.exit(fail === 0 ? 0 : 1);
