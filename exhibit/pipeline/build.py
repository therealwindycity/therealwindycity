#!/usr/bin/env python3
"""exhibit/pipeline/build.py — compose the 18 vertical exhibit videos.

Per row:
  top    = exhibit/cards/POE-XX.png            (1080x960 statutory card, static)
  bottom = staged meeting clip — real Granicus/YouTube council tape for EVERY
           row (date-verified against burned-in captions on the source cut)
  vstack -> 1080x1920; tape audio only (no synthesized VO, no burned captions;
           the GRANICUS TAPE provenance label stays)

Outputs, per row, all under exhibit/videos/:
  POE-XX.mp4          final composite (card + tape, tape audio)
  POE-XX.txt          the proposed narration (row rebuttal, plain text)
  POE-XX.card.png     the card layer, independent (1080x960)
  POE-XX.footage.mp4  the raw footage layer, independent (staged cut as used)
plus the gallery index.html. Video duration = LEAD + narration read-time +
TAIL, so each cut is paced to its script even though the voice is not mixed.

All 18 rows render from staged footage under pipeline/videos/ (cut from the
verified meeting compilations in TheReelWindyCity `video/` + the local Mar 9 /
Apr 27 canon cuts). Where a row's cited sitting has no recording in this
corpus, the tape is the closest verified sitting in the row's source chain
and both the burned label and the gallery say so — no invented timestamps.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
from PIL import Image

PIPE = Path(__file__).resolve().parent
ROOT = PIPE.parent                     # exhibit/
WORK = PIPE / "work"
CARDS = ROOT / "cards"
PROV = WORK / "prov"
VIDEOS = ROOT / "videos"

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FDIR = Path("/usr/share/fonts/truetype/dejavu")

LEAD = 0.4     # lead-in before the narration read-time window
TAIL = 1.3     # hold after the narration read-time window
FPS = 30
W, H = 1080, 1920
HALF = 960

# Date-verified footage: row id -> (clip under pipeline/videos/, -ss offset,
# provenance label burned top-left of the tape half). Every row now has tape.
# Provenance per staged cut (verified against the source compilation's burned
# caption at the cut point):
#   POE-03 mar9_cut = canon Mar 9 GB cut (04:33:21–04:34:09); POE-09
#   apr27_hand +122s lands on the 02:46:12 POO (canon index).
#   jul13_wolfe/sep14_dais/apr13_cox/apr21_finance_*/sep14_interrupt/
#   aug10_gb/jun22_*/sep14_cox_*/aug24_gb/jun8_wolfe/sep14_entered/
#   may26_comment were staged from TheReelWindyCity video/ compilations at
#   offsets whose burned captions read exactly the label below.
FOOTAGE = {
    "POE-01": ("jul13_wolfe.mp4", 0, "City Council · July 13, 2026"),
    "POE-02": ("sep14_dais.mp4", 0, "City Council · September 14, 2026"),
    "POE-03": ("mar9_cut.mp4", 0, "City Council GB · March 9, 2026"),
    "POE-04": ("apr13_cox.mp4", 0, "City Council · April 13, 2026"),
    "POE-05": ("apr21_finance_a.mp4", 0, "Finance Committee · April 21, 2026"),
    "POE-06": ("sep14_interrupt.mp4", 0, "City Council · September 14, 2026"),
    "POE-07": ("apr21_finance_b.mp4", 0, "Finance Committee · April 21, 2026"),
    "POE-08": ("aug10_gb.mp4", 0, "City Council · August 10, 2026"),
    "POE-09": ("apr27_hand.mp4", 122, "City Council GB · April 27, 2026"),
    "POE-10": ("jun22_clock.mp4", 0, "City Council · June 22, 2026"),
    "POE-11": ("jun22_wolfe.mp4", 0, "City Council · June 22, 2026"),
    "POE-12": ("sep14_cox_a.mp4", 0, "City Council · September 14, 2026"),
    "POE-13": ("aug24_gb.mp4", 0, "City Council · August 24, 2026"),
    "POE-14": ("jun8_wolfe.mp4", 0, "City Council · June 8, 2026"),
    "POE-15": ("sep14_cox_b.mp4", 0, "City Council · September 14, 2026"),
    "POE-16": ("sep14_cox_c.mp4", 0, "City Council · September 14, 2026"),
    "POE-17": ("sep14_entered.mp4", 0, "City Council · September 14, 2026"),
    "POE-18": ("may26_comment.mp4", 0, "City Council · May 26, 2026"),
}

# Gallery honesty notes for rows whose tape is not the row's own cited
# sitting (the burned label + drawn label already state the true tape date).
TAPE_NOTES = {
    "POE-02": ("Tape: Sep 14 GB — the docket this row audits opens on "
               "Sep 14; the Sep 28–Nov 17 sittings have no public recording "
               "in this corpus."),
    "POE-04": ("Tape: Apr 13 first-reading hearing — the root of the "
               "chronology this row audits; Oct 21–Nov 16 sittings are not "
               "on tape in this corpus."),
    "POE-05": ("Tape: Finance Committee, Apr 21 — same body; the Oct 26 "
               "sitting this row cites is not on tape in this corpus."),
    "POE-06": ("Tape: Sep 14 GB (inside this row's Sept–Oct range); the "
               "Finance Sept 3 / Oct 12 sittings are not on tape in this "
               "corpus."),
    "POE-07": ("Tape: Finance Committee, Apr 21 — same body; the Oct 26 "
               "vote this row cites is not on tape in this corpus."),
    "POE-13": ("Tape: Aug 24 GB — nearest governing-body sitting to the "
               "Aug 21 work session this row cites (no recording of the "
               "work session in this corpus)."),
}

def probe(path: Path):
    """Parse duration + coded size straight from the MP4 (no ffprobe here)."""
    buf = path.read_bytes()
    if buf[4:8] != b"ftyp":
        raise RuntimeError(f"{path.name}: not an MP4")
    out = {"duration": None, "w": None, "h": None}
    i = buf.find(b"mvhd")
    if i >= 0:
        ver = buf[i + 4]
        if ver == 0:
            ts = int.from_bytes(buf[i + 16:i + 20], "big")
            dur = int.from_bytes(buf[i + 20:i + 24], "big")
        else:
            ts = int.from_bytes(buf[i + 24:i + 28], "big")
            dur = int.from_bytes(buf[i + 28:i + 36], "big")
        if ts:
            out["duration"] = dur / ts
    # first avc1 hit is often the ftyp brand — take one with sane dims
    idx = 0
    while True:
        j = buf.find(b"avc1", idx)
        if j < 0:
            break
        w = int.from_bytes(buf[j + 28:j + 30], "big")
        h = int.from_bytes(buf[j + 30:j + 32], "big")
        if 16 <= w <= 8192 and 16 <= h <= 8192:
            out["w"], out["h"] = w, h
            break
        idx = j + 1
    return out

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stdout[-4000:] + "\n" + r.stderr[-6000:] + "\n")
        raise RuntimeError(f"ffmpeg failed ({cmd[-1] if cmd else '?'})")
    return r

def build_row(row, timing, matrix_by_id):
    rid = row["id"]
    card = CARDS / f"{rid}.png"
    img = Image.open(card)
    if img.size != (W, HALF):
        raise RuntimeError(f"{rid}: card is {img.size}, want {(W, HALF)}")

    duration = timing["duration"]
    total = LEAD + duration + TAIL          # paced to the narration read-time
    out = VIDEOS / f"{rid}.mp4"

    clip_name, ss, tape = FOOTAGE[rid]
    clip = PIPE.parent.parent / "pipeline" / "videos" / clip_name
    if not clip.exists():
        raise RuntimeError(f"{rid}: footage {clip} missing")
    prov = PROV / f"{rid}.txt"
    prov.write_text(f"GRANICUS TAPE · {tape}", encoding="utf-8")

    # Card over tape; tape audio only — no synthesized VO, no burned captions.
    fc = (
        f"[0:v]fps={FPS},format=yuv420p,setsar=1[top];"
        f"[1:v]fps={FPS},scale=1080:-2,"
        f"pad=1080:960:(ow-iw)/2:(oh-ih)/2:color=0x141210,"
        f"drawtext=fontfile={FDIR / 'DejaVuSansMono.ttf'}:"
        f"textfile={prov}:x=40:y=30:fontsize=24:"
        f"fontcolor=0xEDE7D9:box=1:boxcolor=0x141210@0.72:"
        f"boxborderw=10,"
        f"format=yuv420p,setsar=1[bot];"
        f"[top][bot]vstack[v0];"
        f"[v0]fade=t=in:st=0:d=0.35,"
        f"fade=t=out:st={total - 0.55:.3f}:d=0.55[vout];"
        f"[1:a]aformat=sample_rates=44100:channel_layouts=stereo,"
        f"volume=0.9,afade=t=in:st=0:d=0.35,"
        f"atrim=0:{total:.3f},"
        f"afade=t=out:st={total - 0.7:.3f}:d=0.7[aout]"
    )
    cmd = [
        FFMPEG, "-y",
        "-loop", "1", "-framerate", str(FPS), "-t", f"{total:.3f}",
        "-i", str(card),
        "-ss", str(ss), "-t", f"{total:.3f}", "-i", str(clip),
        "-filter_complex", fc,
        "-map", "[vout]", "-map", "[aout]",
        "-t", f"{total:.3f}",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p", "-r", str(FPS),
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-movflags", "+faststart",
        str(out),
    ]
    run(cmd)

    # Per-row source kit beside the video: the proposed narration plus the
    # two independent visual layers (card + raw footage) for re-cutting.
    (VIDEOS / f"{rid}.txt").write_text(
        row["rebuttal"].strip() + "\n", encoding="utf-8")
    shutil.copyfile(card, VIDEOS / f"{rid}.card.png")
    shutil.copyfile(clip, VIDEOS / f"{rid}.footage.mp4")

    meta = probe(out)
    if (meta["w"], meta["h"]) != (W, H):
        raise RuntimeError(f"{rid}: size {meta['w']}x{meta['h']} != 1080x1920")
    if meta["duration"] is None or abs(meta["duration"] - total) > 0.6:
        raise RuntimeError(
            f"{rid}: duration {meta['duration']} != expected {total:.2f}")
    print(f'{rid}: {meta["duration"]:.1f}s 1080x1920 '
          f'({out.stat().st_size // 1024} KB, tape + txt/card/footage layers)')
    return meta

GALLERY_CSS = """
:root{--bone:#EDE7D9;--ox:#A62B1C;--pb:#24456B;--ink:#181614;--rule:#B9B1A2;--gold:#E5A100}
*{box-sizing:border-box}
body{margin:0;background:#EDE7D9;color:#181614;
  font-family:Georgia,'Times New Roman',serif;
  background-image:repeating-linear-gradient(0deg,transparent,transparent 43px,#E4DCCB 43px,#E4DCCB 44px)}
.topbar{display:flex;justify-content:space-between;padding:8px 20px;font:12px/1.4 ui-monospace,Menlo,monospace;
  letter-spacing:.08em;text-transform:uppercase;background:#181614;color:#EDE7D9}
header{max-width:1120px;margin:0 auto;padding:36px 24px 8px}
h1{font-size:44px;margin:0 0 6px;color:#A62B1C}
.sub{font:600 15px/1.5 ui-monospace,Menlo,monospace;color:#24456B;letter-spacing:.04em}
.lede{max-width:70ch;font-size:17px;line-height:1.6}
.grid{max-width:1120px;margin:24px auto 60px;padding:0 24px;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:26px}
.item{background:#F4EFE3;border:1px solid #B9B1A2;border-radius:6px;overflow:hidden;
  display:flex;flex-direction:column;box-shadow:0 2px 0 #B9B1A2}
.item video{width:100%;aspect-ratio:9/16;max-height:420px;background:#141210;display:block;object-fit:contain}
.meta{padding:14px 16px 16px;display:flex;flex-direction:column;gap:8px;flex:1}
.pid{font:700 13px/1 ui-monospace,Menlo,monospace;color:#fff;background:#A62B1C;
  padding:5px 9px;border-radius:3px;align-self:flex-start;letter-spacing:.06em}
.when{font-size:19px;font-weight:700}
.body{font:600 12.5px/1.45 ui-monospace,Menlo,monospace;color:#24456B;letter-spacing:.05em;text-transform:uppercase}
.stat{font-size:14px;line-height:1.45;color:#181614;border-left:3px solid #24456B;padding-left:9px}
.prov{font:11.5px/1.5 ui-monospace,Menlo,monospace;color:#5A564C}
.prov b{color:#A62B1C;font-weight:700}
.acts{margin-top:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.acts a{font:700 12.5px/1 ui-monospace,Menlo,monospace;text-decoration:none;
  padding:8px 11px;border-radius:4px;letter-spacing:.03em}
.dl{background:#24456B;color:#EDE7D9}
.dl:hover{background:#181614}
.lay{color:#24456B;border:1px solid #B9B1A2;background:#F4EFE3}
.lay:hover{background:#24456B;color:#EDE7D9;border-color:#24456B}
.open{color:#A62B1C;border:1px solid #A62B1C}
.open:hover{background:#A62B1C;color:#EDE7D9}
footer{max-width:1120px;margin:0 auto;padding:0 24px 48px;font-size:14.5px;
  line-height:1.6;border-top:2px solid #B9B1A2;padding-top:18px}
footer a{color:#24456B}
a{color:#A62B1C}
"""

def write_gallery(matrix, metas):
    items = []
    for row in matrix["rows"]:
        rid = row["id"]
        m = metas[rid]
        clip_name, ss, tape = FOOTAGE[rid]
        used = f" @+{ss}s" if ss else ""
        prov = (f"<b>Footage</b> · Granicus tape <code>{clip_name}</code>"
                f"{used} — {tape}")
        if rid in TAPE_NOTES:
            prov += f"<br>{TAPE_NOTES[rid]}"
        items.append(f"""<article class="item">
<video controls preload="metadata" poster="../cards/{rid}.png" src="{rid}.mp4"></video>
<div class="meta">
<span class="pid">{rid}</span>
<div class="when">{row['date']}</div>
<div class="body">{row['body']}</div>
<div class="stat">{row['statute']}</div>
<div class="prov">{prov}</div>
<div class="acts">
<a class="dl" href="{rid}.mp4" download>⬇ MP4</a>
<a class="lay" href="{rid}.txt" download>Narration .txt</a>
<a class="lay" href="{rid}.footage.mp4" download>Footage layer</a>
<a class="lay" href="{rid}.card.png" download>Card layer</a>
<a class="open" href="../index.html">Matrix →</a>
</div>
</div>
</article>""")
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>POE Video Gallery — 18 Statutory Exhibit Videos</title>
<meta name="description" content="All 18 Point-of-Order Exhibit videos: 1080x1920 statutory card over verified meeting tape (no synthesized voice, no burned captions), with the narration .txt plus independent card and footage source layers beside every MP4.">
<style>{GALLERY_CSS}</style>
</head>
<body>
<div class="topbar"><span>The Real Windy City // Public Record Audit</span>
<span>Vol. X — Video Gallery</span></div>
<header>
<h1>Video Gallery</h1>
<div class="sub">18 EXHIBITS · 1080×1920 · CARD + REAL MEETING TAPE · SOURCE LAYERS INCLUDED</div>
<p class="lede">Each video stacks the 1080×960 statutory exhibit card over
verified Granicus/YouTube meeting footage with the tape's own audio — no
synthesized voice, no burned-in captions. Every row plays real tape from the
cited meeting where a recording exists in this corpus, or from the closest
verified sitting in the row's source chain where the row's own sitting was
never recorded (the burned label says exactly which meeting you are watching).
Alongside each MP4 sit its independent source layers: the proposed narration
as a <code>.txt</code>, the card layer as a <code>.png</code>, and the raw
footage layer as a <code>.mp4</code> — so you can produce your own cuts.
Every row cites meeting body, date, source, and statute — no invented
verbatim timestamps.</p>
</header>
<main class="grid">
{chr(10).join(items)}
</main>
<footer><strong>Sourcing discipline.</strong> Same 18 rows as the
<a href="../index.html">contradiction matrix</a> — rows 1–6 from the owner-supplied
matrix, rows 7–18 reconstructed from this repository's verified records.
Narration is the row's 55–90 word podium rebuttal, shipped as plain text
beside each video (nothing synthesized into the audio).
<strong>Palette.</strong> Bone #EDE7D9 · oxblood #A62B1C · pencil blue #24456B ·
live-word gold #E5A100.</footer>
</body>
</html>
"""
    (VIDEOS / "index.html").write_text(html, encoding="utf-8")

def main():
    matrix = json.loads((WORK / "matrix.json").read_text())
    timings = json.loads((WORK / "timings.json").read_text())
    for sub in (PROV, VIDEOS):
        sub.mkdir(parents=True, exist_ok=True)

    metas = {}
    for row in matrix["rows"]:
        metas[row["id"]] = build_row(row, timings["rows"][row["id"]], matrix)
    write_gallery(matrix, metas)

    total_mb = sum((VIDEOS / f'{r["id"]}.mp4').stat().st_size
                   for r in matrix["rows"]) / 1e6
    print(f"\n{len(metas)} videos -> {VIDEOS}  ({total_mb:.1f} MB total)")
    print("gallery ->", VIDEOS / "index.html")

if __name__ == "__main__":
    sys.exit(main())
