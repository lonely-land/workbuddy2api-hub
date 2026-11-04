/* The shipped dashboard page, and the source of the CSS/JS it ships.
 *
 * The page is split into an HTML template plus static/dashboard/{css,js}/.
 * Suites that evaluate the page pass dashboardScript(); suites that grep source
 * text (functions, CSS rules, i18n strings) pass dashboardCombined() so the
 * assertions keep seeing the same code wherever it lives. Suites that assert
 * document order / page containers use dashboardHtml() (the template only).
 *
 *   const {dashboardScript} = require('./_dashboard_source.js');
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'dashboard.html');

function readAsset(url) {
  return fs.readFileSync(path.join(ROOT, url.replace(/^\/+/, '')), 'utf8');
}

// The page template, without external CSS/JS bodies.
function dashboardHtml() {
  return fs.readFileSync(HTML_PATH, 'utf8');
}

// Inline scripts + external <script src> bodies, in document order - what a
// suite evaluates.
function dashboardScript() {
  const html = dashboardHtml();
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .map(match => {
      const src = /\bsrc="([^"]+)"/.exec(match[1]);
      return src ? readAsset(src[1]) : match[2];
    }).join('\n');
}

// External stylesheets + inline <style> bodies, in document order.
function dashboardCss() {
  const html = dashboardHtml();
  const out = [];
  for (const match of html.matchAll(/<(link|style)\b([^>]*)>/g)) {
    if (match[1] === 'link') {
      if (!/\brel="stylesheet"/.test(match[2])) continue;
      const href = /\bhref="([^"]+)"/.exec(match[2]);
      if (href) out.push(readAsset(href[1]));
    }
  }
  for (const match of html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/g)) {
    out.push(match[2]);
  }
  return out.join('\n');
}

// Everything a source-grepping suite may want: template + CSS + JS text.
function dashboardCombined() {
  return [dashboardHtml(), dashboardCss(), dashboardScript()].join('\n');
}

module.exports = {dashboardHtml, dashboardScript, dashboardCss, dashboardCombined};
