/* Aliyah's Flashcards — Phase 1 UI controller.
   Core study loop + Home/Lessons on the existing data layer (es→en type).
   Invisible-SRS query, ratings, choose/speak, Progress/Me come in later phases. */
"use strict";
document.addEventListener("DOMContentLoaded", async () => {
  const model = self.SpanishFlashcardsModel;
  const matcher = self.SpanishFlashcardsMatcher;
  const { createStore } = self.SpanishFlashcardsStore;
  const { createIdbAdapter } = self.SpanishFlashcardsIdbAdapter;
  const { seedUser } = self.SpanishFlashcardsSeed;

  const app = document.getElementById("app");
  const DEMO_ID = "demo-local-user";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const icon = (n, cls = "") => `<i class="icon ${cls} icon--${n}"></i>`;
  const now = () => Date.now();

  // ---- data layer setup ----------------------------------------------------
  const store = createStore(createIdbAdapter({ name: "aliyah-flashcards-dev" }));
  let user = await store.getUser(DEMO_ID);
  if (!user) {
    user = model.createUser({ email: "aliyah@local", displayName: "Aliyah", role: "user" }, now());
    user.id = DEMO_ID;
    await store.putUser(user);
  }
  await seedUser(store, DEMO_ID, now());
  const ctx = store.studyContext(user);
  let lessons = await store.listLessons(DEMO_ID);

  // card.id -> lesson, for grouping due counts
  const cardLesson = {};
  for (const l of lessons) for (const id of l.cardIds) cardLesson[id] = l;

  // ---- helpers -------------------------------------------------------------
  const CHEERS = ["¡Muy bien!", "¡Eso es!", "¡Perfecto!", "¡Genial!"];
  function reasonChip(why) {
    return ({
      article: 'Counted: "the" is optional',
      plural: "Counted: one or many is fine",
      variant: "Counted: that works too",
      typo: "Counted: small typo forgiven",
    })[why] || null;   // exact → no chip
  }
  function gradeFor(res, idk) {
    if (idk || !res.correct) return "again";
    return res.why === "typo" ? "hard" : "good";
  }
  async function dueList(ls) { return store.selectDue(ctx, ls, now()); }

  // ---- metrics (derived from review history + progress) --------------------
  async function loadData() {
    const [events, progress, cards] = await Promise.all([
      store.adapter.getAll("reviewEvents"),
      store.adapter.getAll("progress"),
      store.adapter.getAll("cards"),
    ]);
    const mine = (r) => r && r.deletedAt == null && r.userId === ctx.studierId;
    const evs = events.filter(mine).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const byCard = new Map();
    for (const e of evs) { if (!byCard.has(e.cardId)) byCard.set(e.cardId, []); byCard.get(e.cardId).push(e); }
    const prog = new Map();
    for (const p of progress.filter(mine)) prog.set(p.cardId, p.srs);
    return { evs, byCard, prog, cards: cards.filter((c) => c && c.deletedAt == null && c.ownerId === ctx.contentOwnerId) };
  }
  // Ready for Testing: last two answers both not "again".
  function isReady(id, D) { const es = D.byCard.get(id); return !!es && es.length >= 2 && es.slice(-2).every((e) => e.grade !== "again"); }
  // Tricky: 2+ lapses, or still box 0–1 after 3+ tries; leaves after 3 right in a row.
  function isTricky(id, D) {
    const s = D.prog.get(id); if (!s) return false;
    if (!(s.lapses >= 2 || (s.box <= 1 && s.reps >= 3))) return false;
    const es = D.byCard.get(id) || [];
    return !(es.length >= 3 && es.slice(-3).every((e) => e.grade !== "again"));
  }
  function lessonReady(l, D) { return l.cardIds.length ? Math.round(l.cardIds.filter((id) => isReady(id, D)).length / l.cardIds.length * 100) : 0; }
  function trickyCards(D) { return D.cards.filter((c) => isTricky(c.id, D)); }
  const dayKey = (ts) => { const d = new Date(ts); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); };
  function streak(D) {
    const days = new Set(D.evs.map((e) => dayKey(Date.parse(e.at))));
    let n = 0; const d = new Date();
    if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);   // grace if today not studied yet
    while (days.has(dayKey(d.getTime()))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function weekStart() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  function weekStats(D) {
    const wk = D.evs.filter((e) => Date.parse(e.at) >= weekStart().getTime());
    const cards = new Set(wk.map((e) => e.cardId));
    let good = 0; for (const id of cards) { const f = wk.find((e) => e.cardId === id); if (f && f.grade !== "again") good++; }
    let sessions = 0, last = 0; for (const e of wk) { const t = Date.parse(e.at); if (t - last > 20 * 60000) sessions++; last = t; }
    return { words: cards.size, pct: cards.size ? Math.round(good / cards.size * 100) : 0, sessions };
  }

  // ---- selection: pull-regardless-of-due so study is never empty -----------
  const SESSION_SIZE = 20;   // default batch; Me "session length" (Full/10/20/30) is Phase 5
  const weakness = (srs) => !srs || srs.reps === 0 ? 1000 : srs.lapses * 10 + (5 - srs.box) * 2 + (srs.reps < 3 ? 3 : 0);
  async function practicePool(ls) {
    const ids = [...new Set(ls.flatMap((l) => l.cardIds))];
    const cards = await store.cardsByIds(ids, ctx.contentOwnerId);
    const out = [];
    for (const c of cards) { const p = await store.getProgress(ctx.studierId, c.id); out.push({ c, w: weakness(p ? p.srs : null) }); }
    out.sort((a, b) => b.w - a.w);
    return out.map((x) => x.c);
  }
  async function buildQueue(ls, size) {
    const due = await store.selectDue(ctx, ls, now());      // due + unseen, due-first
    const seen = new Set(due.map((c) => c.id));
    const queue = due.slice();
    if (!size || queue.length < size) {                      // fill weakest not-due so it's never empty
      for (const c of await practicePool(ls)) { if (!seen.has(c.id)) { queue.push(c); seen.add(c.id); if (size && queue.length >= size) break; } }
    }
    return size ? queue.slice(0, size) : queue;
  }
  function sessionSize() {   // Me "session length" preference; picker UI is Phase 5
    try { const v = localStorage.getItem("aliyah.sessionSize"); return v === "full" ? null : (v ? +v : SESSION_SIZE); }
    catch { return SESSION_SIZE; }
  }

  // ---- resume: keep an in-progress session for 24h (board 26) --------------
  const RESUME_KEY = "aliyah.resume";
  function saveResume() {
    if (!S || !S.queue.length) return;
    try { localStorage.setItem(RESUME_KEY, JSON.stringify({ ids: S.queue.map((c) => c.id), idx: S.idx, right: S.right, total: S.total, at: Date.now() })); } catch {}
  }
  function clearResume() { try { localStorage.removeItem(RESUME_KEY); } catch {} }
  function getResume() {
    try {
      const r = JSON.parse(localStorage.getItem(RESUME_KEY) || "null");
      if (!r || Date.now() - r.at > 24 * 3600000 || r.idx >= r.ids.length) { clearResume(); return null; }
      return r;
    } catch { return null; }
  }
  async function resumeSession() {
    const r = getResume(); if (!r) return renderHome();
    const cards = await store.cardsByIds(r.ids, ctx.contentOwnerId);
    const map = new Map(cards.map((c) => [c.id, c]));
    const queue = r.ids.map((id) => map.get(id)).filter(Boolean);
    if (!queue.length) { clearResume(); return renderHome(); }
    S = { queue, idx: Math.min(r.idx, queue.length - 1), right: r.right, total: r.total || queue.length, current: null, answered: false, res: null, grade: null, idk: false, rating: null, autoGrade: null };
    renderQuestion();
  }

  const tabbar = (active) => `
    <nav class="tabbar">
      ${[["home", "Home"], ["lessons", "Lessons"], ["add", "Add"], ["progress", "Progress"], ["me", "Me"]]
        .map(([id, label]) => id === "add"
          ? `<button class="tabbar__item tabbar__item--add" data-act="tab" data-tab="add"><span class="fab">${icon("add")}</span>Add</button>`
          : `<button class="tabbar__item" data-act="tab" data-tab="${id}" ${active === id ? 'aria-current="page"' : ""}>${icon(id)}${label}</button>`)
        .join("")}
    </nav>`;

  // ---- screens -------------------------------------------------------------
  async function renderHome() {
    const D = await loadData();
    const due = await dueList(lessons);
    const byLesson = {};
    for (const c of due) { const l = cardLesson[c.id]; if (l) byLesson[l.id] = (byLesson[l.id] || 0) + 1; }
    const st = streak(D), tricky = trickyCards(D).length;
    const resume = getResume();
    let hero;
    if (resume) {
      const rl = cardLesson[resume.ids[resume.idx]];
      const left = resume.total - resume.idx, pct = resume.total ? Math.round(resume.idx / resume.total * 100) : 0;
      hero = `<div class="hero">
        <div class="t-caps hero__label">Resume</div>
        <div class="t-title">${esc(rl ? rl.name : "Your session")}</div>
        <div style="display:flex;align-items:baseline;gap:10px">
          <span class="t-hero hero__num">${left}</span>
          <span class="t-label" style="opacity:.8">left in this session</span>
        </div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <button class="btn btn--primary" data-act="resume">Resume</button>
        <button data-act="new-session" style="background:none;border:0;color:inherit;opacity:.85;font-weight:700;cursor:pointer;padding:var(--s-3)">Start a new session instead</button>
      </div>`;
    } else if (due.length) {
      const l = cardLesson[due[0].id], n = byLesson[l.id] || due.length;
      hero = `<div class="hero">
        <div class="t-caps hero__label">Continue</div>
        <div class="t-title">${esc(l.name)}</div>
        <div style="display:flex;align-items:baseline;gap:10px">
          <span class="t-hero hero__num">${n}</span>
          <span class="t-label" style="opacity:.8">words to study<br>${lessonReady(l, D)}% of this lesson Ready for Testing</span>
        </div>
        <button class="btn btn--primary" data-act="study-lesson" data-id="${l.id}">Study</button>
      </div>`;
    } else {
      hero = `<div class="hero" style="align-items:center;text-align:center">
        <div class="mark" style="width:72px;height:72px;animation:none"><i class="mark__icon icon--check" style="background:var(--btn-text)"></i></div>
        <div class="t-title">You're all set for now</div>
        <div class="muted">Everything you've studied is fresh. Got new homework?</div>
        <button class="btn btn--primary" data-act="keep-practicing">Keep practicing</button>
      </div>`;
    }
    const trickyRow = `<button class="row" data-act="practice-tricky">
      <span class="row__main"><span class="row__title">Practice tricky words</span>
        <span class="row__meta">The ones that need another look</span></span>
      ${tricky ? `<span class="pill">${tricky}</span>` : ""}</button>`;
    const list = lessons.map((l) => lessonRow(l, byLesson[l.id] || 0)).join("");
    mount(`<section class="screen screen--tabbed">
      <div class="home__head"><h1 class="t-h1">${esc(user.displayName)}</h1>
        ${st ? `<span class="streak-pill">${icon("flame")}${st}-day streak</span>` : ""}</div>
      ${hero}
      ${trickyRow}
      <div class="section-label"><span class="t-caps" style="opacity:.75">Your lessons</span></div>
      <div class="list">${list}</div>
    </section>${tabbar("home")}`);
  }

  function lessonRow(l, due) {
    return `<button class="row" data-act="open-lesson" data-id="${l.id}">
      <span class="row__main">
        <span class="row__title">${esc(l.name)}</span>
        <span class="row__meta">${l.cardIds.length} words</span>
      </span>
      ${due ? `<span class="pill">${due}</span>` : ""}
    </button>`;
  }

  async function renderLessons() {
    const due = await dueList(lessons);
    const byLesson = {};
    for (const c of due) { const l = cardLesson[c.id]; if (l) byLesson[l.id] = (byLesson[l.id] || 0) + 1; }
    const list = lessons.map((l) => lessonRow(l, byLesson[l.id] || 0)).join("");
    mount(`<section class="screen screen--tabbed">
      <h1 class="t-h1" style="margin-bottom:var(--s-7)">Lessons</h1>
      <div class="list">
        <button class="row row--accent" data-act="study-all">
          <span class="row__main"><span class="row__title">Study all lessons</span>
            <span class="row__meta">Everything, all sections</span></span>
          ${icon("chevron", "icon--sm")}
        </button>
        ${list}
      </div>
    </section>${tabbar("lessons")}`);
  }

  async function renderLessonDetail(id) {
    const l = lessons.find((x) => x.id === id);
    if (!l) return renderLessons();
    const D = await loadData();
    const cards = await store.cardsByIds(l.cardIds, ctx.contentOwnerId);
    const ready = cards.filter((c) => isReady(c.id, D)).length;
    const started = cards.filter((c) => (D.byCard.get(c.id) || []).length > 0).length;
    const pct = lessonReady(l, D), tricky = cards.filter((c) => isTricky(c.id, D)).length;
    const secMap = new Map();
    for (const c of cards) { const k = c.category || "—"; if (!secMap.has(k)) secMap.set(k, []); secMap.get(k).push(c); }
    const sections = [...secMap.entries()].map(([name, cs]) => {
      const p = Math.round(cs.filter((c) => isReady(c.id, D)).length / cs.length * 100);
      return `<div class="row" style="cursor:default"><span class="row__main"><span class="row__title" style="-webkit-line-clamp:1">${esc(name)}</span><span class="row__bar"><i style="width:${p}%"></i></span></span><span class="row__value" style="font-weight:700;opacity:.85">${p}%</span></div>`;
    }).join("");
    mount(`<section class="screen screen--tabbed">
      <div class="study-head__row" style="margin-bottom:var(--s-7)">
        <button class="study-head__exit" data-act="lessons">${icon("back")}</button>
        <span class="study-head__lesson" style="font-size:var(--t-title);font-weight:800">${esc(l.name)}</span>
      </div>
      <div class="hero">
        <div class="t-hero" style="font-size:clamp(44px,15vw,64px)">${pct}%</div>
        <div class="t-label" style="opacity:.85">Ready for Testing · ${cards.length} words</div>
        <div class="progress"><i style="width:${pct}%"></i></div>
      </div>
      <div class="row" style="cursor:default;justify-content:space-around;text-align:center;margin-top:var(--s-4)">
        <span><div class="t-title">${ready}</div><div class="t-label" style="opacity:.7">Ready</div></span>
        <span><div class="t-title">${Math.max(0, started - ready)}</div><div class="t-label" style="opacity:.7">practicing</div></span>
        <span><div class="t-title">${cards.length - started}</div><div class="t-label" style="opacity:.7">not started</div></span>
      </div>
      <div class="section-label"><span class="t-caps" style="opacity:.75">By section</span></div>
      <div class="list">${sections}</div>
      ${tricky ? `<button class="row" data-act="practice-tricky" style="margin-top:var(--s-5)"><span class="row__main"><span class="row__title">${tricky} tricky words</span><span class="row__meta">Practice them in Tricky words</span></span>${icon("chevron", "icon--sm")}</button>` : ""}
      <button class="btn btn--primary" data-act="study-lesson" data-id="${l.id}" style="margin-top:var(--s-7)">Study this lesson</button>
    </section>${tabbar("lessons")}`);
  }

  async function renderProgress() {
    const D = await loadData();
    if (!D.evs.length) {
      return mount(`<section class="screen screen--tabbed">
        <h1 class="t-h1" style="margin-bottom:var(--s-7)">Progress</h1>
        <div class="placeholder">${icon("progress")}<div class="t-title">Nothing here yet</div>
          <div class="muted">Finish your first study session and your progress shows up here.</div>
          <button class="btn btn--primary" data-act="study-all" style="max-width:260px">Start studying</button></div>
      </section>${tabbar("progress")}`);
    }
    const st = streak(D), wk = weekStats(D), tricky = trickyCards(D).length;
    const days = new Set(D.evs.map((e) => dayKey(Date.parse(e.at))));
    const mon = weekStart();
    const dots = ["M", "T", "W", "T", "F", "S", "S"].map((lbl, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      const on = days.has(dayKey(d.getTime()));
      return `<span style="display:flex;flex-direction:column;align-items:center;gap:6px">
        <span style="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:${on ? "#fff" : "transparent"};box-shadow:${on ? "none" : "inset 0 0 0 2px var(--track)"}">${on ? `<i class="icon icon--sm icon--check" style="background:var(--correct);width:16px;height:16px"></i>` : ""}</span>
        <span class="t-label" style="opacity:.7">${lbl}</span></span>`;
    }).join("");
    const tiles = [[wk.words, "words practiced this week"], [wk.pct + "%", "right on the first try"], [wk.sessions, "study sessions"]]
      .map(([n, t]) => `<div class="hero" style="flex:1;padding:var(--s-6) var(--s-5);gap:4px"><div class="t-title">${n}</div><div class="t-label" style="opacity:.75">${t}</div></div>`).join("");
    const readyRows = lessons.map((l) => { const p = lessonReady(l, D); return `<div class="row" style="cursor:default"><span class="row__main"><span class="row__title" style="-webkit-line-clamp:1">${esc(l.name)}</span><span class="row__bar"><i style="width:${p}%"></i></span></span><span class="row__value" style="font-weight:700;opacity:.85">${p}%</span></div>`; }).join("");
    mount(`<section class="screen screen--tabbed">
      <h1 class="t-h1" style="margin-bottom:var(--s-6)">Progress</h1>
      <div class="hero">
        <div style="display:flex;align-items:center;gap:8px">${icon("flame", "icon--lg")}<span class="t-hero" style="font-size:44px">${st}</span><span class="t-title">day streak</span></div>
        <div style="display:flex;justify-content:space-between;margin-top:var(--s-3)">${dots}</div>
        <div class="muted" style="margin-top:var(--s-3)">Continue practicing and learning to keep your streak!</div>
      </div>
      <div style="display:flex;gap:var(--s-4);margin-top:var(--s-5)">${tiles}</div>
      <button class="row" data-act="practice-tricky" style="margin-top:var(--s-5)">
        <span class="row__main"><span class="t-caps" style="opacity:.75">Tricky words</span><span class="t-title">${tricky} words</span><span class="row__meta">that need another look</span></span>
        <span class="chip" style="background:#fff;color:var(--btn-text)">Practice</span></button>
      <div class="section-label"><span class="t-caps" style="opacity:.75">Lessons · Ready for Testing</span></div>
      <div class="list">${readyRows}</div>
    </section>${tabbar("progress")}`);
  }

  async function renderTricky() {
    const D = await loadData();
    const tc = trickyCards(D);
    const head = `<div class="study-head__row" style="margin-bottom:var(--s-7)"><button class="study-head__exit" data-act="home">${icon("back")}</button><span class="study-head__lesson" style="font-size:var(--t-title);font-weight:800">Tricky words</span></div>`;
    if (!tc.length) {
      return mount(`<section class="screen screen--tabbed">${head}
        <div class="empty"><i class="icon icon--star"></i><div class="empty__title">No tricky words right now</div>
          <div class="empty__text">Words you miss a few times show up here so you can practice them. Keep going!</div>
          <button class="btn btn--primary" data-act="lessons" style="max-width:260px">Back to lessons</button></div>
      </section>${tabbar("home")}`);
    }
    const byLesson = {};
    for (const c of tc) { const l = cardLesson[c.id]; if (l) byLesson[l.id] = (byLesson[l.id] || 0) + 1; }
    const rows = Object.entries(byLesson).map(([lid, n]) => { const l = lessons.find((x) => x.id === lid); return `<div class="row" style="cursor:default"><span class="row__main"><span class="row__title" style="-webkit-line-clamp:1">${esc(l ? l.name : "")}</span></span><span class="pill">${n}</span></div>`; }).join("");
    mount(`<section class="screen screen--tabbed">${head}
      <div class="hero"><div class="t-hero" style="font-size:56px">${tc.length}</div><div class="t-label" style="opacity:.85">words that need another look</div>
        <div class="muted" style="margin-top:4px">This group fills and empties by itself. A word leaves once you get it right 3 times in a row.</div></div>
      <div class="section-label"><span class="t-caps" style="opacity:.75">From your lessons</span></div>
      <div class="list">${rows}</div>
      <button class="btn btn--primary" data-act="study-tricky" style="margin-top:var(--s-7)">Practice tricky words</button>
    </section>${tabbar("home")}`);
  }

  // ---- study session -------------------------------------------------------
  let S = null;  // { queue, idx, right, total, current, answered, res, grade, idk, rating }
  async function startSession(ls) { startWith(await buildQueue(ls, sessionSize())); }
  function startWith(queue) {
    S = { queue, idx: 0, right: 0, total: queue.length, current: null, answered: false, res: null, grade: null, idk: false, rating: null };
    if (!queue.length) return renderAllSet();
    renderQuestion();
  }

  function studyHead(extraClass = "") {
    const c = S.current, prog = S.total ? ((S.idx) / S.total) * 100 : 0;
    const l = cardLesson[c.id];
    return `<div class="study-head ${extraClass}">
      <div class="progress"><i style="width:${prog}%"></i></div>
      <div class="study-head__row">
        <button class="study-head__exit" data-act="exit-study">${icon("close")}</button>
        <span class="study-head__lesson">${esc(l ? l.name : "")}</span>
        <span class="study-head__count">${S.idx + 1} / ${S.total}</span>
      </div>
    </div>`;
  }

  function renderQuestion() {
    const c = S.current = S.queue[S.idx];
    S.answered = false; S.idk = false; S.res = null; S.rating = null;
    mount(`<section class="screen study">
      ${studyHead()}
      <div class="study__stage">
        <div class="t-caps study__dir">Spanish → English</div>
        <h2 class="t-word study__prompt">${esc(c.front)}</h2>
        <div class="study__sub">Type the English</div>
      </div>
      <form id="answer-form" class="study__controls">
        <input class="field" id="answer-input" autocomplete="off" autocapitalize="off"
          autocorrect="off" spellcheck="false" placeholder="type the English translation">
        <div class="study__answerrow">
          <button type="button" class="btn btn--secondary btn--idk" data-act="idk">I don't know</button>
          <button type="submit" class="btn btn--primary" id="check-btn" disabled>Check</button>
        </div>
      </form>
    </section>`);
    const input = document.getElementById("answer-input");
    const checkBtn = document.getElementById("check-btn");
    if (input) {
      // Check stays disabled until she's typed something (board 24).
      input.addEventListener("input", () => { if (checkBtn) checkBtn.disabled = !input.value.trim(); });
      setTimeout(() => input.focus(), 60);
    }
    saveResume();   // persist in-progress session so she can resume within 24h
  }

  function check() {
    if (S.answered) return;
    const input = document.getElementById("answer-input");
    if (!input || !input.value.trim()) return;   // empty is never a miss (board 24)
    const res = matcher.isCorrect(input.value, S.current);
    S.answered = true; S.idk = false; S.res = res; S.grade = gradeFor(res, false); S.autoGrade = S.grade;
    renderResult();
  }
  function idk() {
    if (S.answered) return;
    S.answered = true; S.idk = true; S.res = { correct: false, why: null }; S.grade = "again"; S.autoGrade = "again";
    renderResult();
  }

  function renderResult() {
    const c = S.current, correct = S.res.correct && !S.idk;
    const stateClass = S.idk ? "" : correct ? "is-correct" : "is-notquite";
    let markIcon, cheer, sub, chip, link, nextLabel;
    if (correct) {
      markIcon = `<i class="mark__icon icon--check"></i>`;
      cheer = CHEERS[S.idx % CHEERS.length]; sub = "";
      const rc = reasonChip(S.res.why); chip = rc ? `<span class="chip">${esc(rc)}</span>` : "";
      link = ""; nextLabel = "Next";
    } else if (S.idk) {
      markIcon = `<i class="mark__icon mark__icon--idk"></i>`;
      cheer = "No problem."; sub = `<div class="muted">Here is the answer</div>`;
      chip = `<span class="chip">We'll practice it again</span>`; link = ""; nextLabel = "Got it";
    } else {
      markIcon = `<i class="mark__icon icon--close"></i>`;
      cheer = "¡Ánimo! You've got this."; sub = "";
      chip = `<span class="chip">We'll practice it again</span>`;
      link = `<div class="linkrow"><a data-act="noop">That should've counted</a> · <a data-act="noop">Explain</a></div>`;
      nextLabel = "Next";
    }
    const toolRow = S.idk ? "" : `<div class="toolrow" style="margin-bottom:var(--s-5)">
      <button class="toolbtn toolbtn--icon" data-act="noop">${icon("speaker", "icon--sm")}</button>
      <button class="toolbtn" data-act="open-rating">${icon("face-good", "icon--sm")} How was that?</button>
      <button class="toolbtn" data-act="noop">Explain</button></div>`;
    mount(`<section class="screen study ${stateClass}">
      ${studyHead()}
      <div class="result">
        <div class="mark-wrap"><div class="mark">${markIcon}</div>${correct ? '<span class="pulse"></span><span class="pulse b"></span>' : ""}</div>
        <div class="answer-block">
          <div class="t-title cheer">${esc(cheer)}</div>${sub}
          <div class="t-caps prompt-label">${esc(c.front)}</div>
          <div class="answer">${esc(c.back)}</div>
          ${chip}
        </div>
        ${link}
      </div>
      ${toolRow}
      <button class="btn btn--primary" data-act="grade-next">${nextLabel}</button>
    </section><div id="sheet-host"></div>`);
    if (correct) launchConfetti();
  }

  async function gradeNext() {
    // S.grade is the auto grade, possibly amended by her rating (see rate()).
    await store.review(ctx, S.current, S.grade, "type", now(), null, { autoGrade: S.autoGrade, rating: S.rating });
    if (S.res && S.res.correct && !S.idk) S.right++;
    S.idx++;
    if (S.idx >= S.queue.length) { clearResume(); return renderDone(); }
    renderQuestion();
  }

  // ---- optional face rating: may lower a correct grade or move it among
  // hard/good/easy, but never lifts a miss (board 26). ----------------------
  const RATE_GRADE = { easy: "easy", good: "good", tricky: "hard", didnt: "again" };
  function openRating() {
    const host = document.getElementById("sheet-host"); if (!host) return;
    host.innerHTML = `<div class="scrim" data-act="close-rating"></div>
      <div class="sheet"><div class="sheet__handle"></div>
        <div class="sheet__title">How was that one?</div>
        <div class="sheet__text">Only you see this. It helps pick what to practice.</div>
        <div class="faces">${[["easy", "Easy", "face-easy"], ["good", "Good", "face-good"], ["tricky", "Tricky", "face-tricky"], ["didnt", "Didn't know", "face-didnt"]]
          .map(([v, l, ic]) => `<button class="face" data-act="rate" data-val="${v}" ${S.rating === v ? 'aria-pressed="true"' : ""}><i class="icon icon--${ic}"></i>${l}</button>`).join("")}</div>
        <button class="btn btn--primary" data-act="close-rating">Done</button></div>`;
  }
  function rate(val) { S.rating = val; if (S.grade !== "again") S.grade = RATE_GRADE[val]; openRating(); }
  function closeRating() { const host = document.getElementById("sheet-host"); if (host) host.innerHTML = ""; }
  function openExit() {
    app.insertAdjacentHTML("beforeend", `<div class="scrim" data-act="close-exit"></div>
      <div class="sheet"><div class="sheet__handle"></div>
        <div class="sheet__title">Stop for now?</div>
        <div class="sheet__text">Your progress is saved. You can pick up where you left off.</div>
        <button class="btn btn--primary" data-act="close-exit">Keep going</button>
        <button class="btn btn--secondary" data-act="home">Stop for now</button></div>`);
  }
  function closeExit() { app.querySelectorAll(".scrim, .sheet").forEach((n) => n.remove()); }
  async function startTricky() { startWith(trickyCards(await loadData())); }
  function renderPlaceholder(tab, title) {
    mount(`<section class="screen screen--tabbed"><h1 class="t-h1">${esc(title)}</h1>
      <div class="placeholder">${icon(tab === "me" ? "me" : "add")}<div class="t-title">Coming in a later phase</div>
        <div class="muted">This screen is designed and specced — not built yet.</div></div>
    </section>${tabbar(tab === "me" ? "me" : "home")}`);
  }

  function renderDone() {
    const pct = S.total ? Math.round((S.right / S.total) * 100) : 0;
    mount(`<section class="screen study is-correct">
      <div class="study-head"><div class="progress"><i style="width:100%"></i></div></div>
      <div class="done">
        <div class="t-caps">Lesson done</div>
        <div class="t-hero done__num">${S.right}<span style="opacity:.6">/${S.total}</span></div>
        <div class="t-title">¡Qué bien, ${esc(user.displayName)}!</div>
        <div class="muted">${pct}% right</div>
      </div>
      <button class="btn btn--primary" data-act="home">Done</button>
    </section>`);
    launchConfetti();
  }

  function renderAllSet() {
    mount(`<section class="screen">
      <div class="study-head"><div class="study-head__row">
        <button class="study-head__exit" data-act="home">${icon("close")}</button>
      </div></div>
      <div class="done">
        <div class="mark" style="width:88px;height:88px;animation:none">${icon("check")}</div>
        <div class="t-title">You're all set for now</div>
        <div class="muted">Nothing to study right now.</div>
      </div>
      <button class="btn btn--primary" data-act="home">Back home</button>
    </section>`);
  }

  // ---- confetti (motion.css drives the keyframes) --------------------------
  function launchConfetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const wrap = document.querySelector(".mark-wrap"); if (!wrap) return;
    const colors = ["var(--confetti-1)", "var(--confetti-2)", "var(--confetti-3)", "var(--confetti-4)"];
    for (let i = 0; i < 10; i++) {
      const p = document.createElement("i");
      p.className = "confetti";
      p.style.background = colors[i % colors.length];
      p.style.setProperty("--dx", Math.round((Math.random() - 0.5) * 380) + "px");
      p.style.setProperty("--rot", Math.round((Math.random() - 0.5) * 540) + "deg");
      p.style.animationDelay = (Math.random() * 0.12).toFixed(2) + "s";
      wrap.appendChild(p);
    }
  }

  // ---- render + events -----------------------------------------------------
  function mount(html) { app.innerHTML = html; window.scrollTo(0, 0); }

  app.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const act = t.dataset.act, id = t.dataset.id;
    if (act === "tab") {
      const tab = t.dataset.tab;
      if (tab === "home") renderHome();
      else if (tab === "lessons") renderLessons();
      else if (tab === "progress") renderProgress();
      else if (tab === "me") renderPlaceholder("me", "Me");
      else if (tab === "add") renderPlaceholder("add", "Add homework");
    }
    else if (act === "home") renderHome();
    else if (act === "lessons") renderLessons();
    else if (act === "open-lesson") renderLessonDetail(id);
    else if (act === "study-lesson") startSession([lessons.find((l) => l.id === id)]);
    else if (act === "study-all" || act === "keep-practicing") startSession(lessons);
    else if (act === "resume") resumeSession();
    else if (act === "new-session") { clearResume(); renderHome(); }
    else if (act === "practice-tricky") renderTricky();
    else if (act === "study-tricky") startTricky();
    else if (act === "idk") idk();
    else if (act === "grade-next") gradeNext();
    else if (act === "open-rating") openRating();
    else if (act === "rate") rate(t.dataset.val);
    else if (act === "close-rating") closeRating();
    else if (act === "exit-study") openExit();
    else if (act === "close-exit") closeExit();
    else if (act === "noop") { /* Explain / dispute — later phases */ }
  });
  app.addEventListener("submit", (e) => {
    if (e.target.id === "answer-form") { e.preventDefault(); check(); }
  });

  renderHome();
  window.__app = { store, user, ctx, lessons };   // console poking
});
