#!/usr/bin/env node
/* exhibit/pipeline/tts.js — narrator voiceovers + word-level karaoke timings.
 *
 * Offline TTS: npm `mespeak` (eSpeak compiled to JS). The Python edge-tts
 * client is installed but its speech endpoint (speech.platform.bing.com) is
 * unreachable from this sandbox, and the espeak-ng loader wheel mis-times
 * multi-word synthesis, so mespeak is the engine of record.
 *
 * Word timings use prefix synthesis: cum[i] = duration(synth(words[0..i])).
 * Every prefix carries the same leading silence L and trailing silence S, so
 *   start[0] = L  (energy onset of the full utterance)
 *   start[i] = cum[i] - S        (end of word i-1 inside prefix i)
 *   end[i]   = cum[i+1] - S      (== start[i+1]; last end = fullDur - S)
 * cum[n] equals the full-utterance duration by construction.
 *
 * Outputs (all under work/, gitignored):
 *   work/vo/POE-XX.wav     22050 Hz mono 16-bit complete WAV
 *   work/timings.json      { rows: { POE-XX: { duration, speech_end, words[] } } }
 *   work/matrix.json       JSON snapshot of data/matrix.js for the Python stages
 */
'use strict';

const fs = require('fs');
const path = require('path');
const mespeak = require('mespeak');

const PIPE = __dirname;                       // exhibit/pipeline
const WORK = path.join(PIPE, 'work');
const VO = path.join(WORK, 'vo');
fs.mkdirSync(VO, { recursive: true });

mespeak.loadConfig(require('mespeak/src/mespeak_config.json'));
mespeak.loadVoice(require('mespeak/voices/en/en-us.json'));

const matrix = require('../data/matrix.js');
const SPEED = 132;                            // ~55-90 word rebuttals land near 30 s

/* mespeak's emscripten VFS degrades after ~50-80 synth calls ("Bad data:
 * en_dict" then a RangeError inside snprintf); its shipped recoverFromFSError
 * is never invoked by speak(). We recycle the whole module instead: purge it
 * from require.cache, re-require, reload config+voice. Proactive every 40
 * calls, reactive on any throw. */
const RECYCLE_AT = 40;
let engine = null;
let callsSinceRecycle = 0;

