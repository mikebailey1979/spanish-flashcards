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
    const due = await dueList(lessons);
    const byLesson = {};
    for (const c of due) { const l = cardLesson[c.id]; if (l) byLesson[l.id] = (byLesson[l.id] || 0) + 1; }
    const hero = due.length
      ? (() => {
          const l = cardLesson[due[0].id];
          const n = byLesson[l.id] || due.length;
          return `<div class="hero">
            <div class="t-caps hero__label">Continue</div>
            <div class="t-title">${esc(l.name)}</div>
            <div style="display:flex;align-items:baseline;gap:10px">
              <span class="t-hero hero__num">${n}</span>
              <span class="t-label" style="opacity:.8">words to study</span>
            </div>
            <button class="btn btn--primary" data-act="study-lesson" data-id="${l.id}">Study</button>
          </div>`;
        })()
      : `<div class="hero" style="align-items:center;text-align:center">
          <div class="mark" style="width:72px;height:72px;animation:none">${icon("check", "")}<style></style></div>
          <div class="t-title">You're all set for now</div>
          <div class="muted">Everything you needed is done. Want to keep going anyway?</div>
          <button class="btn btn--primary" data-act="study-all">Keep practicing</button>
        </div>`;
    const list = lessons.map((l) => lessonRow(l, byLesson[l.id] || 0)).join("");
    mount(`<section class="screen screen--tabbed">
      <div class="home__head"><h1 class="t-h1">${esc(user.displayName)}</h1></div>
      ${hero}
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
    const n = (await dueList([l])).length;
    mount(`<section class="screen screen--tabbed">
      <div class="study-head__row" style="margin-bottom:var(--s-8)">
        <button class="study-head__exit" data-act="lessons">${icon("back")}</button>
        <span class="study-head__lesson" style="font-size:var(--t-title);font-weight:800">${esc(l.name)}</span>
      </div>
      <div class="hero">
        <div class="t-caps hero__label">${n ? n + " words to study" : "All caught up"}</div>
        <div class="t-title">${l.cardIds.length} words</div>
        <button class="btn btn--primary" data-act="study-lesson" data-id="${l.id}">Study this lesson</button>
      </div>
    </section>${tabbar("lessons")}`);
  }

  function renderPlaceholder(tab, title) {
    mount(`<section class="screen screen--tabbed">
      <h1 class="t-h1">${title}</h1>
      <div class="placeholder">${icon(tab === "progress" ? "progress" : "me")}
        <div class="t-title">Coming in a later phase</div>
        <div class="muted">This screen is designed and specced — not built yet.</div>
      </div>
    </section>${tabbar(tab)}`);
  }

  // ---- study session -------------------------------------------------------
  let S = null;  // { queue, idx, right, total, current, answered, res, grade, idk }
  async function startSession(ls) {
    const queue = await store.selectDue(ctx, ls, now(), 20);
    S = { queue, idx: 0, right: 0, total: queue.length, current: null, answered: false, res: null, grade: null, idk: false };
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
    S.answered = false; S.idk = false; S.res = null;
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
  }

  function check() {
    if (S.answered) return;
    const input = document.getElementById("answer-input");
    if (!input || !input.value.trim()) return;   // empty is never a miss (board 24)
    const res = matcher.isCorrect(input.value, S.current);
    S.answered = true; S.idk = false; S.res = res; S.grade = gradeFor(res, false);
    renderResult();
  }
  function idk() {
    if (S.answered) return;
    S.answered = true; S.idk = true; S.res = { correct: false, why: null }; S.grade = "again";
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
      <button class="btn btn--primary" data-act="grade-next">${nextLabel}</button>
    </section>`);
    if (correct) launchConfetti();
  }

  async function gradeNext() {
    const input = S.idk ? null : null;
    await store.review(ctx, S.current, S.grade, "type", now(), null);
    if (S.res && S.res.correct && !S.idk) S.right++;
    S.idx++;
    if (S.idx >= S.queue.length) return renderDone();
    renderQuestion();
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
      else if (tab === "progress") renderPlaceholder("progress", "Progress");
      else if (tab === "me") renderPlaceholder("me", "Me");
      else if (tab === "add") renderPlaceholder("home", "Add homework");
    }
    else if (act === "home") renderHome();
    else if (act === "lessons") renderLessons();
    else if (act === "open-lesson") renderLessonDetail(id);
    else if (act === "study-lesson") startSession([lessons.find((l) => l.id === id)]);
    else if (act === "study-all") startSession(lessons);
    else if (act === "idk") idk();
    else if (act === "grade-next") gradeNext();
    else if (act === "exit-study") renderHome();   // Phase 2: "Stop for now?" sheet
    else if (act === "noop") { /* Explain / dispute — later phases */ }
  });
  app.addEventListener("submit", (e) => {
    if (e.target.id === "answer-form") { e.preventDefault(); check(); }
  });

  renderHome();
  window.__app = { store, user, ctx, lessons };   // console poking
});
