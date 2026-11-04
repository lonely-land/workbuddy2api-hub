"""The dashboard's split-out CSS/JS must be served, cacheable and bounded.

The page is now an HTML template plus static/dashboard/{css,js}/. This suite
runs a real gateway in a temporary copy and checks the contract the browser
relies on:

  1. every /static/dashboard/... reference in the served page answers 200 with
     the right Content-Type and a non-empty body;
  2. assets carry ETag + no-cache and answer 304 to a matching If-None-Match;
  3. a missing file, a directory URL and a path-traversal attempt all answer
     404 (no file outside static/dashboard/ is ever sent).

    python tests/_test_dashboard_static.py
"""
import http.client
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PY = os.path.join(ROOT, "python", "python.exe")
if not os.path.exists(PY):
    PY = sys.executable
sys.path.insert(0, HERE)

import _lifecycle as life            # noqa: E402

PASS = 0
FAIL = 0


def check(label, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print("  [PASS] %s" % label)
    else:
        FAIL += 1
        print("  [FAIL] %s %s" % (label, detail))


port = life.free_port()
work = tempfile.mkdtemp(prefix="dashstatic_")
tree = os.path.join(work, "gateway")
shutil.copytree(ROOT, tree, ignore=shutil.ignore_patterns(
    "__pycache__", ".git", ".github", "tests", "usage", "accounts"))
store = os.path.join(work, "accounts")
os.makedirs(store)

proc = life.spawn_managed(
    [PY, os.path.join(tree, "wb_proxy.py"), "--port", str(port), "--host", "127.0.0.1",
     "--accounts-dir", store],
    cwd=tree, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
    env=dict(os.environ, WB_PROXY_USAGE_DIR=os.path.join(work, "usage")))


def get(path, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=20)
    try:
        conn.request("GET", path, headers=headers or {})
        resp = conn.getresponse()
        return resp.status, resp.headers, resp.read()
    finally:
        conn.close()


def wait_ready():
    for _ in range(40):
        time.sleep(0.5)
        try:
            status, _, _ = get("/health")
            if status == 200:
                return True
        except Exception:
            if proc.poll() is not None:
                return False
    return False


try:
    if not wait_ready():
        print("  [FAIL] server did not start")
        sys.exit(1)

    print("[1] the served page references assets that answer 200")
    status, headers, body = get("/")
    check("dashboard 200", status == 200, status)
    html = body.decode("utf-8")
    refs = sorted(set(re.findall(r'(?:href|src)="(/static/dashboard/[^"]+)"', html)))
    check("page references static assets", len(refs) > 0, refs[:3])
    for ref in refs:
        status, headers, asset = get(ref)
        want = "text/css" if ref.endswith(".css") else "text/javascript"
        ctype = headers.get("Content-Type", "")
        check("%s 200" % ref, status == 200, status)
        check("%s content-type %s" % (ref, want), want in ctype, ctype)
        check("%s non-empty" % ref, len(asset) > 0, len(asset))
        check("%s no-cache" % ref, "no-cache" in headers.get("Cache-Control", ""),
              headers.get("Cache-Control"))
        check("%s has ETag" % ref, bool(headers.get("ETag")),
              headers.get("ETag"))
        check("%s nosniff" % ref, headers.get("X-Content-Type-Options") == "nosniff",
              headers.get("X-Content-Type-Options"))

    print("[2] a matching If-None-Match gets a bodyless 304")
    ref = refs[0]
    status, headers, _ = get(ref)
    etag = headers["ETag"]
    status, headers, body304 = get(ref, {"If-None-Match": etag})
    check("304", status == 304, status)
    check("304 keeps ETag", headers.get("ETag") == etag, headers.get("ETag"))
    check("304 has no body", body304 == b"", len(body304))

    print("[3] missing / directory / traversal all answer 404")
    for path in ("/static/dashboard/js/does-not-exist.js",
                 "/static/dashboard/js/",
                 "/static/dashboard/../wb_proxy.py",
                 "/static/dashboard/%2e%2e/wb_proxy.py"):
        status, _, _ = get(path)
        check("%s -> 404" % path, status == 404, status)
except Exception as exc:  # pragma: no cover - surface the failure in the log
    FAIL += 1
    print("  [FAIL] %r" % exc)
finally:
    life.stop_managed(proc)
    shutil.rmtree(work, ignore_errors=True)

print("SUMMARY: PASS=%d FAIL=%d" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
