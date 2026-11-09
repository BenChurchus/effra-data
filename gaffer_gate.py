"""
Encrypts the gaffer's room (site-src/master.html) into docs/master.html.

GitHub Pages can't password-protect a page, so the page itself is encrypted:
AES-256-GCM with a key derived from the password via PBKDF2-SHA256. The
published docs/master.html is a small unlock screen plus ciphertext; the
browser decrypts it with WebCrypto once the right password is typed.

The password is read from the EFFRA_GAFFER_PASSWORD environment variable or a
local `.gaffer-password` file (git-ignored). It is never written to the repo.
If neither exists (e.g. the scheduled refresh on GitHub), the existing
encrypted page is left as-is: it only needs re-encrypting when the master
sheet's own code changes, not when the data does (data loads at runtime).

Note: this hides the awards *page*. The match data and stats engine are
public, so someone determined could still recompute standings themselves.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path

ROOT = Path(__file__).parent
SOURCE = ROOT / "site-src" / "master.html"
OUTPUT = ROOT / "docs" / "master.html"
PASSWORD_FILE = ROOT / ".gaffer-password"
ITERATIONS = 310_000


def read_password() -> str | None:
    pw = os.environ.get("EFFRA_GAFFER_PASSWORD")
    if pw:
        return pw.strip()
    if PASSWORD_FILE.exists():
        return PASSWORD_FILE.read_text(encoding="utf-8").strip() or None
    return None


def encrypt(plaintext: str, password: str) -> dict:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(password.encode())
    ct = AESGCM(key).encrypt(iv, plaintext.encode("utf-8"), None)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return {"v": 1, "iter": ITERATIONS, "salt": b64(salt), "iv": b64(iv), "ct": b64(ct)}


def decrypt(payload: dict, password: str) -> str:
    """Python mirror of the browser unlock, used by the tests."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    d = lambda s: base64.b64decode(s)  # noqa: E731
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=d(payload["salt"]), iterations=payload["iter"]).derive(password.encode())
    return AESGCM(key).decrypt(d(payload["iv"]), d(payload["ct"]), None).decode("utf-8")


def read_payload(html: str) -> dict:
    start = html.index('<script type="application/json" id="locked">') + len('<script type="application/json" id="locked">')
    return json.loads(html[start:html.index("</script>", start)])


def render(css_ref: str, source_html: str, payload_json: str) -> str:
    return (GATE.replace("__CSS__", css_ref).replace("__ASSETS__", asset_refs(source_html))
            .replace("__PAYLOAD__", payload_json))


GATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="effra-assets" content="__ASSETS__">
<title>Gaffer’s room · Effra Rovers FC</title>
<link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png">
<script>try { var t = localStorage.getItem('effra-theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) {}</script>
<link rel="stylesheet" href="__CSS__">
<style>
  .gate { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
  .gate-card { width: min(380px, 100%); text-align: center; }
  .gate-card img { width: 88px; height: 88px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 3px var(--gold-bright); }
  .gate-card h1 { margin: 14px 0 4px; font-size: 1.3rem; }
  .gate-card form { display: grid; gap: 10px; margin-top: 18px; text-align: left; }
  .gate-card .btn { justify-content: center; background: var(--brand-crest); color: #fff; border: 0; font-weight: 700; min-height: 44px; }
  .gate-err { color: var(--loss); font-size: 0.85rem; min-height: 1.2em; }
  .gate-remember { font-size: 0.82rem; color: var(--muted); display: flex; gap: 6px; align-items: center; }
</style>
</head>
<body>
<main class="gate">
  <div class="card gate-card">
    <a href="./" aria-label="Back to the Effra Rovers FC site"><img src="assets/icon-192.png" alt=""></a>
    <h1>Gaffer’s room</h1>
    <div class="sub">Awards and the master sheet. Staff only.</div>
    <form id="f" autocomplete="off">
      <label class="field" for="pw">Password
        <input id="pw" type="password" required autofocus style="width:100%;padding:10px 12px;font:inherit;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--ink);min-height:44px">
      </label>
      <label class="gate-remember"><input type="checkbox" id="remember"> Remember on this device</label>
      <button class="btn" type="submit" id="go">Unlock</button>
      <div class="gate-err" id="err" role="alert"></div>
    </form>
    <div class="sub" style="margin-top:12px"><a href="./">← Back to the site</a></div>
  </div>
</main>
<script type="application/json" id="locked">__PAYLOAD__</script>
<script>
(function () {
  'use strict';
  var KEY = 'effra-gaffer-key';
  var payload = JSON.parse(document.getElementById('locked').textContent);
  var b = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
  function derive(pw) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) { return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b(payload.salt), iterations: payload.iter }, k, 256); });
  }
  function open(raw) {
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
      .then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(payload.iv) }, key, b(payload.ct)); })
      .then(function (pt) {
        var html = new TextDecoder().decode(pt);
        document.open(); document.write(html); document.close();
      });
  }
  var hex = function (buf) { return Array.from(new Uint8Array(buf)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''); };
  var unhex = function (h) { return new Uint8Array(h.match(/../g).map(function (x) { return parseInt(x, 16); })); };
  // A saved key is tied to this exact encryption (salt), so it stops working
  // automatically if the password or page is re-encrypted.
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.salt === payload.salt) { open(unhex(saved.key)).catch(function () { localStorage.removeItem(KEY); }); }
  } catch (e) {}
  document.getElementById('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var go = document.getElementById('go'), err = document.getElementById('err');
    if (!window.crypto || !crypto.subtle) { err.textContent = 'This browser can’t unlock the page (needs HTTPS).'; return; }
    go.disabled = true; go.textContent = 'Unlocking…'; err.textContent = '';
    // read the tick-box now: unlocking replaces this whole document
    var remember = document.getElementById('remember').checked;
    derive(document.getElementById('pw').value).then(function (raw) {
      // verify the key first (decrypt throws on a wrong password), then save, then show
      return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
        .then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(payload.iv) }, key, b(payload.ct)); })
        .then(function () {
          if (remember) { try { localStorage.setItem(KEY, JSON.stringify({ salt: payload.salt, key: hex(raw) })); } catch (e2) {} }
          return open(raw);
        });
    }).catch(function () {
      go.disabled = false; go.textContent = 'Unlock';
      err.textContent = 'Wrong password. Nice try, Gman.';
      document.getElementById('pw').select();
    });
  });
})();
</script>
</body>
</html>
"""


ASSET_META_RE = r'<meta name="effra-assets" content="([^"]*)">'


def asset_refs(html: str) -> str:
    """The versioned asset references a page loads, e.g. 'effra.css?v=..,effra.js?v=..'.
    Published (unencrypted) on the gate so tests can spot a stale encryption."""
    import re
    return ",".join(sorted(set(re.findall(r'(?:href|src)="((?:effra|charts|wrapped)\.[a-z]+\?v=[0-9a-f]+)"', html))))


def build(source_html: str, css_ref: str) -> bool:
    """Encrypt `source_html` into docs/master.html. Returns False if no password."""
    password = read_password()
    if not password:
        print("Gaffer room: no password available; leaving existing docs/master.html as-is")
        return False
    # Skip if the published page already decrypts to exactly this source with
    # this password: avoids churn and keeps "remember on this device" valid.
    if OUTPUT.exists():
        try:
            existing = OUTPUT.read_text(encoding="utf-8")
            old = read_payload(existing)
            same_shell = render(css_ref, source_html, json.dumps(old)) == existing
            if same_shell and decrypt(old, password) == source_html:
                print("Gaffer room: unchanged")
                return True
        except Exception:
            pass
    OUTPUT.write_text(render(css_ref, source_html, json.dumps(encrypt(source_html, password))), encoding="utf-8")
    print("Gaffer room: encrypted docs/master.html")
    return True