function loadEngine() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}mespeak${path.sep}`) || key.endsWith(`${path.sep}mespeak`)) {
      delete require.cache[key];
    }
  }
  const m = require('mespeak');
  m.loadConfig(require('mespeak/src/mespeak_config.json'));
  m.loadVoice(require('mespeak/voices/en/en-us.json'));
  callsSinceRecycle = 0;
  return m;
}

engine = loadEngine();

function synthWav(text) {
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const ab = engine.speak(text, { rawdata: true, speed: SPEED });
      const buf = Buffer.from(ab);             // complete RIFF/WAVE
      if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a RIFF');
      if (++callsSinceRecycle >= RECYCLE_AT) engine = loadEngine();
      return buf;
    } catch (e) {
      lastErr = e;
      console.error(`mespeak call failed (attempt ${attempt + 1}): ${e.message} — recycling engine`);
      engine = loadEngine();
    }
  }
  throw new Error(`synth failed after retries for "${text.slice(0, 50)}…": ${lastErr}`);
}

function wavMeta(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('mespeak did not return a WAV');
  }
  let i = 12, fmt = null;
  while (i + 8 <= buf.length) {
    const id = buf.toString('ascii', i, i + 4);
    const sz = buf.readUInt32LE(i + 4);
    if (id === 'fmt ') {
      fmt = {
        channels: buf.readUInt16LE(i + 10),
        rate: buf.readUInt32LE(i + 12),
        bits: buf.readUInt16LE(i + 22),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('data chunk before fmt');
      const bytesPerSec = fmt.rate * fmt.channels * (fmt.bits / 8);
      return { ...fmt, dataStart: i + 8, dataLen: sz, duration: sz / bytesPerSec };
    }
    i += 8 + sz + (sz & 1);
  }
  throw new Error('no data chunk');
}

/* Energy onset / offset of a 16-bit PCM buffer: 10 ms windows, RMS > thresh. */
function speechBounds(buf, meta, thresh = 400) {
  const win = Math.max(1, Math.floor(meta.rate * 0.01));
  const bytesPerSample = meta.channels * (meta.bits / 8);
  const totalSamples = Math.floor(meta.dataLen / bytesPerSample);
  let first = -1, last = -1;
  for (let w = 0; w * win < totalSamples; w++) {
    let sum = 0, n = 0;
    for (let k = 0; k < win; k++) {
      const idx = w * win + k;
      if (idx >= totalSamples) break;
      const v = buf.readInt16LE(meta.dataStart + idx * bytesPerSample);
      sum += v * v; n++;
    }
    if (!n) break;
    const rms = Math.sqrt(sum / n);
    if (rms > thresh) {
      if (first < 0) first = (w * win) / meta.rate;
      last = ((w * win) + win) / meta.rate;
    }
  }
  if (first < 0) return { lead: 0, speechEnd: 0 };
  return { lead: first, speechEnd: last };
}

const rowsOut = {};
const problems = [];

for (const row of matrix.rows) {
  const words = row.rebuttal.trim().split(/\s+/);

  // Full-utterance VO.
  const fullBuf = synthWav(row.rebuttal);
  const fullMeta = wavMeta(fullBuf);
  const { lead, speechEnd } = speechBounds(fullBuf, fullMeta);
  const S = Math.max(0, fullMeta.duration - speechEnd);   // trailing silence

  // Prefix durations -> per-word start/end.
  const cum = new Array(words.length + 1).fill(0);        // cum[i] = dur(words[0..i-1])
  for (let i = 1; i <= words.length; i++) {
    const b = synthWav(words.slice(0, i).join(' '));
    cum[i] = wavMeta(b).duration;
  }

  const timed = [];
  for (let i = 0; i < words.length; i++) {
    let s = i === 0 ? lead : Math.max(0, cum[i] - S);
    let e = i === words.length - 1
      ? fullMeta.duration - S
      : Math.max(s + 0.04, cum[i + 1] - S);
    if (timed.length && s < timed[timed.length - 1].e) s = timed[timed.length - 1].e;
    if (e < s) e = s + 0.04;
    timed.push({ t: words[i], s: +s.toFixed(3), e: +e.toFixed(3) });
  }

  // Sanity: monotonic, inside the WAV, roughly speech-shaped.
  const nWords = matrix.wordCount(row.rebuttal);
  if (words.length !== nWords) problems.push(`${row.id}: split ${words.length} != wordCount ${nWords}`);
  if (fullMeta.duration < 12 || fullMeta.duration > 60) {
    problems.push(`${row.id}: duration ${fullMeta.duration.toFixed(1)}s outside 12-60s band`);
  }
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].s < timed[i - 1].s - 1e-6) problems.push(`${row.id}: non-monotonic start at ${i}`);
  }
  const last = timed[timed.length - 1];
  if (last.e > fullMeta.duration + 1e-6) problems.push(`${row.id}: end beyond wav`);

  fs.writeFileSync(path.join(VO, `${row.id}.wav`), fullBuf);
  rowsOut[row.id] = {
    duration: +fullMeta.duration.toFixed(3),
    speech_end: +speechEnd.toFixed(3),
    words: timed,
  };
  process.stdout.write(
    `${row.id}  ${String(words.length).padStart(2)}w  ${fullMeta.duration.toFixed(1)}s  ` +
    `lead=${lead.toFixed(2)} tail=${S.toFixed(2)}\n`);
}

if (problems.length) {
  console.error('TIMING PROBLEMS:\n  ' + problems.join('\n  '));
  process.exit(1);
}

fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, 'timings.json'),
  JSON.stringify({ speed: SPEED, rows: rowsOut }, null, 1));
fs.writeFileSync(path.join(WORK, 'matrix.json'), JSON.stringify(matrix, null, 1));

const durs = Object.values(rowsOut).map(r => r.duration).sort((a, b) => a - b);
const median = durs[Math.floor(durs.length / 2)];
console.log(`\n${Object.keys(rowsOut).length} voiceovers written to work/vo/`);
console.log(`duration range ${durs[0].toFixed(1)}s – ${durs[durs.length - 1].toFixed(1)}s (median ${median.toFixed(1)}s)`);
