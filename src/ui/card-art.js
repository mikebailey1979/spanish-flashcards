// @ts-check
/**
 * Card art (Phase: visual theme) — deterministic per-lesson watermark art.
 *
 * Every lesson card (home + lessons) and the Continue/Resume hero gets:
 *   - an accent COLOR (left edge, pill, icon, pattern tint),
 *   - a subject ICON (Hugeicons outline, matched from the lesson name),
 *   - a background PATTERN (one of 50, chosen deterministically),
 *   - a clean HOLE masked around the icon so the pattern never overlays it.
 *
 * All three are derived from the lesson (id + name) with a stable hash, so a
 * new lesson automatically gets a consistent, repeatable look with nothing to
 * store or migrate. Icons/patterns are inline SVG themed via `currentColor`.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SpanishFlashcardsCardArt = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const W = 320, H = 92, FX = 230, FY = 46;
  let _uid = 0;

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(s) {
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function S(inner) {
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" stroke-width="1.3">' + inner + '</svg>';
  }
  function P(tw, th, tile, tr) {
    const id = "fp" + (++_uid);
    return '<defs><pattern id="' + id + '" width="' + tw + '" height="' + th + '" patternUnits="userSpaceOnUse"' + (tr ? ' patternTransform="' + tr + '"' : "") + '>' + tile + '</pattern></defs><rect width="' + W + '" height="' + H + '" fill="url(#' + id + ')"/>';
  }

  // [name, opacity, draw()] — each draw returns inner SVG markup.
  const PATTERNS = [
    ["Greek key", .24, function () { return P(22, 22, '<path d="M2 2h14v14h-10v-6h6" stroke-width="1.4"/>'); }],
    ["Chevron", .2, function () { return P(20, 14, '<path d="M0 12 L10 2 L20 12" stroke-width="1.4"/>'); }],
    ["Herringbone", .2, function () { return P(24, 24, '<path d="M0 12 L12 0 M12 24 L24 12 M12 0 L24 12 M0 12 L12 24" stroke-width="1.3"/>'); }],
    ["Houndstooth", .26, function () { return P(16, 16, '<path fill="currentColor" stroke="none" d="M0 0h8v8h-8z M8 8h8v8h-8z M8 0 l8 0 l0 4 l-4 4 l-4 0z M0 8 l4 0 l4 4 l0 4 l-8 0z"/>'); }],
    ["Argyle", .22, function () { return P(28, 28, '<path d="M14 0 L28 14 L14 28 L0 14 Z"/><path d="M0 0 L28 28 M28 0 L0 28" stroke-dasharray="2 3" stroke-width="1"/>'); }],
    ["Basket weave", .22, function () { return P(24, 24, '<rect x="1" y="1" width="10" height="22" rx="1"/><rect x="13" y="1" width="22" height="10" rx="1" transform="translate(-12,12)"/>'); }],
    ["Lattice", .2, function () { return P(20, 20, '<path d="M-2 10 L10 -2 M8 22 L22 8 M-2 10 L10 22 M8 -2 L22 10" stroke-width="1.3"/><circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none"/>'); }],
    ["Quatrefoil", .22, function () { return P(30, 30, '<path d="M15 4 a6 6 0 0 1 11 11 a6 6 0 0 1 -11 11 a6 6 0 0 1 -11 -11 a6 6 0 0 1 11 -11"/>'); }],
    ["Fish-scale", .24, function () { return P(20, 10, '<path d="M-10 10 a10 10 0 0 1 20 0 M10 10 a10 10 0 0 1 20 0 M0 0 a10 10 0 0 1 20 0"/>'); }],
    ["Seigaiha", .26, function () { let t = ""; for (let r = 12; r >= 3; r -= 3) t += '<path d="M0 12 a' + r + ' ' + r + ' 0 0 1 24 0"/>'; return P(24, 13, t); }],
    ["Asanoha", .22, function () { return P(28, 48, '<g stroke-width="1"><path d="M14 0 L14 24 M14 24 L0 16 M14 24 L28 16 M14 24 L0 32 M14 24 L28 32 M14 24 L14 48 M0 16 L14 0 L28 16 M0 32 L0 16 M28 16 L28 32 M0 32 L14 48 L28 32"/></g>'); }],
    ["Honeycomb", .22, function () { return P(28, 16, '<path d="M7 0 L21 0 L28 8 L21 16 L7 16 L0 8 Z M21 0 L28 8 M7 16 L0 8" stroke-width="1.2"/>'); }],
    ["Triangle grid", .2, function () { return P(20, 17, '<path d="M0 17 L10 0 L20 17 Z M10 0 L10 17 M0 17 L20 17" stroke-width="1.1"/>'); }],
    ["Isometric cubes", .2, function () { return P(28, 32, '<path d="M14 0 L28 8 L28 24 L14 32 L0 24 L0 8 Z M14 0 L14 16 M14 16 L28 24 M14 16 L0 24" stroke-width="1.1"/>'); }],
    ["Harlequin", .2, function () { return P(24, 28, '<path d="M12 0 L24 14 L12 28 L0 14 Z"/>'); }],
    ["Nested squares", .22, function () { return P(22, 22, '<rect x="3" y="3" width="16" height="16"/><rect x="7" y="7" width="8" height="8"/>'); }],
    ["Plus grid", .24, function () { return P(18, 18, '<path d="M9 5 L9 13 M5 9 L13 9" stroke-width="1.4"/>'); }],
    ["Ogee", .22, function () { return P(32, 28, '<path d="M0 14 C0 2 16 2 16 14 C16 26 32 26 32 14 M-16 14 C-16 26 0 26 0 14 M16 14 C16 2 32 2 32 14" stroke-width="1.2"/>'); }],
    ["Sine waves", .2, function () { let t = ""; for (let y = 8; y < H; y += 12) { let d = "M0 " + y; for (let x = 0; x < W; x += 20) d += " q10 -8 20 0 t20 0"; t += '<path d="' + d + '" stroke-width="1.2"/>'; } return t; }],
    ["Zigzag ribbons", .18, function () { let t = ""; for (let y = 6; y < H; y += 14) { let d = "M0 " + y; for (let x = 0; x < W; x += 16) d += " L" + (x + 8) + " " + (y - 7) + " L" + (x + 16) + " " + y; t += '<path d="' + d + '" stroke-width="1.3"/>'; } return t; }],
    ["Sunburst rays", .24, function () { let t = ""; for (let a = 0; a < 360; a += 7.5) { const r = a * Math.PI / 180; t += '<line x1="' + FX + '" y1="' + FY + '" x2="' + (FX + Math.cos(r) * 340) + '" y2="' + (FY + Math.sin(r) * 340) + '" stroke-width="1.1"/>'; } return t; }],
    ["Radar", .24, function () { let t = ""; for (let r = 10; r < 200; r += 12) t += '<circle cx="' + FX + '" cy="' + FY + '" r="' + r + '" stroke-width="1"/>'; t += '<line x1="' + (FX - 200) + '" y1="' + FY + '" x2="' + (FX + 200) + '" y2="' + FY + '"/><line x1="' + FX + '" y1="' + (FY - 120) + '" x2="' + FX + '" y2="' + (FY + 120) + '"/>'; return t; }],
    ["Guilloché", .2, function () { let t = ""; for (let row = 0; row < 2; row++) { const yy = FY - 5 + row * 10; for (let cx = -12; cx < W + 24; cx += 11) t += '<circle cx="' + cx + '" cy="' + yy.toFixed(0) + '" r="17" stroke-width=".8"/>'; } return t; }],
    ["Concentric rings", .26, function () { let t = ""; for (let r = 8; r < 220; r += 11) t += '<circle cx="' + FX + '" cy="' + FY + '" r="' + r + '" stroke-width="1"/>'; return t; }],
    ["Pie wedges", .16, function () { let t = ""; for (let a = 0; a < 360; a += 20) { const r = a * Math.PI / 180; t += '<line x1="' + FX + '" y1="' + FY + '" x2="' + (FX + Math.cos(r) * 340) + '" y2="' + (FY + Math.sin(r) * 340) + '" stroke-width="7"/>'; } return t; }],
    ["Polka dots", .42, function () { return P(16, 16, '<circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>'); }],
    ["Halftone", .5, function () { let t = ""; for (let y = 6; y < H; y += 9) for (let x = 6; x < W; x += 9) { const r = 0.5 + (x / W) * 2.4; t += '<circle cx="' + x + '" cy="' + y + '" r="' + r.toFixed(2) + '" fill="currentColor" stroke="none"/>'; } return t; }],
    ["Bokeh", .3, function () { const r = rng(7); let t = ""; for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * H, rad = 2 + r() * 12; t += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + rad.toFixed(1) + '" stroke-width="1" opacity="' + (0.4 + r() * 0.6).toFixed(2) + '"/>'; } return t; }],
    ["Terrazzo", .5, function () { const r = rng(21); let t = ""; for (let i = 0; i < 60; i++) { const x = r() * W, y = r() * H, s = 1.5 + r() * 3.5, rot = r() * 90, sh = r(); t += sh < .5 ? '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + s.toFixed(1) + '" fill="currentColor" stroke="none"/>' : '<rect x="' + x.toFixed(0) + '" y="' + y.toFixed(0) + '" width="' + (s * 2).toFixed(1) + '" height="' + (s * 1.3).toFixed(1) + '" fill="currentColor" stroke="none" transform="rotate(' + rot.toFixed(0) + ' ' + x.toFixed(0) + ' ' + y.toFixed(0) + ')"/>'; } return t; }],
    ["Confetti", .5, function () { const r = rng(5); let t = ""; for (let i = 0; i < 34; i++) { const x = r() * W, y = r() * H, rot = r() * 180, k = r(); if (k < .33) t += '<rect x="' + x.toFixed(0) + '" y="' + y.toFixed(0) + '" width="6" height="2.4" fill="currentColor" stroke="none" transform="rotate(' + rot.toFixed(0) + ' ' + x.toFixed(0) + ' ' + y.toFixed(0) + ')"/>'; else if (k < .66) t += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="2" fill="currentColor" stroke="none"/>'; else t += '<path d="M' + x.toFixed(0) + ' ' + y.toFixed(0) + ' l4 4 M' + (x + 4).toFixed(0) + ' ' + y.toFixed(0) + ' l-4 4" stroke-width="1.3"/>'; } return t; }],
    ["Stipple", .5, function () { const r = rng(99); let t = ""; for (let i = 0; i < 220; i++) t += '<circle cx="' + (r() * W).toFixed(0) + '" cy="' + (r() * H).toFixed(0) + '" r="' + (0.5 + r() * 0.9).toFixed(2) + '" fill="currentColor" stroke="none"/>'; return t; }],
    ["Constellation", .5, function () { const r = rng(3), pts = []; let t = ""; for (let i = 0; i < 16; i++) pts.push([r() * W, r() * H]); for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1]; if (dx * dx + dy * dy < 3600) t += '<line x1="' + pts[i][0].toFixed(0) + '" y1="' + pts[i][1].toFixed(0) + '" x2="' + pts[j][0].toFixed(0) + '" y2="' + pts[j][1].toFixed(0) + '" stroke-width=".8" opacity=".6"/>'; } for (let i = 0; i < pts.length; i++) t += '<circle cx="' + pts[i][0].toFixed(0) + '" cy="' + pts[i][1].toFixed(0) + '" r="1.8" fill="currentColor" stroke="none"/>'; return t; }],
    ["Pipes", .28, function () { const r = rng(11); let t = "", s = 22; for (let y = 0; y < H + s; y += s) for (let x = 0; x < W + s; x += s) { if (r() < .5) t += '<path d="M' + x + ' ' + (y + s / 2) + ' A' + (s / 2) + ' ' + (s / 2) + ' 0 0 1 ' + (x + s / 2) + ' ' + y + ' M' + (x + s / 2) + ' ' + (y + s) + ' A' + (s / 2) + ' ' + (s / 2) + ' 0 0 1 ' + (x + s) + ' ' + (y + s / 2) + '" stroke-width="1.3"/>'; else t += '<path d="M' + (x + s / 2) + ' ' + y + ' A' + (s / 2) + ' ' + (s / 2) + ' 0 0 1 ' + (x + s) + ' ' + (y + s / 2) + ' M' + x + ' ' + (y + s / 2) + ' A' + (s / 2) + ' ' + (s / 2) + ' 0 0 1 ' + (x + s / 2) + ' ' + (y + s) + '" stroke-width="1.3"/>'; } return t; }],
    ["Maze", .24, function () { const r = rng(42); let t = "", s = 16; for (let y = 0; y < H + s; y += s) for (let x = 0; x < W + s; x += s) t += r() < .5 ? '<line x1="' + x + '" y1="' + y + '" x2="' + (x + s) + '" y2="' + (y + s) + '" stroke-width="1.3"/>' : '<line x1="' + (x + s) + '" y1="' + y + '" x2="' + x + '" y2="' + (y + s) + '" stroke-width="1.3"/>'; return t; }],
    ["Low-poly mesh", .22, function () { const r = rng(8), cols = 9, rows = 4, sx = W / cols, sy = H / rows, pts = []; let t = ""; for (let j = 0; j <= rows; j++) { pts[j] = []; for (let i = 0; i <= cols; i++) pts[j][i] = [i * sx + (i > 0 && i < cols ? (r() - .5) * sx * .6 : 0), j * sy + (j > 0 && j < rows ? (r() - .5) * sy * .6 : 0)]; } for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i], d = pts[j + 1][i + 1]; t += '<path d="M' + a[0].toFixed(0) + ' ' + a[1].toFixed(0) + ' L' + b[0].toFixed(0) + ' ' + b[1].toFixed(0) + ' L' + c[0].toFixed(0) + ' ' + c[1].toFixed(0) + ' Z M' + b[0].toFixed(0) + ' ' + b[1].toFixed(0) + ' L' + d[0].toFixed(0) + ' ' + d[1].toFixed(0) + ' L' + c[0].toFixed(0) + ' ' + c[1].toFixed(0) + ' Z" stroke-width="1"/>'; } return t; }],
    ["Network", .4, function () { const r = rng(17), pts = []; let t = ""; for (let i = 0; i < 14; i++) pts.push([r() * W, r() * H]); for (let i = 0; i < pts.length; i++) { let best = -1, bd = 1e9; for (let j = 0; j < pts.length; j++) { if (j === i) continue; const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = j; } } t += '<line x1="' + pts[i][0].toFixed(0) + '" y1="' + pts[i][1].toFixed(0) + '" x2="' + pts[best][0].toFixed(0) + '" y2="' + pts[best][1].toFixed(0) + '" stroke-width=".9"/>'; } for (let i = 0; i < pts.length; i++) t += '<circle cx="' + pts[i][0].toFixed(0) + '" cy="' + pts[i][1].toFixed(0) + '" r="2.4" stroke-width="1"/>'; return t; }],
    ["Circuit board", .3, function () { const r = rng(23); let t = "", s = 20; for (let y = s; y < H; y += s) for (let x = s; x < W; x += s) { if (r() < .7) { const dir = Math.floor(r() * 4), len = s * (1 + Math.floor(r() * 2)); let ex = x, ey = y; if (dir === 0) ex = x + len; else if (dir === 1) ex = x - len; else if (dir === 2) ey = y + len; else ey = y - len; t += '<path d="M' + x + ' ' + y + ' L' + ex + ' ' + ey + '" stroke-width="1.1"/>'; if (r() < .5) t += '<circle cx="' + ex + '" cy="' + ey + '" r="1.8" fill="currentColor" stroke="none"/>'; } t += '<circle cx="' + x + '" cy="' + y + '" r="1.4" stroke-width="1"/>'; } return t; }],
    ["Flow field", .28, function () { let t = ""; for (let y = 8; y < H; y += 11) for (let x = 6; x < W; x += 16) { let a = Math.sin(x * 0.03) + Math.cos(y * 0.05) + x * y * 0.00005; let d = "M" + x + " " + y; for (let k = 0; k < 5; k++) { const px = x + Math.cos(a) * k * 4, py = y + Math.sin(a) * k * 4; d += " L" + px.toFixed(1) + " " + py.toFixed(1); a += 0.5; } t += '<path d="' + d + '" stroke-width="1.1"/>'; } return t; }],
    ["Blobs", .2, function () { const r = rng(31); let t = ""; for (let i = 0; i < 7; i++) { const x = r() * W, y = r() * H, rad = 10 + r() * 22; t += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + rad.toFixed(0) + '" stroke-width="1.2"/>'; } return t; }],
    ["Topographic", .24, function () { let t = ""; for (let ring = 0; ring < 7; ring++) { let d = "", n = 40; for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2; const rad = 22 + ring * 9 + Math.sin(a * 3 + ring) * 4 + Math.cos(a * 2) * 3; const x = FX - 40 + Math.cos(a) * rad, y = FY + Math.sin(a) * rad * 0.7; d += (k === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " "; } t += '<path d="' + d + 'Z" stroke-width="1"/>'; } return t; }],
    ["Memphis", .4, function () { const r = rng(13); let t = ""; for (let i = 0; i < 18; i++) { const x = r() * W, y = r() * H, k = r(); if (k < .25) t += '<circle cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" r="' + (2 + r() * 3).toFixed(1) + '" fill="currentColor" stroke="none"/>'; else if (k < .5) t += '<path d="M' + x.toFixed(0) + ' ' + y.toFixed(0) + ' q6 -8 12 0 t12 0" stroke-width="1.4"/>'; else if (k < .75) t += '<path d="M' + x.toFixed(0) + ' ' + y.toFixed(0) + ' l6 10 l-12 0 Z" stroke-width="1.2"/>'; else { let d = "M" + x.toFixed(0) + " " + y.toFixed(0); for (let z = 0; z < 3; z++) d += " l5 -5 l5 5"; t += '<path d="' + d + '" stroke-width="1.3"/>'; } } return t; }],
    ["Art Deco fans", .24, function () { return P(34, 34, '<path d="M0 34 A34 34 0 0 1 34 0 M0 34 A24 24 0 0 1 24 10 M0 34 A14 14 0 0 1 14 20 M0 34 A4 4 0 0 1 4 30" stroke-width="1.1"/>'); }],
    ["Aztec steps", .22, function () { return P(28, 28, '<path d="M0 14 L6 14 L6 8 L12 8 L12 2 L16 2 L16 8 L22 8 L22 14 L28 14 M14 0 L14 6 L8 6 L8 12 L2 12 L2 16 L8 16 L8 22 L14 22 L14 28" stroke-width="1.1"/>'); }],
    ["Wiggle lines", .2, function () { let t = ""; for (let y = 8; y < H; y += 10) { let d = "M0 " + y; for (let x = 0; x < W; x += 12) d += " q6 -6 12 0 q6 6 12 0"; t += '<path d="' + d + '" stroke-width="1.2"/>'; } return t; }],
    ["Cross-stitch", .3, function () { return P(16, 16, '<path d="M4 4 L12 12 M12 4 L4 12" stroke-width="1.3"/>'); }],
    ["Blueprint", .26, function () { let t = P(40, 40, '<path d="M40 0 L0 0 L0 40 M8 0 L8 40 M16 0 L16 40 M24 0 L24 40 M32 0 L32 40 M0 8 L40 8 M0 16 L40 16 M0 24 L40 24 M0 32 L40 32" stroke-width=".6" opacity=".5"/>'); const r = rng(6); for (let i = 0; i < 6; i++) t += '<circle cx="' + (r() * W).toFixed(0) + '" cy="' + (r() * H).toFixed(0) + '" r="3" stroke-width="1.2"/>'; return t; }],
    ["Dotted rings", .4, function () { let t = ""; for (let r = 10; r < 210; r += 14) { const circ = 2 * Math.PI * r, n = Math.max(6, Math.round(circ / 7)); for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; t += '<circle cx="' + (FX + Math.cos(a) * r).toFixed(1) + '" cy="' + (FY + Math.sin(a) * r).toFixed(1) + '" r="1.1" fill="currentColor" stroke="none"/>'; } } return t; }],
    ["Woven braid", .24, function () { return P(24, 12, '<path d="M0 6 q6 -6 12 0 q6 6 12 0 M0 6 q6 6 12 0 q6 -6 12 0" stroke-width="1.3"/>'); }],
    ["Bubbles", .32, function () { const r = rng(44); let t = ""; for (let i = 0; i < 22; i++) t += '<circle cx="' + (r() * W).toFixed(0) + '" cy="' + (r() * H).toFixed(0) + '" r="' + (2 + r() * 10).toFixed(1) + '" stroke-width="1.1"/>'; return t; }],
    ["Spiral", .26, function () { let d = "M" + FX + " " + FY, a = 0, rad = 0; for (let k = 0; k < 160; k++) { a += 0.32; rad += 0.9; d += " L" + (FX + Math.cos(a) * rad).toFixed(1) + " " + (FY + Math.sin(a) * rad).toFixed(1); } return '<path d="' + d + '" stroke-width="1.1"/>'; }]
  ];

  // Hugeicons outline subjects (inner markup; themed via currentColor).
  const ICONS = {
    plane: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.867 3.78c.926-.748 1.964-.794 3.097-.778c.587.009.88.013 1.115.104c.373.145.67.442.815.815c.091.235.095.528.104 1.115c.016 1.133-.03 2.17-.778 3.097c-.63.78-1.714 1.188-2.235 2.05c-.398.656-.213 1.337-.042 2.038l1.28 5.245c.255 1.046.06 1.715-.67 2.446c-.389.39-.713.37-1.028-.133l-3.862-6.154l-1.845 1.466c-.669.532-1.003.798-1.179 1.172c-.411.876-.15 2.192-.137 3.142c.008.525-.446 1.56-1.088 1.594c-.396.022-.531-.452-.66-.743l-1.232-2.802c-.294-.67-.306-.682-.976-.976l-2.802-1.233c-.29-.128-.765-.263-.743-.659c.035-.642 1.07-1.096 1.594-1.088c.95.013 2.266.274 3.142-.137c.374-.176.64-.51 1.172-1.18l1.466-1.844l-6.154-3.862c-.503-.316-.522-.639-.133-1.028c.73-.73 1.4-.925 2.446-.67l5.245 1.28c.7.171 1.382.356 2.039-.042c.861-.52 1.269-1.604 2.049-2.235"/>',
    apple: '<g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5"><path d="M8 5c-2.761 0-5 3.014-5 6.028c0 3.516.5 6.028 2.5 9.042c1.52 2.036 3.55 2.547 5.714 1.12a1.47 1.47 0 0 1 1.572 0c2.164 1.427 4.194.916 5.714-1.12c2-3.014 2.5-5.526 2.5-9.042C21 8.014 18.761 5 16 5c-1.425 0-2.711.785-3.622 1.633a.557.557 0 0 1-.756 0C10.712 5.785 9.425 5 8 5Z"/><path stroke-linecap="round" d="M6 12c0-1.633.823-3.267 2-4m4-2c0-1.333.6-4 3-4"/></g>',
    coffee: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path d="m5 7l1.76 10.405c.306 1.808.46 2.713 1 3.337c1.454 1.677 7.026 1.677 8.48 0c.54-.624.694-1.529 1-3.337L19 7M5 7l.743-1.712c.609-1.404.913-2.106 1.548-2.502c1.59-.993 7.654-1.102 9.418 0c.635.396.94 1.098 1.548 2.502L19 7M4 7h16"/><ellipse cx="12" cy="14.5" rx="2" ry="2.5"/></g>',
    salad: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M20.387 6.573a2.094 2.094 0 0 0-.014-2.945a2.09 2.09 0 0 0-2.943-.015a2.09 2.09 0 0 0-3.485.885a2.091 2.091 0 0 0-2.938 2.521a2.094 2.094 0 0 0-1.395 3.571a2.69 2.69 0 0 1 .74 2.41H18.3a2.095 2.095 0 0 0 1.203-2.94a2.095 2.095 0 0 0 .884-3.487M17 7l-6 6m2.889 8H10.11A7.11 7.11 0 0 1 3 13.889c0-.491.398-.889.889-.889H20.11c.491 0 .889.398.889.889A7.11 7.11 0 0 1 13.889 21"/><path d="M5.671 13A4.5 4.5 0 0 1 11 5.758"/></g>',
    steak: '<g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 16a5 5 0 0 0 4-8c-2.125-2.83-5-4-9-4S2 6.865 2 10.5A2.5 2.5 0 0 0 4.5 13H8c1.324-.033 4 .5 6.236 2.167A5 5 0 0 0 17 16Z"/><path d="M2 10.5v.5c0 2.828 0 4.243.879 5.121C3.757 17 5.172 17 8 17c1.324-.032 4 .5 6.236 2.167A5 5 0 0 0 22 15v-4"/><path d="M18.5 11a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0Z"/></g>',
    party: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m5.658 11.002l-1.47 3.308c-1.856 4.174-2.783 6.261-1.77 7.274s3.098.085 7.272-1.77L13 18.342c2.517-1.119 3.776-1.678 3.976-2.757s-.774-2.053-2.722-4l-1.838-1.839c-1.947-1.948-2.921-2.922-4-2.721c-1.079.2-1.638 1.459-2.757 3.976M6.5 10.5l7 7m-9-2l4 4M16 8l3-3m2.876 1h-.125M22 6a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m-1.124 7.25h-.125m.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m-2.875-11H18m.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m-7.124 1H11m.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0M14.198 2c.4.667.718 2.4-1.197 4M22 9.803c-.666-.4-2.4-.719-4 1.197"/>',
    umbrella: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M12 3.5V2m0 1.5c-.94 0-4.472 3.793-5.028 8.704M12 3.5c.94 0 4.472 3.793 5.028 8.704M12 3.5c4.937 0 9.055 3.436 10 8c-1.388 1.2-3.893.97-4.972.704M12 3.5c-4.937 0-9.055 3.436-10 8c1.388 1.2 3.893.97 4.972.704m0 0A10.3 10.3 0 0 0 12 13.5a10.3 10.3 0 0 0 5.028-1.296"/><path d="M12 13.5v7a1.5 1.5 0 0 1-3 0V20"/></g>',
    people: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 21c-.233-2.931-2.658-5.252-5.691-5.448L9.5 15.5q-.432.012-.812.03C5.681 15.672 3.231 18.097 3 21m9.75-11.25a3.25 3.25 0 1 1-6.5 0a3.25 3.25 0 0 1 6.5 0M21 17.501c-.23-2.87-2.546-5.226-5.5-5.505M15.988 9A3.25 3.25 0 0 0 17.5 6.25C17.5 4.455 16.05 3 14.26 3c-.879 0-1.676.351-2.26.921"/>',
    school: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M22 11v5c0 2.357 0 3.535-.732 4.268C20.535 21 19.357 21 17 21H7c-2.357 0-3.536 0-4.268-.732C2 19.535 2 18.357 2 16v-5c0-1.4 0-2.1.272-2.635a2.5 2.5 0 0 1 1.093-1.093C3.9 7 4.6 7 6 7l3.6-2.7C10.756 3.433 11.333 3 12 3s1.244.433 2.4 1.3L18 7c1.4 0 2.1 0 2.635.272a2.5 2.5 0 0 1 1.092 1.093C22 8.9 22 9.6 22 11"/><path d="M10 21v-3a2 2 0 1 1 4 0v3M6.5 11h-1v1h1zm0 4.5h-1v1h1zm12-4.5h-1v1h1zm0 4.5h-1v1h1zM12 12a2 2 0 1 0 0-4a2 2 0 0 0 0 4"/></g>',
    calendar: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M16 2v4M8 2v4m5-2h-2C7.229 4 5.343 4 4.172 5.172S3 8.229 3 12v2c0 3.771 0 5.657 1.172 6.828S7.229 22 11 22h2c3.771 0 5.657 0 6.828-1.172S21 17.771 21 14v-2c0-3.771 0-5.657-1.172-6.828S16.771 4 13 4M3 10h18"/><path d="M10 18.5v-4.653c0-.191-.137-.347-.305-.347H9m5 4.998l1.486-4.606a.3.3 0 0 0-.286-.392H13"/></g>',
    feelings: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 15a5 5 0 0 0 4 2a5 5 0 0 0 4-2m-.375-6.613v.53m-7.25-.53v.53m.375-.167c0-.414-.168-.75-.375-.75S8 8.336 8 8.75s.168.75.375.75s.375-.336.375-.75m7.25 0c0-.414-.168-.75-.375-.75s-.375.336-.375.75s.168.75.375.75s.375-.336.375-.75"/></g>',
    question: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.912 2.064C12.728 12.032 12 12.672 12 13.5m.125 3.25H12m.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0"/></g>',
    food: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path stroke-linejoin="round" d="M15 10L4 21.001m14-18l-3 3c-.545.545-.818.818-.964 1.112a2 2 0 0 0 0 1.776c.146.294.419.567.964 1.112s.818.818 1.112.964a2 2 0 0 0 1.776 0c.294-.146.567-.419 1.112-.964l3-3m-2-2.002l-3 3"/><path d="M8.845 9.846c-1.365 1.365-3.237 1.706-4.944 0c-1.706-1.707-2.6-4.814-1.235-6.18c1.365-1.364 4.472-.47 6.179 1.236c1.706 1.707 1.365 3.579 0 4.944Zm0 0L20 21"/></g>',
    paw: '<g fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8.492" cy="6" r="2"/><circle cx="2" cy="2" r="2" transform="matrix(-1 0 0 1 17.492 4)"/><circle cx="3.992" cy="11" r="2"/><circle cx="2" cy="2" r="2" transform="matrix(-1 0 0 1 21.992 9)"/><path d="M7.31 20q-.983 0-1.65-.719a2.4 2.4 0 0 1-.668-1.698q0-1.083.777-1.895q.776-.813 1.542-1.605q.634-.645 1.094-1.406a8.3 8.3 0 0 1 1.093-1.427q.481-.542 1.116-.896A2.8 2.8 0 0 1 11.992 10q.744 0 1.378.333q.634.334 1.116.875q.613.667 1.083 1.438a8.5 8.5 0 0 0 1.104 1.437q.765.792 1.543 1.604q.776.813.776 1.896q0 .98-.667 1.698q-.667.72-1.652.719q-1.18 0-2.34-.187a14.6 14.6 0 0 0-4.681 0Q8.492 20 7.31 20Z"/></g>',
    home: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 11.99v2.51c0 3.3 0 4.95 1.025 5.975S6.7 21.5 10 21.5h4c3.3 0 4.95 0 5.975-1.025S21 17.8 21 14.5v-2.51c0-1.682 0-2.522-.356-3.25s-1.02-1.244-2.346-2.276l-2-1.555C14.233 3.303 13.2 2.5 12 2.5s-2.233.803-4.298 2.409l-2 1.555C4.375 7.496 3.712 8.012 3.356 8.74S3 10.308 3 11.99"/>',
    book: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M15.5 7h-7m3.999 4h-4M20 22H6a2 2 0 0 1-2-2m0 0a2 2 0 0 1 2-2h14V6c0-1.886 0-2.828-.586-3.414S17.886 2 16 2h-6c-2.828 0-4.243 0-5.121.879C4 3.757 4 5.172 4 8z"/><path d="M19.5 18s-1 .763-1 2s1 2 1 2"/></g>'
  };

  // Keyword → icon (first match wins; order specific → general). ES + EN cues.
  const KW = [
    [/travel|airport|flight|plane|trip|viaj|aeropuerto|vuelo/, "plane"],
    [/vacation|vacacion|holiday|beach|playa|summer|verano|hotel/, "umbrella"],
    [/fruit|fruta|apple|manzana/, "apple"],
    [/breakfast|desayuno|coffee|caf[eé]|drink|bebida|tea|t[eé]/, "coffee"],
    [/lunch|almuerzo|salad|ensalada|vegetable|verdura|veggie/, "salad"],
    [/dinner|cena|meat|carne|steak|beef|pollo|chicken/, "steak"],
    [/food|comida|eat|comer|meal|cocina|kitchen|restaurant|snack/, "food"],
    [/part(y|ies)|fiesta|celebrat|birthday|cumplea|leisure|invitation|fest/, "party"],
    [/animal|animales|pet|mascota|zoo/, "paw"],
    [/people|activit|place|persona|gente|family|familia|preliminar|friend|amigo/, "people"],
    [/class|school|escuela|homework|tarea|aula|study|lecci[oó]n|phrase|frase/, "school"],
    [/day|d[ií]a|week|semana|month|mes|date|fecha|time|hora|calendar|season/, "calendar"],
    [/feel|emotion|estar|tener|mood|sentim|condition|happy|sad/, "feelings"],
    [/question|interrogat|pregunta|\bask\b|why|qu[eé]|how|c[oó]mo/, "question"]
  ];

  const PALETTE = ["#FFC24B", "#FF8A6B", "#2DC2A0", "#9A8CFF", "#F48FB6", "#5BB8E8", "#86C443", "#F0A54A", "#7FD0C0", "#FF9FB0"];

  function keyOf(lesson) { return "" + ((lesson && (lesson.id || lesson.name)) || "lesson"); }
  function accent(lesson) { return PALETTE[hash(keyOf(lesson)) % PALETTE.length]; }
  function iconKey(name) { name = ("" + (name || "")).toLowerCase(); for (let i = 0; i < KW.length; i++) if (KW[i][0].test(name)) return KW[i][1]; return "book"; }
  function patternIndex(lesson) { return hash(keyOf(lesson) + "|pat") % PATTERNS.length; }
  function iconSvg(key) { return '<svg viewBox="0 0 24 24">' + (ICONS[key] || ICONS.book) + "</svg>"; }
  function patternSvg(index) { const p = PATTERNS[((index % PATTERNS.length) + PATTERNS.length) % PATTERNS.length]; return { name: p[0], opacity: p[1], svg: S(p[2]()) }; }

  /** Everything a card needs: {color, icon, patHTML, wmHTML}. */
  function card(lesson) {
    const color = accent(lesson), ic = iconKey(lesson && lesson.name), ps = patternSvg(patternIndex(lesson));
    return {
      color: color, icon: ic,
      patHTML: '<span class="lcard__pat" style="opacity:' + ps.opacity + '">' + ps.svg + "</span>",
      wmHTML: '<span class="lcard__wm">' + iconSvg(ic) + "</span>"
    };
  }

  return { accent, iconKey, patternIndex, iconSvg, patternSvg, card, PALETTE, PATTERN_COUNT: PATTERNS.length };
});
