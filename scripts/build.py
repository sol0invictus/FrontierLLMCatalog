#!/usr/bin/env python3
"""Bundle index.html + assets + data into self-contained HTML files.

Outputs:
  dist/index.html      full standalone document; dist/ is the folder to host
  build/artifact.html  same page without the <html>/<head>/<body> wrapper,
                       for hosts that supply their own document skeleton
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
BUILD = ROOT / "build"


def inline(html: str) -> str:
    def css(m):
        return "<style>\n" + (ROOT / m.group(1)).read_text() + "\n</style>"

    def js(m):
        return "<script>\n" + (ROOT / m.group(1)).read_text() + "\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="(assets/[^"]+)">', css, html)
    html = re.sub(r'<script src="((?:assets|data)/[^"]+)"></script>', js, html)
    return html


def fragment(html: str) -> str:
    for pat in (r"<!doctype html>\s*", r"<html[^>]*>\s*", r"</html>\s*", r"<head>\s*",
                r"</head>\s*", r"<body>\s*", r"</body>\s*",
                r'<meta charset="utf-8">\s*', r'<meta name="viewport"[^>]*>\s*'):
        html = re.sub(pat, "", html, flags=re.IGNORECASE)
    # Keep <title> first so hosts that scan the top of the file find it.
    title = re.search(r"<title>.*?</title>", html).group(0)
    return title + "\n" + html.replace(title, "", 1)


def main():
    DIST.mkdir(exist_ok=True)
    BUILD.mkdir(exist_ok=True)
    full = inline((ROOT / "index.html").read_text())
    (DIST / "index.html").write_text(full)
    (BUILD / "artifact.html").write_text(fragment(full))
    stale = DIST / "artifact.html"
    if stale.exists():
        stale.unlink()
    print("wrote", DIST / "index.html", "and", BUILD / "artifact.html")


if __name__ == "__main__":
    main()
