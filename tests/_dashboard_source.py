"""Read the shipped dashboard page and the CSS/JS it references.

The page is an HTML template plus static/dashboard/{css,js}/ files. Python
suites that grep JS/CSS source use dashboard_combined(); suites that assert
markup / page containers can keep using dashboard_html().
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML_PATH = ROOT / "dashboard.html"


def _read_asset(url):
    return (ROOT / url.lstrip("/")).read_text(encoding="utf-8")


def dashboard_html():
    return HTML_PATH.read_text(encoding="utf-8")


def dashboard_script():
    html = dashboard_html()
    out = []
    for match in re.finditer(r"<script\b([^>]*)>([\s\S]*?)</script>", html):
        src = re.search(r'\bsrc="([^"]+)"', match.group(1))
        out.append(_read_asset(src.group(1)) if src else match.group(2))
    return "\n".join(out)


def dashboard_css():
    html = dashboard_html()
    out = []
    for match in re.finditer(r"<(link|style)\b([^>]*)>", html):
        if match.group(1) == "link":
            if not re.search(r'\brel="stylesheet"', match.group(2)):
                continue
            href = re.search(r'\bhref="([^"]+)"', match.group(2))
            if href:
                out.append(_read_asset(href.group(1)))
    for match in re.finditer(r"<style\b([^>]*)>([\s\S]*?)</style>", html):
        out.append(match.group(2))
    return "\n".join(out)


def dashboard_combined():
    return "\n".join((dashboard_html(), dashboard_css(), dashboard_script()))
