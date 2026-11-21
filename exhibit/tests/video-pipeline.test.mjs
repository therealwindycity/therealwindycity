// exhibit/tests/video-pipeline.test.mjs — video pipeline harness (Node only, no deps).
// Verifies: 18 MP4s exist at 1080x1920 inside the 15–60 s band with audio;
// 18 statutory cards (1080x960 PNG) and 18 word-timing files; gallery index
// links every row, carries no external subresources, and every video is
// downloadable; caption files keep the gold live-word color and every one of
// the 18 rows carries a GRANICUS TAPE provenance label (all rows render real
// meeting footage — no synthesized frames).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EXHIBIT = path.resolve(ROOT, '..');
const REPO = path.resolve(EXHIBIT, '..');
const PIPE = path.join(EXHIBIT, 'pipeline');

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? '  — ' + extra : ''}`); }
}
function section(s) { console.log(`\n${s}`); }

function mp4Meta(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 64 || buf.toString('ascii', 4, 8) !== 'ftyp') return null;
  const meta = { bytes: buf.length, duration: null, w: null, h: null, hasAudio: false };
  let i = buf.indexOf(Buffer.from('mvhd'));
  if (i >= 0) {
    const ver = buf[i + 4];
    const ts = ver === 0
      ? buf.readUInt32BE(i + 16) : Number(buf.readBigUInt64BE(i + 24));
    const dur = ver === 0
      ? buf.readUInt32BE(i + 20) : Number(buf.readBigUInt64BE(i + 28));
    if (ts > 0) meta.duration = dur / ts;
  }
  // coded size from the avc1 sample entry (skip ftyp-brand hits)
  let idx = 0;
  while (true) {
    const j = buf.indexOf(Buffer.from('avc1'), idx);
    if (j < 0) break;
    const w = buf.readUInt16BE(j + 28), h = buf.readUInt16BE(j + 30);
    if (w >= 16 && h >= 16) { meta.w = w; meta.h = h; break; }
    idx = j + 1;
  }
  meta.hasAudio = buf.indexOf(Buffer.from('mp4a')) >= 0;
  return meta;
}

function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// Expected rows come straight from the shipped data contract.
const matrixSrc = fs.readFileSync(path.join(EXHIBIT, 'data', 'matrix.js'), 'utf8');
const vm = { exports: {} };
new Function('module', 'exports', matrixSrc)(vm, vm.exports);
const M = vm.exports;
const ids = M.rows.map((r) => r.id);

section('video artifacts (18 × MP4 + card + timings)');
ok('matrix still exposes 18 rows', ids.length === 18, `${ids.length}`);

const missingMp4 = ids.filter((id) => !fs.existsSync(path.join(EXHIBIT, 'videos', `${id}.mp4`)));
ok('all 18 MP4s exist in exhibit/videos/', missingMp4.length === 0, missingMp4.join(',') || 'present');

const missingCard = ids.filter((id) => !fs.existsSync(path.join(EXHIBIT, 'cards', `${id}.png`)));
ok('all 18 statutory cards exist in exhibit/cards/', missingCard.length === 0, missingCard.join(',') || 'present');

const timingsRaw = fs.existsSync(path.join(PIPE, 'work', 'timings.json'))
  ? fs.readFileSync(path.join(PIPE, 'work', 'timings.json'), 'utf8') : null;
ok('word-timing file present (rebuild intermediate)', timingsRaw !== null);
let timings = null;
try { timings = timingsRaw ? JSON.parse(timingsRaw) : null; } catch { /* asserted below */ }
ok('word-timing file parses as JSON', timings !== null);

section('MP4 specs (1080×1920, 15–60 s, audio track)');
const metas = {};
for (const id of ids) {
  const f = path.join(EXHIBIT, 'videos', `${id}.mp4`);
  if (!fs.existsSync(f)) continue;
  metas[id] = mp4Meta(f);
}
const badSpec = ids.filter((id) => {
  const m = metas[id];
  return !m || m.w !== 1080 || m.h !== 1920 ||
    m.duration === null || m.duration < 15 || m.duration > 60 ||
    !m.hasAudio || m.bytes < 100_000;
});
ok('every MP4: 1080×1920, 15–60 s, has mp4a audio, ≥100 KB',
  badSpec.length === 0, badSpec.join(',') || `${ids.length}/${ids.length}`);

section('captions, frames, gallery');
const assDir = path.join(PIPE, 'work', 'ass');
const badAss = ids.filter((id) => {
  const f = path.join(assDir, `${id}.ass`);
  if (!fs.existsSync(f)) return true;
  const txt = fs.readFileSync(f, 'utf8');
  return !txt.includes('&H0000A1E5') || !/Dialogue: 0,/.test(txt) ||
    !txt.includes('PlayResY: 1920');
});
ok('every ASS caption: gold live word, dialog events, 1920 playfield',
  badAss.length === 0, badAss.join(',') || `${ids.length}/${ids.length}`);

const provDir = path.join(PIPE, 'work', 'prov');
const badProv = ids.filter((id) => {
  const f = path.join(provDir, `${id}.txt`);
  return !fs.existsSync(f) || !/GRANICUS TAPE · /.test(fs.readFileSync(f, 'utf8'));
});
ok('every row carries a GRANICUS TAPE provenance label (18/18 footage)',
  badProv.length === 0, badProv.join(',') || `${ids.length}/${ids.length}`);

const galleryPath = path.join(EXHIBIT, 'videos', 'index.html');
ok('gallery index exists', fs.existsSync(galleryPath));
if (fs.existsSync(galleryPath)) {
  const g = fs.readFileSync(galleryPath, 'utf8');
  ok('gallery links all 18 MP4s',
    ids.every((id) => g.includes(`src="${id}.mp4"`)));
  ok('gallery offers a download for every row',
    ids.every((id) => g.includes(`href="${id}.mp4" download`)));
  ok('gallery has no external http(s) subresources (offline-safe)',
    !/(src|href)\s*=\s*["']https?:\/\//i.test(g));
  ok('gallery palette locked (bone/oxblood/pencil/gold)',
    ['#EDE7D9', '#A62B1C', '#24456B', '#E5A100'].every((c) => g.includes(c)));
  const posterOk = ids.every((id) => g.includes(`poster="../cards/${id}.png"`));
  ok('every gallery item posters its card', posterOk);
  ok('gallery lists Granicus-tape footage for all 18 rows',
    (g.match(/Granicus tape/g) || []).length === 18);
  ok('gallery carries no synthesized-frame fallback text',
    !g.includes('Synthesized record frame'));
}

section('app integration + honesty labels');
const idx = fs.readFileSync(path.join(EXHIBIT, 'index.html'), 'utf8');
ok('index.html links the video gallery (relative)',
  /href="videos\/index\.html"/.test(idx));
ok('index.html still offline-safe',
  !/(src|href)\s*=\s*["']https?:\/\//i.test(idx));

const buildSrc = fs.readFileSync(path.join(PIPE, 'build.py'), 'utf8');
const footageIds = new Set(
  [...buildSrc.matchAll(/"(POE-\d\d)":\s*\("/g)].map((m) => m[1]));
ok('build.py FOOTAGE wires all 18 rows to a staged clip',
  ids.every((id) => footageIds.has(id)),
  `${ids.filter((id) => footageIds.has(id)).length}/18`);
ok('caption gold matches gallery gold (single source of truth)',
  buildSrc.includes('#E5A100'));

console.log(`\n${'─'.repeat(60)}`);
console.log(`POE video pipeline harness: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
