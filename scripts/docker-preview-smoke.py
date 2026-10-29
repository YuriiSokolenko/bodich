#!/usr/bin/env python3
"""Loopback HTTP smoke checks for the Nginx runtime image."""

from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import time
import sys


BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4321/"
REQUIRED_HEADERS = {
    "content-security-policy": "default-src 'self'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "x-robots-tag": "noindex",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
}


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.css = []
        self.js = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and "stylesheet" in attrs.get("rel", "").split():
            self.css.append(attrs.get("href", ""))
        if tag == "script" and attrs.get("src"):
            self.js.append(attrs["src"])


def fetch(path, method="GET", expected=200):
    request = Request(BASE.rstrip("/") + path, method=method)
    try:
        response = urlopen(request, timeout=10)
    except HTTPError as error:
        response = error
    except URLError as error:
        raise AssertionError(f"{method} {path}: request failed: {error}") from error
    with response:
        acceptable = expected if isinstance(expected, tuple) else (expected,)
        assert response.status in acceptable, f"{method} {path}: expected {acceptable}, got {response.status}"
        headers = {k.lower(): v for k, v in response.headers.items()}
        for name, expected_value in REQUIRED_HEADERS.items():
            assert headers.get(name, "").startswith(expected_value), f"{path}: missing/incorrect {name}"
        return response.read(), headers


for _ in range(60):
    try:
        with urlopen(BASE, timeout=2) as response:
            if response.status == 200:
                break
    except (HTTPError, URLError, TimeoutError):
        time.sleep(1)
else:
    raise AssertionError(f"preview did not become available at {BASE} within 60 seconds")


sections = ["", "products", "accessories", "support", "about", "contact"]
categories = [
    ("products", "turbine-engines"),
    ("accessories", "ecu-controls"),
    ("accessories", "fuel-systems"),
    ("accessories", "electrical-components"),
    ("accessories", "mounting-hardware"),
]
for locale in ("en", "ro"):
    for section in sections:
        path = f"/{locale}/{section + '/' if section else ''}"
        body, headers = fetch(path)
        assert headers.get("content-type", "").startswith("text/html"), f"{path}: not HTML"
        assert f'<html lang="{locale}"' in body.decode("utf-8").lower(), f"{path}: wrong document language"
    for section, category in categories:
        path = f"/{locale}/{section}/{category}/"
        body, _ = fetch(path)
        assert f'<html lang="{locale}"' in body.decode("utf-8").lower(), f"{path}: wrong document language"

root, _ = fetch("/")
assert b"/en/" in root, "root route must direct users to the English locale"
for path in ("/robots.txt", "/sitemap.xml"):
    fetch(path)

html, _ = fetch("/en/")
assets = Assets()
assets.feed(html.decode("utf-8"))
assert assets.css, "homepage must reference a static stylesheet"
assert assets.js, "homepage must reference an external static JavaScript asset"
for path in [assets.css[0], assets.js[0]]:
    body, headers = fetch(path)
    assert body, f"static asset is empty: {path}"
    assert not path.endswith(".css") or headers.get("content-type", "").startswith("text/css"), path
    assert not path.endswith(".js") or "javascript" in headers.get("content-type", ""), path

for path in (
    "/not-a-published-route/",
    "/en/not-a-published-route/",
    "/docs/catalog/source-inventory.json",
    "/private-catalog-review/",
    "/_headers",
):
    fetch(path, expected=404)
fetch("/%2e%2e/etc/passwd", expected=(400, 404))
fetch("/en/", method="HEAD")
fetch("/en/", method="POST", expected=405)
print("Docker preview smoke checks passed: EN/RO routes, CSS/JS, headers, 404s, methods and path traversal.")
