"use strict";
/**
 * Regenerate src/ui/icons.js from the Hugeicons free set (MIT).
 *
 * The app ships the full free icon set as one compact runtime asset:
 *   window.SpanishFlashcardsIcons = { "home-01": "<path .../>", ... }
 * Each icon's inner markup uses currentColor and omits the default stroke geometry
 * (fill=none, stroke-width=1.5, stroke-linecap/linejoin=round) — card-art's iconSvg
 * wrapper carries those — so the file stays as small as possible (~5.3MB raw).
 *
 * Usage (from the repo root):
 *   curl -sL "https://cdn.jsdelivr.net/npm/@hugeicons/core-free-icons@4.4.0/dist/cjs/index.min.js" -o /tmp/hugeicons.min.js
 *   node scripts/build-icons.js /tmp/hugeicons.min.js src/ui/icons.js
 *
 * Bump the @version in that URL to pull a newer set. The `-free-icons` alias exports
 * are exact duplicates of the short slug and are dropped.
 */
const fs = require("fs");
const path = require("path");

const [, , bundlePath, outPath] = process.argv;
if (!bundlePath || !outPath) {
  console.error("usage: node scripts/build-icons.js <hugeicons.min.js> <out.js>");
  process.exit(1);
}
const mod = require(path.resolve(bundlePath));

function attrName(k) { return k === "className" ? "class" : k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()); }
function esc(v) { return String(v).replace(/"/g, "&quot;"); }
// These are hoisted to the <svg> wrapper in card-art (iconSvg); stroke is NOT hoisted
// so a filled element (fill=currentColor, no stroke) never gets an accidental outline.
function isDefault(name, val) {
  val = String(val);
  return (name === "fill" && val === "none") ||
    (name === "stroke-width" && val === "1.5") ||
    (name === "stroke-linecap" && val === "round") ||
    (name === "stroke-linejoin" && val === "round");
}
function elToMarkup(el) {
  if (!Array.isArray(el)) return "";
  const tag = el[0], attrs = el[1] || {};
  let s = "<" + tag;
  for (const k of Object.keys(attrs)) {
    if (k === "key") continue;
    const an = attrName(k);
    if (isDefault(an, attrs[k])) continue;
    s += " " + an + '="' + esc(attrs[k]) + '"';
  }
  return s + "/>";
}
function slug(name) {
  return name.replace(/Icon$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .toLowerCase();
}

const out = {};
let n = 0, alias = 0;
for (const name of Object.keys(mod)) {
  const s = slug(name);
  if (s.endsWith("-free-icons")) { alias++; continue; }
  const data = mod[name];
  if (!Array.isArray(data) || !data.length) continue;
  const inner = data.map(elToMarkup).join("");
  if (!inner) continue;
  out[s] = inner;
  n++;
}

const file =
  "// Hugeicons free set (MIT) — see src/ui/HUGEICONS-LICENSE.txt. Generated asset; do\n" +
  "// not hand-edit. Regenerate with scripts/build-icons.js. Loaded lazily; themed via\n" +
  "// currentColor; stroke-geometry defaults live on card-art's iconSvg <svg> wrapper.\n" +
  "(function (root) { \"use strict\"; root.SpanishFlashcardsIcons = " + JSON.stringify(out) + ";\n" +
  "  if (typeof root.dispatchEvent === \"function\" && typeof Event === \"function\") { try { root.dispatchEvent(new Event(\"sf-icons-ready\")); } catch (e) {} }\n" +
  "})(typeof self !== \"undefined\" ? self : this);\n";
fs.writeFileSync(outPath, file);
console.log("icons:", Object.keys(out).length, "| aliases dropped:", alias, "| bytes:", fs.statSync(outPath).size);
