/* Stored-XSS regression: account / model / key names must be escaped before the
 * usage analytics tables put them into innerHTML.
 *
 * The payload is imported with an account JSON (nickname / uid) or comes from
 * the model catalog and the panel's key names. Before the fix the `who` cell
 * was raw template interpolation, so a nickname became live markup inside the
 * panel (which can export account credentials).
 *
 * The `dimDefs` object and the `esc` helper are sliced out of the shipped
 * dashboard.html and evaluated with only `state` / `fmtCompact` supplied, the
 * same extraction pattern other dashboard suites use. Requires node.
 *
 *   node _test_dashboard_xss.js
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');

const start = html.indexOf('const dimDefs = {');
assert.ok(start > 0, 'dimDefs moved; update this test marker');
const end = html.indexOf('\n};\nconst DIM_LAYOUT_KEY', start);
assert.ok(end > start, 'dimDefs tail marker not found; update this test');
const dimSource = html.slice(start, end + 3);

const escMatch = html.match(/const esc = s => [^\n]+/);
assert.ok(escMatch, 'esc helper moved; update this test marker');
const esc = new Function(escMatch[0] + '\n; return esc;')();

const state = {analytics: null};
const dimDefs = new Function('state', 'fmtCompact', 'esc',
  dimSource + '\n; return dimDefs;')(state, n => String(n == null ? 0 : n), esc);

const XSS = '<img src=x onerror="window.__xss=1">';
const win = () => ({
  requests: 3, total_tokens: 120, reasoning_tokens: 10, cached_tokens: 20,
  speed_avg: 42, cache_hit_pct: 50, credit: 1.5, cost_cny: 0.01,
});

state.analytics = {
  accounts: [{uid: XSS, nickname: XSS, realm: 'intl', window: win()}],
  models: [{model: '<script>alert(1)</script>', window: win()}],
  keys: [{key: XSS, name: XSS, source: '<b>panel</b>', realm: 'intl',
          window: win()}],
};

const accountWho = dimDefs.account.rows()[0].who;
assert.ok(accountWho.includes('&lt;img'),
          'account nickname is not escaped: ' + accountWho);
assert.ok(!accountWho.includes('<img'),
          'raw <img> survived in the account row: ' + accountWho);
assert.ok(accountWho.includes('&quot;'),
          'the attribute quote is not escaped: ' + accountWho);

const modelWho = dimDefs.model.rows()[0].who;
assert.ok(!modelWho.includes('<script'),
          'raw <script> survived in the model row: ' + modelWho);
assert.ok(modelWho.includes('&lt;script'),
          'model name is not escaped: ' + modelWho);

const keyWho = dimDefs.key.rows()[0].who;
assert.ok(!keyWho.includes('<img'),
          'raw <img> survived in the key row: ' + keyWho);
assert.ok(!keyWho.includes('<b>panel</b>'),
          'raw key source survived: ' + keyWho);
assert.ok(keyWho.includes('&lt;img'), 'key name is not escaped: ' + keyWho);

// Benign names must still render as before (escaping only touches & < > ").
state.analytics.accounts[0] = {
  uid: 'uid-1234567890', nickname: '正常昵称 <VIP>', realm: 'cn', window: win(),
};
const benign = dimDefs.account.rows()[0].who;
assert.ok(benign.includes('正常昵称 &lt;VIP&gt;'),
          'benign nickname changed: ' + benign);
console.log('dashboard XSS assertions passed');
