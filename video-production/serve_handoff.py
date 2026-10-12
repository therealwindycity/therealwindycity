#!/usr/bin/env python3
"""Temporary read-only HTTP host for the new-video agent handoff.

Only the handoff Markdown is exposed; repository files and media are not served.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit

HANDOFF = Path(__file__).with_name("NEW_VIDEO_AGENT_HANDOFF.md")


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path not in ("/", "/NEW_VIDEO_AGENT_HANDOFF.md"):
            self.send_error(404, "Only the video-agent handoff is hosted here.")
            return
        data = HANDOFF.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/markdown; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
