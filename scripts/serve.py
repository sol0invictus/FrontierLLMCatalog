#!/usr/bin/env python3
"""Serve dist/ locally the way the host does: unknown paths get index.html.

Model pages live at /<slug> and comparisons at /compare/<a>-vs-<b>. Those paths
have no files, so a plain static server would 404 on reload. Usage:
  python3 scripts/serve.py [port]   (default 8765)
"""
import http.server
import pathlib
import sys

DIST = pathlib.Path(__file__).resolve().parent.parent / "dist"


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def send_head(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if not (DIST / path.lstrip("/")).exists():
            self.path = "/index.html"
        return super().send_head()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(("127.0.0.1", port), SPAHandler).serve_forever()
