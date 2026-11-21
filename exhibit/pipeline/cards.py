#!/usr/bin/env python3
"""exhibit/pipeline/cards.py — render the 18 statutory exhibit cards (1080x960).

Cards are the top half of each vertical video (and ship beside each video as
the card source layer, exhibit/videos/POE-XX.card.png); the committed set
lives in exhibit/cards/. No synthesized record frames — all 18 rows render
real meeting footage.

Design language matches the web exhibit: bone paper #EDE7D9, oxblood #A62B1C,
pencil blue #24456B, ink #181614, rule #B9B1A2, live-gold #E5A100.
Dollar figures render oxblood-bold; statute citations pencil-blue-bold.

Reads work/matrix.json (written by tts.js) so Python never parses JS.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PIPE = Path(__file__).resolve().parent
ROOT = PIPE.parent                      # exhibit/
WORK = PIPE / "work"
CARDS = ROOT / "cards"

W, H = 1080, 960

BONE = (0xED, 0xE7, 0xD9)
OXBLOOD = (0xA6, 0x2B, 0x1C)
PENCIL = (0x24, 0x45, 0x6B)
INK = (0x18, 0x16, 0x14)
RULE = (0xB9, 0xB1, 0xA2)
GOLD = (0xE5, 0xA1, 0x00)
MUTED = (0x5A, 0x56, 0x4C)
PAPER_DEEP = (0xE4, 0xDC, 0xCB)
PANEL = (0xE7, 0xE0, 0xD0)

# Dark record-slate palette
SLATE_DIM = (0x8A, 0x85, 0x79)

FDIR = Path("/usr/share/fonts/truetype/dejavu")

def F(name, size):
    return ImageFont.truetype(str(FDIR / name), size)

# Rich-text: $ figures -> oxblood bold, statute tokens -> pencil bold.
HOT = re.compile(
    r"(\$[\d,]+(?:\.\d+)?(?:\s?(?:million|billion|thousand))?)"
    r"|((?:Wyo\.\s+Stat\.|W\.S\.|CMC|UDC|U\.S\.\s+Const\.|RONR)[^,.;)]*)"
    r"|(§+\s*[\d\-.]+(?:\s*/\s*[\d\-]+)*)",
    re.IGNORECASE,
)

def tokenize(text):
    """-> [(chunk, style)] where style in {'', 'hot', 'statute'}."""
    out = []
    pos = 0
    for m in HOT.finditer(text):
        if m.start() > pos:
            out.append((text[pos:m.start()], ""))
        if m.group(1):
            out.append((m.group(1), "hot"))
        else:
            out.append((m.group(0), "statute"))
        pos = m.end()
    if pos < len(text):
        out.append((text[pos:], ""))
    return out or [(text, "")]

def wrap_rich(text, font, hot_font, statute_font, max_w, draw):
    """Greedy wrap with mixed styles -> lines of [(chunk, style, font)]."""
    # Split into word-sized pieces preserving spaces.
    pieces = []
    for chunk, style in tokenize(text):
        parts = re.split(r"(\s+)", chunk)
        for p in parts:
            if p:
                pieces.append((p, style))
    lines, cur, cur_w = [], [], 0
    fmap = {"": font, "hot": hot_font, "statute": statute_font}
    for text_p, style in pieces:
        if text_p.isspace() and not cur:
            continue
        fw = draw.textlength(text_p, font=fmap[style])
        if cur_w + fw > max_w and not text_p.isspace():
            lines.append(cur)
            cur, cur_w = [], 0
            if text_p.isspace():
                continue
        cur.append((text_p, style, fmap[style]))
        cur_w += fw
    if cur:
        lines.append(cur)
    return lines

def draw_rich_block(draw, text, x, y, max_w, max_h, size_start, color,
                    line_gap=1.06, align="left"):
    """Auto-shrinking rich paragraph. Returns bottom y."""
    for size in range(size_start, 17, -2):
        font = F("DejaVuSerif.ttf", size)
        hot = F("DejaVuSerif-Bold.ttf", size)
        stat = F("DejaVuSans-Bold.ttf", max(16, size - 2))
        lines = wrap_rich(text, font, hot, stat, max_w, draw)
        lh = int(size * line_gap + 6)
        if len(lines) * lh <= max_h:
            break
    yy = y
    for line in lines:
        lw = sum(draw.textlength(t, font=f) for t, _, f in line)
        xx = x
        if align == "center":
            xx = x + (max_w - lw) / 2
        for t, style, f in line:
            c = OXBLOOD if style == "hot" else (PENCIL if style == "statute" else color)
            draw.text((xx, yy), t, font=f, fill=c)
            xx += draw.textlength(t, font=f)
        yy += lh
    return yy

def fit_text(draw, text, font, max_w, max_lines, size):
    """Truncate to max_lines with ellipsis at the given size."""
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
            if len(lines) == max_lines:
                break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    joined = "\n".join(lines)
    consumed = len(joined.replace("\n", " ").split())
    if consumed < len(words):
        last = lines[-1] if lines else ""
        while last and draw.textlength(last + "…", font=font) > max_w:
            last = last[:-1]
        if lines:
            lines[-1] = last + "…"
        else:
            lines = [last + "…"]
    return "\n".join(lines)

def wrap_plain(draw, text, font, max_w, max_lines):
    return fit_text(draw, text, font, max_w, max_lines, None) if False else \
        fit_text(draw, text, font, max_w, max_lines, 0)

# ---------------------------------------------------------------- card ----

def render_card(row, vo_dur, out_path):
    img = Image.new("RGB", (W, H), BONE)
    d = ImageDraw.Draw(img)

    # Ruled paper.
    for y in range(40, H - 20, 44):
        d.line([(24, y), (W - 24, y)], fill=PAPER_DEEP, width=1)
    # Outer frame.
    d.rectangle([16, 16, W - 17, H - 17], outline=RULE, width=2)

    M = 44

    # Header: stamp + date + body.
    stamp_w = 168
    d.rectangle([M, 40, M + stamp_w, 104], fill=OXBLOOD)
    f_stamp = F("DejaVuSans-Bold.ttf", 34)
    tw = d.textlength(row["id"], font=f_stamp)
    d.text((M + (stamp_w - tw) / 2, 52), row["id"], font=f_stamp, fill=BONE)

    f_micro = F("DejaVuSansMono.ttf", 16)
    micro = "RECORD AUDIT · 2026"
    micro_len = d.textlength(micro, font=f_micro)
    d.text((W - M - micro_len, 48), micro, font=f_micro, fill=SLATE_DIM)

    # Fit date + body lines to the band between the stamp and the micro
    # label — the longest window titles (e.g. POE-13) overflowed at
    # fixed sizes and ran under / past "RECORD AUDIT · 2026".
    x_date = M + stamp_w + 26
    date_max = (W - M - micro_len - 16) - x_date
    size = 37
    while size > 24 and d.textlength(row["date"], font=F("DejaVuSerif-Bold.ttf", size)) > date_max:
        size -= 2
    f_date = F("DejaVuSerif-Bold.ttf", size)
    d.text((x_date, 42 + (37 - size) * 0.4), row["date"], font=f_date, fill=INK)

    f_body = F("DejaVuSans-Bold.ttf", 23)
    body_text = row["body"].upper()
    body_max = (W - M) - (M + stamp_w + 28)
    bsize = 23
    while bsize > 15 and d.textlength(body_text, font=F("DejaVuSans-Bold.ttf", bsize)) > body_max:
        bsize -= 1
    f_body = F("DejaVuSans-Bold.ttf", bsize)
    d.text((M + stamp_w + 28, 94), body_text, font=f_body, fill=PENCIL)

    # Double rule under header.
    d.line([(M, 148), (W - M, 148)], fill=RULE, width=2)
    d.line([(M, 154), (W - M, 154)], fill=RULE, width=1)

    y = 176
    f_label = F("DejaVuSans-Bold.ttf", 19)

    # THE REPRESENTATION
    d.rectangle([M, y + 4, M + 10, y + 22], fill=OXBLOOD)
    d.text((M + 20, y), "THE REPRESENTATION", font=f_label, fill=OXBLOOD)
    y = draw_rich_block(d, row["claim"], M, y + 30, W - 2 * M, 200, 30, INK)

    # THE WRITTEN RECORD (panel with oxblood accent).
    y += 18
    panel_top = y
    d.rectangle([M, y + 4, M + 10, y + 22], fill=OXBLOOD)
    d.text((M + 20, y), "THE WRITTEN RECORD", font=f_label, fill=OXBLOOD)
    text_top = y + 30
    # Pre-measure panel height by drawing text onto a pass: draw first, then
    # frame the panel behind it via a second draw order — simpler: measure.
    font0 = F("DejaVuSerif.ttf", 28)
    lines0 = wrap_rich(row["record"], font0, F("DejaVuSerif-Bold.ttf", 28),
                       F("DejaVuSans-Bold.ttf", 24), W - 2 * M - 36, d)
    panel_h = 30 + len(lines0) * 40 + 20
    d.rectangle([M, panel_top + 26, W - M, panel_top + 26 + panel_h],
                fill=PANEL)
    d.rectangle([M, panel_top + 26, M + 5, panel_top + 26 + panel_h],
                fill=OXBLOOD)
    y = draw_rich_block(d, row["record"], M + 20, text_top + 10,
                        W - 2 * M - 36, panel_h - 16, 28, INK)
    y = panel_top + 26 + panel_h + 20

    # Statute chip (auto-shrink to 2 lines).
    f_stat = F("DejaVuSans-Bold.ttf", 24)
    stat = row["statute"]
    while d.textlength(stat, font=f_stat) > W - 2 * M - 36 and f_stat.size > 17:
        f_stat = F("DejaVuSans-Bold.ttf", f_stat.size - 1)
    # Wrap manually to 2 lines if needed.
    if d.textlength(stat, font=f_stat) > W - 2 * M - 36:
        words_s, lines_s, cur = stat.split(), [], ""
        for w in words_s:
            trial = (cur + " " + w).strip()
            if d.textlength(trial, font=f_stat) <= W - 2 * M - 36:
                cur = trial
            else:
                lines_s.append(cur); cur = w
        if cur: lines_s.append(cur)
        stat_draw = "\n".join(lines_s[:2])
        n_lines = min(2, len(lines_s))
    else:
        stat_draw, n_lines = stat, 1
    chip_h = 18 + n_lines * 32
    d.rounded_rectangle([M, y, W - M, y + chip_h], radius=8, fill=PENCIL)
    d.text((M + 18, y + 8 + (0 if n_lines == 1 else 2)), stat_draw,
           font=f_stat, fill=BONE)
    y += chip_h + 18

    # Leverage (mono, one line).
    f_lev = F("DejaVuSansMono.ttf", 17)
    lev = fit_text(d, "LEVERAGE: " + row["leverage"], f_lev, W - 2 * M, 1, 0)
    d.text((M, y), lev, font=f_lev, fill=MUTED)
    y += 30

    # Tags as pills.
    f_tag = F("DejaVuSansMono.ttf", 16)
    x = M
    for tag in row["tags"][:5]:
        label = "#" + tag
        wtag = d.textlength(label, font=f_tag) + 22
        if x + wtag > W - M:
            break
        d.rounded_rectangle([x, y, x + wtag, y + 30], radius=15,
                            outline=RULE, width=1)
        d.text((x + 11, y + 5), label, font=f_tag, fill=MUTED)
        x += wtag + 10
    y += 44

    # Footer.
    d.line([(M, H - 78), (W - M, H - 78)], fill=RULE, width=1)
    f_foot = F("DejaVuSansMono.ttf", 15)
    src = fit_text(d, "source: " + row["source"], f_foot, W - 2 * M - 240, 1, 0)
    d.text((M, H - 64), src, font=f_foot, fill=PENCIL)
    right = f"READ {vo_dur:.0f}s · CARD 1080×960"
    d.text((W - M - d.textlength(right, font=f_foot), H - 64), right,
           font=f_foot, fill=SLATE_DIM)

    img.save(out_path)

def main():
    matrix = json.loads((WORK / "matrix.json").read_text())
    timings = json.loads((WORK / "timings.json").read_text())
    CARDS.mkdir(parents=True, exist_ok=True)
    for row in matrix["rows"]:
        read = timings["rows"][row["id"]]["duration"]
        render_card(row, read, CARDS / f'{row["id"]}.png')
        print(f'{row["id"]}: card rendered (READ {read:.1f}s)')
    print(f"\n{len(matrix['rows'])} cards -> {CARDS}")

if __name__ == "__main__":
    sys.exit(main())
