"""Content fingerprint for change detection (the silent-edit detector's input).

Why this exists: hashing a news page's *whole* text made every page "change" every cycle, because
the page chrome changes constantly — sidebar timestamps ("10 hours ago" -> "11 hours ago"), the
rotating "Latest News" list, menus and footers. Each of those was published as a SILENT EDIT of the
article, i.e. as a claim that the outlet quietly altered its story. They were not edits.

The fingerprint is therefore the *article*, not the page:
  1. If the page marks its article body (WordPress `entry-content`, `itemprop="articleBody"`,
     `article-body`, `story-body`, `post-content` ...), use the <h1> headline(s) + that body.
  2. Otherwise use the page text minus chrome: <nav>, <aside>, <header>, <footer>, <form>, and
     elements whose class/id marks them as sidebar / widget / related / latest / menu / share / ad.
  3. In both cases relative times ("3 hours ago", "just now", "yesterday") are dropped and
     whitespace is collapsed.
A real edit to a headline or the article body still changes the fingerprint.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser

FP_VERSION = "2"

_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
         "source", "track", "wbr"}
_NEVER_TEXT = {"script", "style", "noscript", "template", "svg", "iframe"}
_CHROME_TAGS = {"nav", "aside", "header", "footer", "dialog"}
# page-wide wrappers are never chrome (ASP.NET wraps the whole page in <form>; some sites put
# classes like "fixed-scroll-nav" on <body>)
_STRUCTURAL = {"html", "body", "main", "form", "article"}
_CHROME_TOKEN = re.compile(
    r"^(?:[\w]+[_-])?(?:sidebar|widget|widgets|related|relatedposts|recent|latest|trending|popular|"
    r"most-read|mostread|newsletter|subscribe|share|sharing|social|comments?|advert|ads?|adunit|"
    r"sponsor|promo|breadcrumbs?|emergency|announcements?|menu|navbar|nav|masthead|site-header|site-footer|footer|cookie|"
    r"modal|popup|homepage-articles|newspack-blocks|jp-relatedposts|wp-block-latest-posts)(?:[_-][\w-]*)?$",
    re.I)
_BODY_ATTR = re.compile(
    r"(?:^|[\s_-])(?:entry-content|article-body|articlebody|article-content|story-body|story-content|"
    r"post-content|post-body|field-name-body|body-copy)(?:$|[\s_-])", re.I)
_REL_TIME = re.compile(
    r"^\s*(?:(?:about\s+)?(?:\d+|an?|one)\s+(?:second|sec|minute|min|hour|hr|day|week|month|year)s?\s+ago"
    r"|just now|moments? ago|yesterday|today|updated\s+.*\bago)\s*$", re.I)


class _Extractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, bool, bool]] = []  # (tag, opens_chrome, opens_body)
        self.never = 0
        self.chrome = 0
        self.body = 0
        self.h1 = 0
        self.page: list[str] = []
        self.all: list[str] = []
        self.body_parts: list[str] = []
        self.h1_parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in _VOID:
            return
        a = dict(attrs)
        marker = " ".join(filter(None, [a.get("class"), a.get("id"), a.get("role"), a.get("itemprop")]))
        is_body = bool(_BODY_ATTR.search(marker)) or (a.get("itemprop") or "").lower() == "articlebody"
        is_chrome = (tag not in _STRUCTURAL and not is_body
                     and (tag in _CHROME_TAGS or any(_CHROME_TOKEN.match(t) for t in marker.split())))
        if tag in _NEVER_TEXT:
            self.never += 1
        if is_chrome:
            self.chrome += 1
        if is_body:
            self.body += 1
        if tag == "h1":
            self.h1 += 1
        self.stack.append((tag, is_chrome, is_body))

    def handle_endtag(self, tag):
        if tag in _VOID:
            return
        # pop to the matching open tag (tolerates unclosed children)
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for t, c, b in self.stack[i:]:
                    if t in _NEVER_TEXT and self.never:
                        self.never -= 1
                    if c and self.chrome:
                        self.chrome -= 1
                    if b and self.body:
                        self.body -= 1
                    if t == "h1" and self.h1:
                        self.h1 -= 1
                del self.stack[i:]
                return

    def handle_data(self, data):
        if self.never or not data.strip():
            return
        s = data.strip()
        if self.h1:
            self.h1_parts.append(s)
        if self.body:
            self.body_parts.append(s)
        self.all.append(s)
        if not self.chrome:
            self.page.append(s)


def _clean(parts: list[str]) -> str:
    lines = []
    for p in parts:
        p = re.sub(r"\s+", " ", p).strip()
        if p and not _REL_TIME.match(p):
            lines.append(p)
    return "\n".join(lines)


_LOADER = re.compile(r"^(?:loading(?:\.\.\.|…)?|please wait.*|[\w.-]+\.(?:php|aspx?|jsp)|"
                     r"javascript (?:is )?required.*|enable javascript.*)$", re.I)


def content_text(html: str) -> str:
    """Article text used for fingerprinting and for silent-edit diffs.

    A JavaScript shell (e.g. Granicus "DocumentViewer.php / Loading…") or an empty page yields ""
    so flipping between the two is not an edit; real content appearing or disappearing still is.
    """
    text = _content_text(html)
    lines = [l for l in text.splitlines() if not _LOADER.match(l.strip())]
    if all(_LOADER.match(tok) for tok in " ".join(lines).split()):
        return ""  # only a loader shell (or nothing at all)
    return "\n".join(lines)


def _content_text(html: str) -> str:
    ex = _Extractor()
    try:
        ex.feed(html)
        ex.close()
    except Exception:
        pass
    body = _clean(ex.body_parts)
    if len(body) >= 200:  # the page marks its article body: headline + body only
        head = _clean(ex.h1_parts[:2])
        return (head + "\n" + body).strip()
    page, full = _clean(ex.page), _clean(ex.all)
    if len(page) < 0.25 * len(full) and len(full) > 400:
        # stripping removed most of the page: markup we don't understand; fall back to the whole
        # text (minus relative times) - more noise, but never a missed edit
        return full
    return page


def looks_like_html(raw: bytes, name: str = "") -> bool:
    if name.lower().split("?")[0].endswith((".html", ".htm")):
        return True
    head = raw[:2048].lstrip().lower()
    return head.startswith((b"<!doctype", b"<html")) or b"<html" in head[:400]


def canonical(text: str) -> str:
    """Whitespace/line-break-insensitive form used for the hash (a colon moving to the next line
    is not an edit); the line form from content_text() is kept for human-readable diffs."""
    t = re.sub(r"\s+", " ", text).strip()
    return re.sub(r"\s+([:;,.!?)\]])", r"\1", t)
