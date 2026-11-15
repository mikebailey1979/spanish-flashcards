"use strict";
/**
 * HITL icon-match review. Runs the REAL matcher (card-art.iconKeyExplain) over the
 * current lessons + a broad Spanish-class topic corpus and writes a self-contained
 * HTML sheet showing, for each phrase, the RENDERED icon, its slug, and how it was
 * matched (keyword / direct-name / hashed-fallback). Scan it for weird associations;
 * fix one by adding/adjusting a rule in src/ui/card-art.js, then re-run.
 *
 * Usage (from repo root):  node scripts/icon-review.js [out.html]
 */
const fs = require("fs");
const path = require("path");
global.self = global;
require(path.resolve(__dirname, "../src/ui/icons.js"));
const CA = require(path.resolve(__dirname, "../src/ui/card-art.js"));

// The current real lessons (edit to match the deck under review).
const LESSONS = [
  "Days of the week — Los días",
  "Parties — Las fiestas",
  "Food — Unidad 4 (La comida es cultura)",
  "Unidad 5 — Leisure, invitations, holidays & celebrations",
  "Unit 1, Lesson 1 — Travel & Airport / Viaje y aeropuerto",
  "Lección preliminar — People, Activities & Places",
  "Feelings & conditions — estar / tener",
  "Foods (review) — La comida",
  "Question words — Interrogativos",
  "Classroom phrases — Frases útiles en español",
  "Vacation — Unit 1, Lesson 2",
];

// A broad corpus of topics a beginner Spanish deck tends to hit (EN + ES), to stress
// the matcher well beyond the current lessons.
const CORPUS = [
  "Fruits / Las frutas", "Vegetables / Las verduras", "Food / La comida", "Drinks / Las bebidas",
  "Breakfast / El desayuno", "Lunch / El almuerzo", "Dinner / La cena", "Desserts / Los postres",
  "Animals / Los animales", "Pets / Las mascotas", "The zoo / El zoológico", "Farm animals / La granja",
  "Birds / Los pájaros", "Insects / Los insectos", "The ocean / El océano",
  "Weather / El clima", "The seasons / Las estaciones", "Winter / El invierno", "Summer / El verano",
  "Rain / La lluvia", "The sky / El cielo", "Nature / La naturaleza", "Plants / Las plantas", "Flowers / Las flores",
  "The family / La familia", "Friends / Los amigos", "People / La gente", "The body / El cuerpo",
  "The face / La cara", "Feelings / Los sentimientos", "Emotions / Las emociones", "Health / La salud",
  "The house / La casa", "The kitchen / La cocina", "The bedroom / El dormitorio", "Furniture / Los muebles",
  "The city / La ciudad", "The neighborhood / El barrio", "Places / Los lugares", "The school / La escuela",
  "The classroom / El aula", "School supplies / Los útiles", "Homework / La tarea",
  "Numbers / Los números", "Colors / Los colores", "Shapes / Las formas", "The alphabet / El alfabeto",
  "Telling time / La hora", "The calendar / El calendario", "Months / Los meses", "Days / Los días",
  "Transportation / El transporte", "Travel / Los viajes", "The airport / El aeropuerto", "Vacation / Las vacaciones",
  "The beach / La playa", "Directions / Las direcciones", "The map / El mapa",
  "Clothes / La ropa", "Shoes / Los zapatos", "Shopping / De compras", "Money / El dinero", "The market / El mercado",
  "Sports / Los deportes", "Soccer / El fútbol", "Music / La música", "Instruments / Los instrumentos",
  "Art / El arte", "Hobbies / Los pasatiempos", "Free time / El tiempo libre", "Games / Los juegos",
  "Birthdays / Los cumpleaños", "Holidays / Los días festivos", "Celebrations / Las celebraciones",
  "Greetings / Los saludos", "Question words / Las preguntas", "Verbs / Los verbos", "Grammar / La gramática",
  "Adjectives / Los adjetivos", "Prepositions / Las preposiciones", "The weather today",
  "My daily routine / La rutina", "Jobs / Los trabajos", "The doctor / El médico", "Technology / La tecnología",
  "Countries / Los países", "Spanish culture / La cultura", "Food is culture", "Review unit",
  "Unidad 1", "Unidad 2", "Lección 3", "Capítulo 4", "Module 5",
];

const rowsFor = (kind, list) => list.map((phrase) => {
  const e = CA.iconKeyExplain(phrase);
  return { kind, phrase, icon: e.icon, via: e.via, rule: e.rule, svg: CA.iconSvg(e.icon) };
});
const rows = rowsFor("lesson", LESSONS).concat(rowsFor("topic", CORPUS));
const order = { fallback: 0, name: 1, keyword: 2 };     // flag riskier matches first
rows.sort((a, b) => (order[a.via] - order[b.via]) || a.phrase.localeCompare(b.phrase));
const counts = rows.reduce((m, r) => (m[r.via] = (m[r.via] || 0) + 1, m), {});

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dot = { keyword: "#2DC2A0", name: "#5BB8E8", fallback: "#FF8A3D" };
const card = (r) => `<div class="c" data-via="${r.via}">
  <div class="ic">${r.svg}</div>
  <div class="meta"><div class="ph">${esc(r.phrase)}</div>
    <div class="sl"><b>${esc(r.icon)}</b> <span class="via" style="color:${dot[r.via]}">● ${r.via}</span></div>
    <div class="ru" title="${esc(r.rule)}">${esc(r.rule).slice(0, 80)}</div></div></div>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Icon match review</title>
<style>
  :root { color-scheme: light; --bg:#f4f7fb; --card:#fff; --ink:#15263d; --muted:#5e738e; --line:#dce6f2; --icon:#1f3a5a; }
  * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.4 system-ui,sans-serif; padding:20px; }
  h1 { font-size:20px; margin:0 0 4px; } .sub { color:var(--muted); margin:0 0 16px; }
  .legend { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:14px; font-size:13px; }
  .legend b { font-variant-numeric:tabular-nums; }
  .filters { margin-bottom:16px; } .filters button { font:inherit; font-size:13px; border:1px solid var(--line); background:var(--card); color:var(--ink); padding:6px 12px; border-radius:999px; cursor:pointer; }
  .filters button.on { background:var(--ink); color:#fff; border-color:var(--ink); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:10px; }
  .c { display:flex; gap:12px; align-items:center; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:10px 12px; }
  .c[hidden] { display:none !important; }
  .c[data-via="fallback"] { border-color:#ffd3ad; background:#fff8f1; }
  .ic { flex:0 0 42px; height:42px; display:grid; place-items:center; color:var(--icon); }
  .ic svg { width:40px; height:40px; } .meta { min-width:0; }
  .ph { font-weight:700; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sl { font-size:12.5px; color:var(--muted); margin-top:1px; } .sl b { color:var(--ink); }
  .via { font-size:11px; } .ru { font-size:10.5px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
</style></head><body>
  <h1>Icon match review</h1>
  <p class="sub">${rows.length} phrases · generated from the live matcher (card-art.iconKeyExplain). Scan for odd icons; flag any and I'll add a rule.</p>
  <div class="legend">
    <span style="color:${dot.keyword}">● keyword <b>${counts.keyword || 0}</b></span>
    <span style="color:${dot.name}">● direct-name <b>${counts.name || 0}</b></span>
    <span style="color:${dot.fallback}">● hashed-fallback <b>${counts.fallback || 0}</b> (review these first)</span>
  </div>
  <div class="filters">
    <button data-f="all" class="on">All</button>
    <button data-f="fallback">Fallback</button>
    <button data-f="name">Direct-name</button>
    <button data-f="keyword">Keyword</button>
  </div>
  <div class="grid">${rows.map(card).join("")}</div>
  <script>
    const btns = document.querySelectorAll('.filters button'), cards = document.querySelectorAll('.c');
    btns.forEach(b => b.addEventListener('click', () => {
      btns.forEach(x => x.classList.toggle('on', x === b));
      const f = b.dataset.f;
      cards.forEach(c => c.hidden = !(f === 'all' || c.dataset.via === f));
    }));
  </script>
</body></html>`;

const out = path.resolve(process.cwd(), process.argv[2] || "icon-review.html");
fs.writeFileSync(out, html);
console.log("wrote", out, "·", rows.length, "rows · fallbacks:", counts.fallback || 0, "· direct-name:", counts.name || 0, "· keyword:", counts.keyword || 0);
