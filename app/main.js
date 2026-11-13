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
  const answers = self.SpanishFlashcardsAnswers;   // speech helpers (answerLocale, recognitionAlternatives)
  const io = self.SpanishFlashcardsIO;             // export/import envelope (Your data → Export)

  const app = document.getElementById("app");
  const DEMO_ID = "demo-local-user";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const icon = (n, cls = "") => `<i class="icon ${cls} icon--${n}"></i>`;
  const now = () => Date.now();

  // ---- data layer setup ----------------------------------------------------
  const store = createStore(createIdbAdapter({ name: "aliyah-flashcards-dev" }));
  // The local demo account — the active account ONLY when no backend is configured
  // (local/dev). In production the signed-in Google account is bound in authGate.
  let demoUser = await store.getUser(DEMO_ID);
  if (!demoUser) {
    demoUser = model.createUser({ email: "aliyah@local", displayName: "Aliyah", role: "user" }, now());
    demoUser.id = DEMO_ID;
    await store.putUser(demoUser);
  }
  let user = demoUser;                                        // active account (swapped in on sign-in)
  let ctx = store.studyContext(user);                         // swapped during emulation (Phase 5d)
  let emu = null;                                             // {targetId, name, countOwn} while Viewing as
  let lessons = [];                                          // populated by refreshContent() before first paint
  const cardLesson = {};                                    // card.id -> lesson, for grouping due counts
  let allCards = [];                                         // for MC distractors

  // Rebuild the content caches after any lesson/card edit, or an emulation switch,
  // then schedule a background sync (a no-op until a backend is wired).
  async function _recache() {
    lessons = await store.listLessons(ctx.contentOwnerId);
    for (const k in cardLesson) delete cardLesson[k];
    for (const l of lessons) for (const id of l.cardIds) cardLesson[id] = l;
    allCards = await store.listCards(ctx.contentOwnerId);
  }
  async function refreshContent() { await _recache(); scheduleSync(); }

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
  // Pronounce-back (R1): browser SpeechSynthesis — free, on-device, offline, no infra.
  function speak(text, locale) {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !text) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = locale || "es-ES";
      u.rate = 0.95;
      const v = (synth.getVoices() || []).find((vo) => /^es/i.test(vo.lang || ""));
      if (v) u.voice = v;
      synth.speak(u);
    } catch {}
  }
  // Explain-my-answer (R1): on-demand AI explanation in a bottom sheet.
  function aiAdapter() {
    if (!aiReady() || !self.SpanishFlashcardsAiAdapter) return null;
    return self.SpanishFlashcardsAiAdapter.createFunctionAiAdapter({
      endpoint: self.AliyahConfig.ai.endpoint,
      getAccessToken: () => (_auth ? _auth.getAccessToken() : null),
    });
  }
  function mockExplain(card) {
    return new Promise((res) => setTimeout(() =>
      res(`“${(card && card.back) || "that"}” is “${(card && card.front) || "…"}” in Spanish. Tip: picture it while you say the Spanish out loud a couple of times — it sticks faster.`), 700));
  }
  async function openExplain(card, typed, dir) {
    if (!card) return;
    sheet(`<div class="sheet__title">Explain</div>
      <div id="explain-body" class="sheet__text" style="min-height:64px;display:flex;align-items:center;gap:var(--s-3)"><span style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite"></span> Thinking…</div>
      <button class="btn btn--secondary" data-act="close-sheet">Close</button>`);
    let text = "";
    const ad = aiAdapter();
    try {
      if (ad) { const r = await ad.explainAnswer(card, typed || null, dir || "es-en"); text = (r && r.text) || ""; }
      else { text = await mockExplain(card); }
    } catch { text = ""; }
    const body = document.getElementById("explain-body");
    if (body) { body.style.display = "block"; body.textContent = text || "Couldn’t load an explanation just now — check your connection and try again."; }
  }
  // Example sentence (R1): comprehensible-input example in a sheet, with a speaker.
  function mockEnrich(card) {
    return new Promise((res) => setTimeout(() => res({ es: `Me gusta ${(card && card.front) || "eso"}.`, en: `I like ${(card && card.back) || "that"}.` }), 700));
  }
  async function openExample(card) {
    if (!card) return;
    sheet(`<div class="sheet__title">Example</div>
      <div id="ex-body" class="sheet__text" style="min-height:64px;display:flex;align-items:center;gap:var(--s-3)"><span style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite"></span> Writing one…</div>
      <button class="btn btn--secondary" data-act="close-sheet">Close</button>`);
    let r = null; const ad = aiAdapter();
    try { r = ad ? await ad.enrichCard(card) : await mockEnrich(card); } catch { r = null; }
    const body = document.getElementById("ex-body");
    if (!body) return;
    if (r && r.es) body.outerHTML = `<div class="sheet__text"><div class="t-title" style="margin-bottom:4px">${esc(r.es)} <button class="toolbtn toolbtn--icon" data-act="speak" data-say="${esc(r.es)}" aria-label="Hear it" style="vertical-align:middle">${icon("speaker", "icon--sm")}</button></div><div class="muted">${esc(r.en || "")}</div></div>`;
    else { body.style.display = "block"; body.textContent = "Couldn’t write an example just now — try again in a moment."; }
  }
  // Translate-suggest (R1): fill a blank English field when adding a word.
  function mockSuggest(es) { return new Promise((r) => setTimeout(() => r({ text: es.replace(/^(el|la|los|las)\s+/i, "") + " (suggested)" }), 500)); }
  async function wordSuggestEn() {
    syncWordFields();
    const es = ((editWordState && editWordState.front) || "").trim();
    if (!es) { const f = document.getElementById("ew-es"); if (f) f.focus(); return; }
    const en = document.getElementById("ew-en"); if (en) en.value = "…";
    let text = ""; const ad = aiAdapter();
    try { const r = ad ? await ad.suggestTranslation(es) : await mockSuggest(es); text = (r && r.text) || ""; } catch {}
    if (editWordState) editWordState.back = text;
    if (en) en.value = text;
  }
  // Flag adjudication (R1): "that should've counted" → Claude rules → you confirm.
  let adjState = null;
  function mockAdjudicate(card, typed) {
    const ok = /casa|amig|biblioteca|gust/i.test(typed || "");
    return new Promise((r) => setTimeout(() => r(ok
      ? { verdict: "accept", reason: `Yes — “${typed}” means the same thing, so it should count.` }
      : { verdict: "reject", reason: `“${typed}” means something a little different — the answer is “${(card && card.back) || ""}”.` }), 700));
  }
  async function openAdjudicate(card, typed, dir) {
    if (!card || !typed) return;
    adjState = { card, typed };
    sheet(`<div class="sheet__title">Should that count?</div>
      <div id="adj-body" class="sheet__text" style="min-height:64px;display:flex;align-items:center;gap:var(--s-3)"><span style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite"></span> Checking “${esc(typed)}”…</div>
      <div id="adj-actions"></div>
      <button class="btn btn--secondary" data-act="close-sheet">Close</button>`);
    let r = null; const ad = aiAdapter();
    try { r = ad ? await ad.adjudicateAnswer(card, typed, dir || "es-en") : await mockAdjudicate(card, typed); } catch { r = null; }
    const body = document.getElementById("adj-body"), actions = document.getElementById("adj-actions");
    if (!body) return;
    body.style.display = "block";
    if (!r) { body.textContent = "Couldn’t check that just now — try again in a moment."; return; }
    body.textContent = r.reason || (r.verdict === "accept" ? "That should count." : "That doesn’t quite count.");
    if (actions && r.verdict === "accept") actions.innerHTML = `<button class="btn btn--primary" data-act="adj-accept" style="margin-top:var(--s-3)">Count “${esc(typed)}” from now on</button>`;
  }
  async function doAdjAccept() {
    if (!adjState) return;
    const { card, typed } = adjState;
    try {
      const next = Array.from(new Set([...(card.accepts || []), typed]));
      await store.editCard(card.id, { accepts: next }, now());
      card.accepts = next;
      await refreshContent();
    } catch {}
    const body = document.getElementById("adj-body"), actions = document.getElementById("adj-actions");
    if (body) body.textContent = `Done — “${typed}” will count from now on.`;
    if (actions) actions.innerHTML = "";
  }
  // Pronunciation practice (R2) — opt-in, consent-gated; records via the Azure Speech
  //  SDK (token from the function, key stays server-side), scores, then Claude coaches.
  //  NOTE: the mic/scoring path needs a real device to validate (can't test headless).
  const SPIN = `<span style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite"></span>`;
  function pronSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  function pronConsent() { try { return localStorage.getItem("aliyah.pron.consent") === "1"; } catch { return false; } }
  function loadSpeechSdk() {
    if (self.SpeechSDK) return Promise.resolve(self.SpeechSDK);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.40.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js";
      s.onload = () => resolve(self.SpeechSDK); s.onerror = () => reject(new Error("speech sdk failed to load"));
      document.head.appendChild(s);
    });
  }
  async function assessPronunciation(word) {
    const ad = aiAdapter(); if (!ad) throw new Error("backend not configured");
    const tok = await ad.speechToken(); if (!tok || !tok.token) throw new Error("no speech token");
    const SDK = await loadSpeechSdk();
    const speechConfig = SDK.SpeechConfig.fromAuthorizationToken(tok.token, tok.region);
    speechConfig.speechRecognitionLanguage = "es-ES";
    const audioConfig = SDK.AudioConfig.fromDefaultMicrophoneInput();
    const paConfig = new SDK.PronunciationAssessmentConfig(word, SDK.PronunciationAssessmentGradingSystem.HundredMark, SDK.PronunciationAssessmentGranularity.Phoneme, false);
    const recognizer = new SDK.SpeechRecognizer(speechConfig, audioConfig);
    paConfig.applyTo(recognizer);
    const result = await new Promise((resolve, reject) => recognizer.recognizeOnceAsync((r) => resolve(r), (e) => reject(e)));
    try { recognizer.close(); } catch {}
    const pa = SDK.PronunciationAssessmentResult.fromResult(result);
    let worst = null, worstScore = 101;
    try {
      for (const w of (pa.detailResult && pa.detailResult.Words) || [])
        for (const ph of w.Phonemes || []) {
          const sc = ph.PronunciationAssessment && ph.PronunciationAssessment.AccuracyScore;
          if (typeof sc === "number" && sc < worstScore) { worstScore = sc; worst = ph.Phoneme; }
        }
    } catch {}
    return { accuracy: pa.accuracyScore, pronunciation: pa.pronunciationScore, fluency: pa.fluencyScore, worstPhoneme: worst, said: result.text || "" };
  }
  function renderPronConsent(word) {
    sheet(`<div class="sheet__title">Pronunciation practice</div>
      <div class="sheet__text">When you tap Record, your microphone sends a short clip to a speech service (Azure) that scores how close your Spanish sounds. The clip is used only to score it and isn’t saved. It’s just friendly practice — it never changes your lesson progress.</div>
      <button class="btn btn--primary" data-act="pron-consent-ok" data-say="${esc(word)}">Got it, let’s try</button>
      <button class="btn btn--secondary" data-act="close-sheet">Not now</button>`);
  }
  function openPronounce(word) {
    if (!word) return;
    if (!pronSupported()) {
      sheet(`<div class="sheet__title">Say it</div><div class="sheet__text">Pronunciation practice needs a microphone this device doesn’t offer here. Try it on your phone.</div><button class="btn btn--secondary" data-act="close-sheet">Close</button>`);
      return;
    }
    if (!pronConsent()) return renderPronConsent(word);
    sheet(`<div class="sheet__title">Say “${esc(word)}”</div>
      <div id="pron-body" class="sheet__text" style="min-height:72px;text-align:center">Tap <b>Record</b> and say it out loud.</div>
      <button class="btn btn--primary" data-act="pron-record" data-say="${esc(word)}">${icon("mic", "icon--sm")} Record</button>
      <button class="btn btn--secondary" data-act="close-sheet">Close</button>`);
  }
  async function doPronRecord(word) {
    const body = document.getElementById("pron-body");
    if (body) body.innerHTML = `${SPIN} <span style="margin-left:8px">Listening… say “${esc(word)}”</span>`;
    let scores = null;
    try { scores = await assessPronunciation(word); }
    catch { if (body) body.innerHTML = `<div class="muted">Couldn’t hear that clearly — find a quiet spot and try again.</div>`; return; }
    const score = Math.round(scores.pronunciation || scores.accuracy || 0);
    if (body) body.innerHTML = `<div class="t-hero" style="font-size:44px">${score}<span style="opacity:.6;font-size:18px">/100</span></div><div id="pron-coach" class="muted" style="margin-top:6px">${SPIN} a tip…</div>`;
    try { const ad = aiAdapter(); const c = ad ? await ad.coachPronunciation(word, scores) : { text: "" }; const el = document.getElementById("pron-coach"); if (el) el.textContent = c.text || (score >= 85 ? "¡Muy bien! That sounded great." : "Nice try — say it a little slower and clearer next time."); } catch {}
  }

  // ---- Roleplay (R4): scripted "pretend chat" ----------------------------
  //  A bounded, fixed-scenario Spanish practice conversation using a lesson's
  //  words. Typed-only (v1). Every turn is moderated SERVER-SIDE (her input before
  //  the model, the reply before it's shown); the client just renders + saves the
  //  transcript. Kept behind AliyahConfig.roleplay.enabled (inert until reviewed).
  function roleplayOn() { return !!(self.AliyahConfig && self.AliyahConfig.roleplay && self.AliyahConfig.roleplay.enabled); }
  function roleplaySynced() { return !!(self.AliyahConfig && self.AliyahConfig.roleplay && self.AliyahConfig.roleplay.synced); }
  function RP() { return self.SpanishFlashcardsRoleplay || null; }
  let rp = null; // active chat: { session, scenario, lessonWords, busy, showEn, pendingUser, error, backLesson }

  function mockRoleplayTurn(payload) {
    const t = ((payload && payload.userText) || "").toLowerCase();
    if (RP() && RP().looksLikePII(t))
      return Promise.resolve({ status: "redirect", es: "Mmm, mejor sigamos con nuestra conversación. ¿Qué más quieres decir?", en: "Hmm, let's stick to our conversation. What else would you like to say?", reason: "looks like personal info" });
    const lines = [
      { es: "¡Claro! ¿Y algo más?", en: "Of course! Anything else?" },
      { es: "Muy bien. ¿Te gustaría algo de comer?", en: "Great. Would you like something to eat?" },
      { es: "Perfecto. ¡Gracias por venir!", en: "Perfect. Thanks for coming!" },
    ];
    const n = ((payload && payload.history) || []).filter((x) => x.role === "learner").length;
    return new Promise((r) => setTimeout(() => r(Object.assign({ status: "ok" }, lines[Math.min(n, lines.length - 1)])), 500));
  }

  function openRoleplayPicker(lessonId) {
    const m = RP(); if (!m) return;
    const l = lessons.find((x) => x.id === lessonId) || null;
    const items = m.SCENARIOS.map((s) => `<button class="row" data-act="rp-start" data-scn="${esc(s.id)}" data-lid="${esc(lessonId || "")}">
      <span class="row__main"><span class="row__title">${s.emoji} ${esc(s.title)}</span><span class="row__meta">${esc(s.blurb)}</span></span>${icon("chevron", "icon--sm")}</button>`).join("");
    sheet(`<div class="sheet__title">Pretend chat</div>
      <div class="sheet__text">Have a short make-believe conversation in Spanish using ${l ? `“${esc(l.name)}”` : "your"} words. It stays on the scene you pick, and a grown-up can see the chat afterward. Pick a scene:</div>
      <div class="list">${items}</div>
      <button class="btn btn--secondary" data-act="close-sheet">Not now</button>`);
  }

  async function startRoleplay(scenarioId, lessonId) {
    const m = RP(); if (!m) return;
    const scenario = m.getScenario(scenarioId); if (!scenario) return;
    closeSheet();
    const l = lessonId ? lessons.find((x) => x.id === lessonId) : null;
    const cards = l ? await store.cardsByIds(l.cardIds, ctx.contentOwnerId) : [];
    const lessonWords = m.lessonWordList(cards);
    const session = model.createRoleplaySession(
      { userId: ctx.studierId, scenarioId, lessonId: l ? l.id : null, lessonName: l ? l.name : null }, now());
    session.turns.push({ role: "ai", es: scenario.openingEs, en: scenario.openingEn, at: model.toIso(now()) });
    rp = { session, scenario, lessonWords, busy: false, showEn: false, pendingUser: null, error: false, backLesson: l ? l.id : null };
    await saveRoleplay();
    renderRoleplay();
  }

  async function saveRoleplay() {
    if (!rp) return;
    try { await store.putRoleplaySession(rp.session); if (roleplaySynced()) scheduleSync(); } catch {}
  }

  function renderRoleplay() {
    if (!rp) return renderLessons();
    const m = RP(); const { session, scenario } = rp;
    const left = m ? m.turnsRemaining(session) : 0;
    const ended = session.status === "ended" || left <= 0;
    const bubbles = session.turns.map((t) => {
      if (t.role === "ai") {
        return `<div class="rp-row rp-row--ai"><div class="rp-bubble rp-bubble--ai">
          <span class="rp-es">${esc(t.es)}</span> <button class="toolbtn toolbtn--icon rp-say" data-act="speak" data-say="${esc(t.es)}" aria-label="Hear it">${icon("speaker", "icon--sm")}</button>
          ${rp.showEn && t.en ? `<div class="rp-en">${esc(t.en)}</div>` : ""}</div></div>`;
      }
      if (t.moderation) return `<div class="rp-row rp-row--me"><div class="rp-bubble rp-bubble--redirect">Message hidden — let's keep it to the scene.</div></div>`;
      return `<div class="rp-row rp-row--me"><div class="rp-bubble rp-bubble--me">${esc(t.es)}</div></div>`;
    }).join("");
    const pending = rp.pendingUser != null ? `<div class="rp-row rp-row--me"><div class="rp-bubble rp-bubble--me is-pending">${esc(rp.pendingUser)}</div></div>` : "";
    const thinking = rp.busy ? `<div class="rp-row rp-row--ai"><div class="rp-bubble rp-bubble--ai"><span class="rp-dots"><i></i><i></i><i></i></span></div></div>` : "";
    const footer = ended
      ? `<div class="rp-ended"><div class="muted" style="text-align:center;margin-bottom:var(--s-4)">Nice chatting! That's the end of this one.</div>
          <button class="btn btn--primary" data-act="rp-again" data-scn="${esc(scenario.id)}" data-lid="${esc(rp.backLesson || "")}">Chat again</button>
          <button class="btn btn--secondary" data-act="rp-exit">Done</button></div>`
      : `<form class="rp-compose" data-act="rp-send-form">
          <input id="rp-input" class="rp-input" placeholder="Type in Spanish…" autocomplete="off" autocapitalize="sentences" ${rp.busy ? "disabled" : ""} maxlength="300">
          <button type="button" class="rp-send" data-act="rp-send" ${rp.busy ? "disabled" : ""} aria-label="Send">${icon("chevron", "icon--sm")}</button>
        </form>
        ${rp.error ? `<div class="muted" style="text-align:center;margin-top:var(--s-3)">Couldn't reach the chat just now — try sending again.</div>` : ""}`;
    mount(`<section class="screen rp-screen">
      <div class="study-head__row rp-head">
        <button class="study-head__exit" data-act="rp-exit" aria-label="Leave chat">${icon("close")}</button>
        <span class="rp-head__title">${scenario.emoji} ${esc(scenario.title)}</span>
        <button class="toolbtn rp-head__en ${rp.showEn ? "is-on" : ""}" data-act="rp-toggle-en" aria-pressed="${rp.showEn}">${rp.showEn ? "Hide English" : "Show English"}</button>
      </div>
      <div class="rp-sub muted">${esc(scenario.blurb)}${ended ? "" : ` · ${left} ${left === 1 ? "turn" : "turns"} left`}</div>
      <div class="rp-thread" id="rp-thread">${bubbles}${pending}${thinking}</div>
      ${footer}
    </section>`);
    const thread = document.getElementById("rp-thread"); if (thread) thread.scrollTop = thread.scrollHeight;
    const inp = document.getElementById("rp-input"); if (inp && !rp.busy && !ended) inp.focus();
  }

  function roleplayToggleEn() { if (rp) { rp.showEn = !rp.showEn; renderRoleplay(); } }

  async function sendRoleplay() {
    if (!rp || rp.busy) return;
    const m = RP(); if (!m) return;
    const inp = document.getElementById("rp-input");
    const text = m.clampInput(inp ? inp.value : "");
    if (!text) { if (inp) inp.focus(); return; }
    if (m.atTurnLimit(rp.session)) return endRoleplay();
    rp.busy = true; rp.error = false; rp.pendingUser = text;
    renderRoleplay();
    let res = null;
    try {
      const ad = aiAdapter();
      const payload = {
        scenarioId: rp.scenario.id,
        lessonWords: rp.lessonWords,
        history: rp.session.turns.map((t) => ({ role: t.role, es: t.es })),
        userText: text,
      };
      res = ad ? await ad.roleplayTurn(payload) : await mockRoleplayTurn(payload);
    } catch { res = null; }
    rp.pendingUser = null; rp.busy = false;
    const at = model.toIso(now());
    if (res && res.status === "redirect") {
      // Store a REDACTED learner turn (never persist the off-policy / PII text).
      rp.session.turns.push({ role: "learner", es: "[hidden]", en: null, at, moderation: { action: "redirect", reason: String(res.reason || "") } });
      rp.session.turns.push({ role: "ai", es: res.es, en: res.en || null, at });
    } else if (res && res.status === "ok") {
      rp.session.turns.push({ role: "learner", es: text, en: null, at });
      rp.session.turns.push({ role: "ai", es: res.es, en: res.en || null, at });
    } else {
      rp.error = true; renderRoleplay();
      const i2 = document.getElementById("rp-input"); if (i2) { i2.value = text; i2.focus(); }
      return;
    }
    if (m.atTurnLimit(rp.session)) { rp.session.status = "ended"; rp.session.endedAt = at; }
    model.markUpdated(rp.session, now());
    await saveRoleplay();
    renderRoleplay();
  }

  async function endRoleplay() {
    if (!rp) return;
    rp.session.status = "ended"; rp.session.endedAt = model.toIso(now());
    model.markUpdated(rp.session, now());
    await saveRoleplay();
    renderRoleplay();
  }
  function exitRoleplay() { const back = rp && rp.backLesson; rp = null; if (back) renderLessonDetail(back); else renderLessons(); }

  // Parent/admin review: read-only list + transcript of past pretend chats.
  async function renderRoleplayLog() {
    const sessions = await store.listRoleplaySessions();
    const users = await store.listUsers();
    const nameOf = (trackId) => {
      const base = model.trackBaseUser(trackId);
      const u = users.find((x) => x.id === base);
      return u ? (u.displayName || u.email) : "Learner";
    };
    const scnTitle = (id) => { const s = RP() && RP().getScenario(id); return s ? `${s.emoji} ${s.title}` : id; };
    const rows = sessions.length ? sessions.map((s) => `<button class="row" data-act="rp-log-open" data-id="${esc(s.id)}">
      <span class="row__main"><span class="row__title">${esc(nameOf(s.userId))} · ${esc(scnTitle(s.scenarioId))}</span>
      <span class="row__meta">${esc(s.lessonName || "")}${s.lessonName ? " · " : ""}${esc(String(s.startedAt).slice(0, 10))} · ${s.turns.filter((t) => t.role === "learner").length} replies</span></span>${icon("chevron", "icon--sm")}</button>`).join("")
      : `<div class="placeholder">${icon("me")}<div class="t-title">No pretend chats yet</div><div class="muted">Transcripts show up here once someone practices one.</div></div>`;
    mount(`<section class="screen screen--tabbed">
      <div class="study-head__row" style="margin-bottom:var(--s-6)">
        <button class="study-head__exit" data-act="people">${icon("back")}</button>
        <span class="study-head__lesson" style="font-size:var(--t-title);font-weight:800">Pretend-chat transcripts</span></div>
      <div class="muted" style="margin-bottom:var(--s-5)">Every practice conversation, so you can see what was said.</div>
      <div class="list">${rows}</div>
    </section>${tabbar("me")}`);
  }
  async function renderRoleplayTranscript(id) {
    const s = await store.getRoleplaySession(id); if (!s) return renderRoleplayLog();
    const scn = RP() && RP().getScenario(s.scenarioId);
    const bubbles = s.turns.map((t) => {
      if (t.role === "ai") return `<div class="rp-row rp-row--ai"><div class="rp-bubble rp-bubble--ai"><span class="rp-es">${esc(t.es)}</span>${t.en ? `<div class="rp-en">${esc(t.en)}</div>` : ""}</div></div>`;
      if (t.moderation) return `<div class="rp-row rp-row--me"><div class="rp-bubble rp-bubble--redirect">Message hidden (${esc(t.moderation.reason || "off-topic")})</div></div>`;
      return `<div class="rp-row rp-row--me"><div class="rp-bubble rp-bubble--me">${esc(t.es)}</div></div>`;
    }).join("");
    mount(`<section class="screen rp-screen">
      <div class="study-head__row rp-head">
        <button class="study-head__exit" data-act="rp-log">${icon("back")}</button>
        <span class="rp-head__title">${scn ? scn.emoji + " " + esc(scn.title) : esc(s.scenarioId)}</span><span style="width:40px"></span></div>
      <div class="rp-sub muted">${esc(s.lessonName || "")}${s.lessonName ? " · " : ""}${esc(String(s.startedAt).slice(0, 10))}${s.status === "ended" ? " · ended" : ""}</div>
      <div class="rp-thread">${bubbles}</div>
    </section>`);
  }

  // ---- direction, mode + bidirectional grading (Phase 3) -------------------
  const DIRS = ["es-en", "en-es"];
  const speakSupported = !!(self.SpeechRecognition || self.webkitSpeechRecognition);
  function pref(key, allowed, dflt) { try { const v = localStorage.getItem(key); return allowed.includes(v) ? v : dflt; } catch { return dflt; } }
  function pickDir() { const s = pref("aliyah.direction", DIRS, "mixed"); return s === "mixed" ? DIRS[Math.random() < .5 ? 0 : 1] : s; }
  function pickMode() {
    const s = pref("aliyah.mode", ["type", "choice", "speak"], "mixed");
    if (s !== "mixed") return s === "speak" && !speakSupported ? "type" : s;
    const modes = speakSupported ? ["type", "choice", "speak"] : ["type", "choice"];
    return modes[Math.floor(Math.random() * modes.length)];
  }
  const promptOf = (c, dir) => dir === "es-en" ? c.front : c.back;   // what she sees
  const answerOf = (c, dir) => dir === "es-en" ? c.back : c.front;   // what's correct
  // Resolve a card's spelling tolerance (Phase 4d): strictMode "follow" defers to
  // the global Exact setting; "exact"/"forgiving" override it. Accents always ignored.
  const ALL_STRICT = { article: true, plural: true, typo: true };
  function exactSetting() { try { return localStorage.getItem("aliyah.exact") === "on"; } catch { return false; } }
  function effectiveStrict(c) {
    const mode = c.strictMode || "follow";
    if (mode === "exact") return Object.assign({}, ALL_STRICT);
    if (mode === "forgiving") return {};
    return exactSetting() ? Object.assign({}, ALL_STRICT) : {};
  }
  // The card the matcher grades against for this direction (es→en uses the card
  // as-is; en→es flips so the Spanish front is the accepted answer).
  const targetCard = (c, dir) => {
    const strict = effectiveStrict(c);
    return dir === "es-en" ? Object.assign({}, c, { strict }) : { back: c.front, accepts: [], strict };
  };
  function gradeAnswer(input, c, dir) {
    const target = targetCard(c, dir);
    const res = matcher.isCorrect(input, target);
    if (res.correct) return { correct: true, why: res.why };
    const st = target.strict || {};
    if (st.article || st.plural || st.typo) {   // would it pass if we forgave the strict rule? → near miss
      const lenient = matcher.isCorrect(input, Object.assign({}, target, { strict: {} }));
      if (lenient.correct) return { correct: false, near: true, fix: nearFix(lenient.why, c, dir) };
    }
    return { correct: false };
  }
  const ARTICLE_RE = /^(el|la|los|las|un|una|unos|unas|the|a|an)\s+/i;
  function nearFix(why, c, dir) {
    if (why === "article") { const m = answerOf(c, dir).match(ARTICLE_RE); return m ? `This one needs "${m[1].toLowerCase()}"` : "Check the article"; }
    if (why === "plural") return "Check the ending — one or many?";
    if (why === "typo") return "So close — check the spelling.";
    return "Look closely at the exact form.";
  }
  function distractors(c, dir) {   // MC: same-category answer-side, else any
    let same = allCards.filter((x) => x.id !== c.id && x.category === c.category).map((x) => answerOf(x, dir));
    if (same.length < 3) same = allCards.filter((x) => x.id !== c.id).map((x) => answerOf(x, dir));
    same = [...new Set(same.filter(Boolean))].sort(() => Math.random() - .5).slice(0, 3);
    return [...same, answerOf(c, dir)].sort(() => Math.random() - .5);
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
    if (!(s.lapses >= 2 || ((s.difficulty || 5) >= 7 && s.reps >= 3))) return false;
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
  const weakness = (srs) => !srs || srs.reps === 0 ? 1000 : srs.lapses * 10 + (srs.difficulty || 5) * 2 + (srs.reps < 3 ? 3 : 0);
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
    if (!lessons.length) return renderFirstRun();
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
      <div class="home__head"><h1 class="t-h1">${esc(emu ? emu.name : user.displayName)}</h1>
        ${st ? `<span class="streak-pill">${icon("flame")}${st}-day streak</span>` : ""}</div>
      ${hero}
      ${trickyRow}
      <div class="section-label"><span class="t-caps" style="opacity:.75">Your lessons</span></div>
      <div class="list">${list}</div>
    </section>${tabbar("home")}`);
    if (!installChecked) { installChecked = true; maybeShowInstallGuide(); }   // one-time Safari install prompt
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
    const strictLabel = { exact: "Exact", forgiving: "Forgiving" };
    const sections = [...secMap.entries()].map(([name, cs]) => {
      const p = Math.round(cs.filter((c) => isReady(c.id, D)).length / cs.length * 100);
      const rows = cs.map((c) => `<div class="word-row">
        <span class="word-row__main"><span class="word-row__es">${esc(c.front)}</span><span class="word-row__en">${esc(c.back)}</span></span>
        ${c.strictMode && c.strictMode !== "follow" ? `<span class="word-row__flag">${esc(strictLabel[c.strictMode] || "")}</span>` : ""}
        <button class="word-row__edit" data-act="speak" data-say="${esc(c.front)}" aria-label="Hear ${esc(c.front)}">${icon("speaker")}</button>
        <button class="word-row__edit" data-act="word-edit" data-id="${c.id}" data-lid="${l.id}" aria-label="Edit ${esc(c.front)}">${icon("edit")}</button>
      </div>`).join("");
      return `<div class="section-label"><span class="t-caps" style="opacity:.75">${esc(name === "—" ? "Other" : name)}</span><span class="t-label" style="opacity:.7">${p}%</span></div>
        <div class="word-list">${rows}</div>`;
    }).join("");
    mount(`<section class="screen screen--tabbed">
      <div class="study-head__row" style="margin-bottom:var(--s-7)">
        <button class="study-head__exit" data-act="lessons">${icon("back")}</button>
        <span class="study-head__lesson" style="font-size:var(--t-title);font-weight:800">${esc(l.name)}</span>
        <button class="study-head__exit" data-act="lesson-menu" data-id="${l.id}" aria-label="Lesson options" style="margin-left:auto">${icon("more")}</button>
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
      <div class="words-head"><span class="t-caps" style="opacity:.75">Words</span>
        <button class="chip" data-act="word-add" data-id="${l.id}">${icon("add", "icon--sm")} Add a word</button></div>
      ${sections}
      ${tricky ? `<button class="row" data-act="practice-tricky" style="margin-top:var(--s-5)"><span class="row__main"><span class="row__title">${tricky} tricky words</span><span class="row__meta">Practice them in Tricky words</span></span>${icon("chevron", "icon--sm")}</button>` : ""}
      <button class="btn btn--primary" data-act="study-lesson" data-id="${l.id}" style="margin-top:var(--s-7)">Study this lesson</button>
      ${roleplayOn() ? `<button class="btn btn--secondary" data-act="rp-open" data-id="${l.id}" style="margin-top:var(--s-4)">${icon("chat", "icon--sm")} Practice a pretend chat</button>` : ""}
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

  function renderQuestion() {   // picks direction/mode ONCE, then renders
    S.current = S.queue[S.idx];
    S.answered = false; S.idk = false; S.res = null; S.rating = null; S.typed = null;
    S.dir = pickDir(); S.mode = pickMode();
    S.speak = { phase: "ready", heard: "", note: "", rec: null };
    renderCard();
    saveResume();   // persist in-progress session so she can resume within 24h
  }
  function renderCard() {       // re-renderable (speak phases call this; mode stays)
    const c = S.current;
    const dirLabel = S.dir === "es-en" ? "Spanish → English" : "English → Spanish";
    const sub = S.mode === "choice" ? "Pick the match"
      : S.mode === "speak" ? (S.dir === "es-en" ? "Say it in English" : "Say it in Spanish")
      : (S.dir === "es-en" ? "Type the English" : "Type the Spanish");
    const stage = `<div class="t-caps study__dir">${dirLabel}</div>
      <h2 class="t-word study__prompt">${esc(promptOf(c, S.dir))}</h2>
      <div class="study__sub">${sub}</div>`;
    let controls;
    if (S.mode === "choice") {
      controls = `<div class="study__controls"><div class="options">${distractors(c, S.dir)
        .map((o) => `<button class="option" data-act="pick-option" data-val="${esc(o)}">${esc(o)}</button>`).join("")}</div>
        <button class="idk-link" data-act="idk">I don't know</button></div>`;
    } else if (S.mode === "speak") {
      controls = speakControls();
    } else {
      const ph = S.dir === "es-en" ? "type the English translation" : "type the Spanish translation";
      controls = `<form id="answer-form" class="study__controls">
        <input class="field" id="answer-input" autocomplete="off" autocapitalize="off" autocorrect="off"
          spellcheck="false" ${S.dir === "en-es" ? 'lang="es"' : ""} placeholder="${ph}">
        <div class="study__answerrow">
          <button type="button" class="btn btn--secondary btn--idk" data-act="idk">I don't know</button>
          <button type="submit" class="btn btn--primary" id="check-btn" disabled>Check</button>
        </div></form>`;
    }
    mount(`<section class="screen study">${studyHead()}<div class="study__stage">${stage}</div>${controls}</section>`);
    const input = document.getElementById("answer-input");
    const checkBtn = document.getElementById("check-btn");
    if (input) {
      input.addEventListener("input", () => { if (checkBtn) checkBtn.disabled = !input.value.trim(); });
      setTimeout(() => input.focus(), 60);
    }
  }

  // ---- Speak mode (Phase 3b): Web Speech API, never auto-submits ----------
  function speakControls() {
    const sp = S.speak;
    if (sp.phase === "blocked") {
      return `<div class="study__controls speak">
        <div class="speak__mic"><span class="mic-btn mic-btn--off">${icon("mic-off", "icon--lg")}</span>
          <div class="speak__status"><strong>Speaking isn't available</strong><br>This phone hasn't given the app the microphone. You can type the answer instead.</div></div>
        <button class="btn btn--primary" data-act="type-instead">Type instead</button>
        <button class="idk-link" data-act="noop">How to turn on the microphone</button></div>`;
    }
    if (sp.phase === "listening") {
      return `<div class="study__controls speak">
        <div class="speak__mic"><button class="mic-btn listening" data-act="speak-stop">${icon("mic", "icon--lg")}</button>
          <div class="dots"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="speak__status">Tap when you're done</div></div>
        <button class="btn btn--secondary" data-act="idk">I don't know</button></div>`;
    }
    if (sp.phase === "heard") {
      return `<div class="study__controls speak">
        <div class="heard-panel"><div class="t-caps">I heard</div><div class="heard-word">${esc(sp.heard)}</div></div>
        <button class="idk-link" data-act="speak-retry">Not what you said? Try again</button>
        <div class="study__answerrow">
          <button class="btn btn--secondary btn--idk" data-act="idk">I don't know</button>
          <button class="btn btn--primary" data-act="speak-check">Check</button></div></div>`;
    }
    return `<div class="study__controls speak">
      <div class="speak__mic"><button class="mic-btn" data-act="speak-start">${icon("mic", "icon--lg")}</button>
        <div class="speak__status">${sp.note ? esc(sp.note) : "Tap and say it"}</div></div>
      <div class="study__answerrow">
        <button class="btn btn--secondary btn--idk" data-act="idk">I don't know</button>
        <button class="btn btn--secondary" data-act="type-instead">Type instead</button></div></div>`;
  }
  function speakStart() {
    const SR = self.SpeechRecognition || self.webkitSpeechRecognition;
    if (!SR) { S.speak.phase = "blocked"; return renderCard(); }
    let rec; try { rec = new SR(); } catch { S.speak.phase = "blocked"; return renderCard(); }
    rec.lang = answers.answerLocale(S.dir); rec.continuous = false; rec.interimResults = false; rec.maxAlternatives = 5;
    S.speak = { ...S.speak, phase: "listening", rec, note: "" }; renderCard();
    rec.onresult = (e) => {
      const alts = answers.recognitionAlternatives(e);
      if (!alts.length) return noCapture();
      S.speak = { ...S.speak, phase: "heard", heard: alts[0], alts }; renderCard();
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") { S.speak.phase = "blocked"; renderCard(); }
      else noCapture();
    };
    rec.onend = () => { if (S.speak.phase === "listening") noCapture(); };
    try { rec.start(); } catch { noCapture(); }
  }
  function noCapture() {   // unintelligible / nothing heard — NEVER auto-submit (board 34)
    S.speak = { ...S.speak, phase: "ready", heard: "", rec: null, note: "Didn't catch that — try again, or type it." };
    renderCard();
  }
  function speakStop() { try { S.speak.rec && S.speak.rec.stop(); } catch {} }
  function speakRetry() { S.speak = { ...S.speak, phase: "ready", heard: "", note: "" }; renderCard(); }
  function speakCheck() { if (!S.speak.heard) return; S.typed = S.speak.heard; finishAnswer(gradeAnswer(S.speak.heard, S.current, S.dir)); }
  function typeInstead() { try { S.speak.rec && S.speak.rec.abort(); } catch {} S.mode = "type"; renderCard(); }

  function finishAnswer(res) {
    S.answered = true; S.idk = false; S.res = res;
    S.grade = res.correct ? (res.why === "typo" ? "hard" : "good") : "again";
    S.autoGrade = S.grade;
    renderResult();
  }
  function check() {
    if (S.answered) return;
    const input = document.getElementById("answer-input");
    if (!input || !input.value.trim()) return;   // empty is never a miss (board 24)
    S.typed = input.value;
    finishAnswer(gradeAnswer(input.value, S.current, S.dir));
  }
  function chooseAnswer(val) {
    if (S.answered) return;
    S.typed = val;
    finishAnswer(gradeAnswer(val, S.current, S.dir));
  }
  function idk() {
    if (S.answered) return;
    S.answered = true; S.idk = true; S.typed = null; S.res = { correct: false }; S.grade = "again"; S.autoGrade = "again";
    renderResult();
  }

  function renderResult() {
    const c = S.current, correct = S.res.correct && !S.idk, near = !S.idk && S.res.near;
    const stateClass = (correct || S.idk) ? (correct ? "is-correct" : "") : "is-notquite";
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
    } else if (near) {   // strict near-miss — the form is the teaching point (board 27)
      markIcon = `<i class="mark__icon icon--close"></i>`;
      cheer = "Almost there."; sub = "";
      chip = `<span class="chip">${esc(S.res.fix)}</span>${S.typed ? `<span class="chip">You wrote: ${esc(S.typed)}</span>` : ""}`;
      link = ""; nextLabel = "Next";
    } else {
      markIcon = `<i class="mark__icon icon--close"></i>`;
      cheer = "¡Ánimo! You've got this."; sub = "";
      chip = `<span class="chip">We'll practice it again</span>${(S.mode === "choice" && S.typed) ? `<span class="chip">You picked: ${esc(S.typed)}</span>` : ""}`;
      link = `<div class="linkrow"><a data-act="adjudicate">That should've counted</a> · <a data-act="explain">Explain</a></div>`;
      nextLabel = "Next";
    }
    const toolRow = S.idk ? "" : `<div class="toolrow" style="margin-bottom:var(--s-5)">
      <button class="toolbtn toolbtn--icon" data-act="speak" data-say="${esc(c.front)}" aria-label="Hear it in Spanish">${icon("speaker", "icon--sm")}</button>
      <button class="toolbtn toolbtn--icon" data-act="pronounce" data-say="${esc(c.front)}" aria-label="Say it">${icon("mic", "icon--sm")}</button>
      <button class="toolbtn" data-act="open-rating">${icon("face-good", "icon--sm")} How was that?</button>
      <button class="toolbtn" data-act="explain">Explain</button>
      <button class="toolbtn" data-act="example">Example</button></div>`;
    mount(`<section class="screen study ${stateClass}">
      ${studyHead()}
      <div class="result">
        <div class="mark-wrap"><div class="mark">${markIcon}</div>${correct ? '<span class="pulse"></span><span class="pulse b"></span>' : ""}</div>
        <div class="answer-block">
          <div class="t-title cheer">${esc(cheer)}</div>${sub}
          <div class="t-caps prompt-label">${esc(promptOf(c, S.dir))}</div>
          <div class="answer">${esc(answerOf(c, S.dir))}</div>
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
    await store.review(ctx, S.current, S.grade, S.mode || "type", now(), null, { autoGrade: S.autoGrade, rating: S.rating });
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

  // ---- lesson management (Phase 4b) ---------------------------------------
  function closeSheet() { app.querySelectorAll(".scrim, .sheet").forEach((n) => n.remove()); }
  function sheet(html) {
    closeSheet();
    app.insertAdjacentHTML("beforeend",
      `<div class="scrim" data-act="close-sheet"></div><div class="sheet"><div class="sheet__handle"></div>${html}</div>`);
  }
  function openLessonMenu(id) {
    const l = lessons.find((x) => x.id === id); if (!l) return;
    const catOf = new Map(allCards.map((c) => [c.id, c.category || "—"]));
    const canMerge = lessons.length > 1;                                  // need another lesson
    const canSplit = new Set(l.cardIds.map((cid) => catOf.get(cid) || "—")).size >= 2;  // need a boundary
    sheet(`<div class="sheet__title" style="margin-bottom:var(--s-4)">${esc(l.name)}</div>
      <div class="menu">
        <button class="menu__item" data-act="lesson-rename" data-id="${id}">${icon("edit")}<span>Rename</span></button>
        <button class="menu__item" data-act="lesson-merge" data-id="${id}" ${canMerge ? "" : "disabled"}>${icon("merge")}<span>Merge with another lesson</span></button>
        <button class="menu__item" data-act="lesson-split" data-id="${id}" ${canSplit ? "" : "disabled"}>${icon("split")}<span>Split into two lessons</span></button>
        <button class="menu__item menu__item--danger" data-act="lesson-delete" data-id="${id}">${icon("trash")}<span>Delete lesson</span></button>
      </div>`);
  }
  function openRename(id) {
    const l = lessons.find((x) => x.id === id); if (!l) return;
    const max = 80;
    sheet(`<div class="sheet__title">Rename lesson</div>
      <input id="rename-field" class="field" maxlength="${max}" value="${esc(l.name)}" aria-label="Lesson name">
      <div class="t-label" style="text-align:right;color:var(--sheet-muted)"><span id="rename-count">${l.name.length}</span>/${max}</div>
      <button class="btn btn--primary" data-act="lesson-rename-save" data-id="${id}">Save</button>
      <button class="btn btn--secondary" data-act="close-sheet">Cancel</button>`);
    const f = document.getElementById("rename-field");
    if (f) {
      f.focus(); f.setSelectionRange(f.value.length, f.value.length);
      f.addEventListener("input", () => { const c = document.getElementById("rename-count"); if (c) c.textContent = f.value.length; });
    }
  }
  async function doRename(id) {
    const f = document.getElementById("rename-field"); const name = (f ? f.value : "").trim();
    if (!name) { if (f) f.focus(); return; }
    await store.renameLesson(id, name, now()); await refreshContent(); closeSheet(); renderLessonDetail(id);
  }
  function openDeleteLesson(id) {
    const l = lessons.find((x) => x.id === id); if (!l) return;
    sheet(`<div class="sheet__title">Delete ${esc(l.name)}?</div>
      <div class="sheet__text">The ${l.cardIds.length} words and your progress on them will be removed from all your devices. You can undo this for 7 days.</div>
      <button class="btn btn--destructive" data-act="lesson-delete-confirm" data-id="${id}">Delete lesson</button>
      <button class="btn btn--secondary" data-act="close-sheet">Keep it</button>`);
  }
  async function doDeleteLesson(id) {
    const l = lessons.find((x) => x.id === id); const name = l ? l.name : "Lesson";
    await store.deleteLesson(id, now()); await refreshContent(); closeSheet(); await renderLessons();
    showUndoToast(id, name);
  }
  function showUndoToast(id, name) {
    app.querySelectorAll(".toast").forEach((n) => n.remove());
    app.insertAdjacentHTML("beforeend",
      `<div class="toast"><span>${esc(name)} deleted</span><button class="link" data-act="lesson-undo" data-id="${id}">Undo</button></div>`);
    const t = app.querySelector(".toast");
    setTimeout(() => { if (t && t.isConnected) t.remove(); }, 6000);
  }
  async function undoDelete(id) {
    await store.restoreLesson(id, now()); await refreshContent();
    app.querySelectorAll(".toast").forEach((n) => n.remove()); renderLessonDetail(id);
  }
  async function renderRecentlyDeleted() {
    const owner = ctx.contentOwnerId;
    const deleted = await store.listDeletedLessons(owner);
    const deletedWords = await store.listDeletedCards(owner);
    const daysLeftOf = (iso) => Math.max(0, 7 - Math.floor((now() - Date.parse(iso)) / 86400000));
    const lessonRows = deleted.map((l) => {
      const daysLeft = daysLeftOf(l.deletedAt);
      return `<div class="row" style="cursor:default"><span class="row__main">
        <span class="row__title" style="-webkit-line-clamp:1">${esc(l.name)}</span>
        <span class="row__meta">${l.cardIds.length} words · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left</span></span>
        <button class="chip" style="background:#fff;color:var(--btn-text)" data-act="lesson-restore" data-id="${l.id}">Restore</button></div>`;
    }).join("");
    const wordRows = deletedWords.map((c) => {
      const daysLeft = daysLeftOf(c.deletedAt);
      const l = lessons.find((x) => x.id === c.deletedFromLessonId);
      return `<div class="row" style="cursor:default"><span class="row__main">
        <span class="row__title" style="-webkit-line-clamp:1">${esc(c.front)} · ${esc(c.back)}</span>
        <span class="row__meta">${l ? esc(l.name) + " · " : ""}${daysLeft} day${daysLeft === 1 ? "" : "s"} left</span></span>
        <button class="chip" style="background:#fff;color:var(--btn-text)" data-act="word-restore" data-id="${c.id}">Restore</button></div>`;
    }).join("");
    const empty = !deleted.length && !deletedWords.length;
    mount(`<section class="screen screen--tabbed">
      <div class="study-head__row" style="margin-bottom:var(--s-7)">
        <button class="study-head__exit" data-act="tab" data-tab="me">${icon("back")}</button>
        <span class="study-head__lesson" style="font-size:var(--t-title);font-weight:800">Recently deleted</span>
      </div>
      <div class="muted" style="margin-bottom:var(--s-5)">Deleted lessons and words stay here for 7 days, then they are gone for good. Restoring brings back the word and your progress on it, on all your devices.</div>
      ${deleted.length ? `<div class="section-label"><span class="t-caps" style="opacity:.75">Lessons</span></div><div class="list">${lessonRows}</div>` : ""}
      ${deletedWords.length ? `<div class="section-label" ${deleted.length ? 'style="margin-top:var(--s-6)"' : ""}><span class="t-caps" style="opacity:.75">Words</span></div><div class="list">${wordRows}</div>` : ""}
      ${empty ? `<div class="placeholder">${icon("restore")}<div class="t-title">Nothing here</div><div class="muted">Deleted lessons and words show up here for 7 days.</div></div>` : ""}
    </section>${tabbar("me")}`);
  }
  async function restoreFromList(id) { await store.restoreLesson(id, now()); await refreshContent(); renderRecentlyDeleted(); }
  async function restoreDeletedWord(cardId) {
    const deleted = await store.listDeletedCards(ctx.contentOwnerId);
    const c = deleted.find((x) => x.id === cardId); if (!c) return;
    await store.restoreCard(cardId, c.deletedFromLessonId, now());
    await refreshContent(); renderRecentlyDeleted();
  }

  // ---- merge + split (Phase 4c) -------------------------------------------
  let mergeState = null;
  function openMerge(id) {
    const target = lessons.find((x) => x.id === id); if (!target) return;
    const others = lessons.filter((l) => l.id !== id);
    if (!others.length) return;
    mergeState = { targetId: id, sourceId: others[0].id };
    renderMergeSheet();
  }
  function renderMergeSheet() {
    const target = lessons.find((x) => x.id === mergeState.targetId);
    const others = lessons.filter((l) => l.id !== mergeState.targetId);
    const src = lessons.find((x) => x.id === mergeState.sourceId);
    const total = target.cardIds.length + (src ? src.cardIds.length : 0);
    const opts = others.map((l) => `<button class="merge-opt ${l.id === mergeState.sourceId ? "is-sel" : ""}" data-act="merge-pick" data-id="${l.id}">
        <span class="merge-opt__radio"></span>
        <span class="merge-opt__main"><span class="row__title" style="-webkit-line-clamp:1">${esc(l.name)}</span><span class="row__meta">${l.cardIds.length} words</span></span></button>`).join("");
    sheet(`<div class="sheet__title">Merge with…</div>
      <div class="sheet__text">Pick the lesson to combine with “${esc(target.name)}”.</div>
      <div class="merge-list">${opts}</div>
      <div class="banner" style="margin-top:var(--s-3)"><span class="t-caps">You will get</span>
        <span>One lesson called “${esc(target.name)}” with ${total} words. Progress on every word is kept.</span></div>
      <button class="btn btn--primary" data-act="merge-confirm">Merge lessons</button>
      <button class="btn btn--secondary" data-act="close-sheet">Cancel</button>`);
  }
  function mergePick(id) { if (mergeState) { mergeState.sourceId = id; renderMergeSheet(); } }
  async function doMerge() {
    if (!mergeState || !mergeState.sourceId) return;
    const targetId = mergeState.targetId;
    await store.mergeLessons(targetId, mergeState.sourceId, now());
    await refreshContent(); mergeState = null; closeSheet(); renderLessonDetail(targetId);
  }

  // Contiguous category runs, in lesson order. @returns {{name,start,count}[]}
  function sectionRuns(ordered) {
    const runs = [];
    ordered.forEach((c, i) => {
      const name = c.category || "Words";
      if (!runs.length || runs[runs.length - 1].name !== name) runs.push({ name, start: i, count: 1 });
      else runs[runs.length - 1].count++;
    });
    return runs;
  }
  async function orderedCards(l) {
    const cards = await store.cardsByIds(l.cardIds, ctx.contentOwnerId);
    const byId = new Map(cards.map((c) => [c.id, c]));
    return l.cardIds.map((cid) => byId.get(cid)).filter(Boolean);
  }
  let splitState = null;
  async function renderSplit(id) {
    const l = lessons.find((x) => x.id === id); if (!l) return renderLessonDetail(id);
    const ordered = await orderedCards(l);
    const runs = sectionRuns(ordered);
    if (runs.length < 2) return renderLessonDetail(id);   // no boundary to tap
    if (!splitState || splitState.id !== id) splitState = { id, cutRun: 1 };
    if (splitState.cutRun < 1 || splitState.cutRun >= runs.length) splitState.cutRun = 1;
    const cut = runs[splitState.cutRun].start;
    const firstN = cut, secondN = ordered.length - cut;
    const rows = runs.map((r, idx) => {
      const divider = idx === splitState.cutRun ? `<div class="split-div">${icon("split", "icon--sm")} Second lesson starts here</div>` : "";
      const disabled = idx === 0 ? "disabled" : "";   // part 2 can't start at the very top
      return `${divider}<button class="row" data-act="split-at" data-i="${idx}" ${disabled}>
        <span class="row__main"><span class="row__title" style="-webkit-line-clamp:1">${esc(r.name)}</span>
          <span class="row__meta">${r.count} word${r.count === 1 ? "" : "s"}</span></span></button>`;
    }).join("");
    mount(`<section class="screen">
      <div class="study-head__row" style="margin-bottom:var(--s-5)">
        <button class="study-head__exit" data-act="open-lesson" data-id="${id}">${icon("back")}</button>
        <span class="study-head__lesson" style="font-size:var(--t-title);font-weight:800">Split lesson</span>
      </div>
      <div class="muted" style="margin-bottom:var(--s-5)">Tap a section to start the second lesson there.</div>
      <div class="list">${rows}</div>
      <div style="display:flex;gap:var(--s-4);margin-top:var(--s-6)">
        <div class="hero" style="flex:1;padding:var(--s-6);gap:4px"><div class="t-title">${firstN}</div><div class="t-label" style="opacity:.75">words in the first lesson</div></div>
        <div class="hero" style="flex:1;padding:var(--s-6);gap:4px"><div class="t-title">${secondN}</div><div class="t-label" style="opacity:.75">words in the second lesson</div></div>
      </div>
      <button class="btn btn--primary" data-act="split-confirm" data-id="${id}" style="margin-top:var(--s-7)">Split lesson</button>
      <button class="btn btn--secondary" data-act="open-lesson" data-id="${id}">Cancel</button>
    </section>`);
  }
  function splitAt(i) { if (splitState) { splitState.cutRun = Number(i); renderSplit(splitState.id); } }
  async function doSplit(id) {
    const l = lessons.find((x) => x.id === id); if (!l) return;
    const ordered = await orderedCards(l);
    const runs = sectionRuns(ordered);
    if (runs.length < 2) return renderLessonDetail(id);
    const run = runs[splitState.cutRun] || runs[1];
    const cut = run.start;
    const secondName = run.name && run.name !== "Words" ? run.name : l.name + " (2)";
    await store.splitLesson(id, cut, secondName, now());
    await refreshContent(); splitState = null; await renderLessons();
  }

  // ---- word editing (Phase 4d) --------------------------------------------
  let editWordState = null;
  function syncWordFields() {
    if (!editWordState) return;
    const sp = document.getElementById("ew-es"), en = document.getElementById("ew-en");
    if (sp) editWordState.front = sp.value;
    if (en) editWordState.back = en.value;
  }
  function lessonCategories(lessonId) {
    const l = lessons.find((x) => x.id === lessonId); if (!l) return [];
    const cats = [];
    for (const cid of l.cardIds) { const c = allCards.find((x) => x.id === cid); const k = c && c.category ? c.category : null; if (k && !cats.includes(k)) cats.push(k); }
    return cats;
  }
  function openEditWord(cardId, lessonId) {
    const c = allCards.find((x) => x.id === cardId); if (!c) return;
    editWordState = { mode: "edit", cardId, lessonId, front: c.front, back: c.back, accepts: (c.accepts || []).slice(), strictMode: c.strictMode || "follow", category: c.category || null };
    renderWordSheet();
  }
  function openAddWord(lessonId) {
    editWordState = { mode: "add", lessonId, front: "", back: "", accepts: [], strictMode: "follow", category: lessonCategories(lessonId)[0] || null };
    renderWordSheet();
  }
  function renderWordSheet() {
    const W = editWordState, isAdd = W.mode === "add";
    const l = lessons.find((x) => x.id === W.lessonId);
    const setLabel = exactSetting() ? "Exact" : "Forgiving";
    const chips = W.accepts.map((a, i) => `<button class="chip chip--rm" data-act="word-accept-rm" data-i="${i}">${esc(a)} ✕</button>`).join("");
    const seg = [["follow", "Follow my setting"], ["exact", "Exact"], ["forgiving", "Forgiving"]]
      .map(([m, lbl]) => `<button data-act="word-strict" data-val="${m}" aria-pressed="${W.strictMode === m}">${lbl}</button>`).join("");
    sheet(`<div class="sheet__title">${isAdd ? "Add a word" : "Edit word"}</div>
      ${isAdd ? `<div class="sheet__text">It goes into “${esc(l ? l.name : "")}”.</div>` : ""}
      <label class="field-label">SPANISH</label>
      <input id="ew-es" class="field" value="${esc(W.front)}" placeholder="Spanish">
      <label class="field-label">ENGLISH</label>
      <input id="ew-en" class="field" value="${esc(W.back)}" placeholder="${isAdd ? "Translation" : "English"}">
      ${isAdd ? `<button class="chip" data-act="word-suggest-en" style="margin-top:6px">${icon("idea-bulb", "icon--sm")} Suggest the English</button>` : `
      <label class="field-label">ALSO ACCEPT</label>
      <div class="chips">${chips}<span class="chip-add"><input id="ew-acc" class="chip-add__in" placeholder="add" aria-label="Also accept"><button data-act="word-accept-add">+ Add</button></span></div>
      <label class="field-label">SPELLING FOR THIS WORD</label>
      <div class="segmented seg3">${seg}</div>
      <div class="sheet__text">Your setting is ${setLabel}. Exact means articles, plurals and small typos must be right. Accents are always forgiven.</div>
      <button class="menu__item" data-act="word-section">${icon("lessons")}<span>Section: ${esc(W.category || "None")}</span></button>
      <button class="menu__item" data-act="word-move">${icon("merge")}<span>Move to another lesson</span></button>
      <button class="menu__item menu__item--danger" data-act="word-delete">${icon("trash")}<span>Delete word</span></button>`}
      <button class="btn btn--primary" data-act="word-save">${isAdd ? "Add word" : "Save"}</button>
      <button class="btn btn--secondary" data-act="close-sheet">Cancel</button>`);
    const f = document.getElementById("ew-es"); if (f && isAdd) f.focus();
  }
  function wordStrict(val) { syncWordFields(); editWordState.strictMode = val; renderWordSheet(); }
  function wordAcceptAdd() {
    syncWordFields();
    const inp = document.getElementById("ew-acc"); const v = inp ? inp.value.trim() : "";
    if (v && !editWordState.accepts.includes(v)) editWordState.accepts.push(v);
    renderWordSheet();
    const f = document.getElementById("ew-acc"); if (f) f.focus();
  }
  function wordAcceptRm(i) { syncWordFields(); editWordState.accepts.splice(Number(i), 1); renderWordSheet(); }
  async function wordSave() {
    syncWordFields(); const W = editWordState;
    const front = (W.front || "").trim(); const back = (W.back || "").trim();
    if (!front) { const f = document.getElementById("ew-es"); if (f) f.focus(); return; }
    if (W.mode === "add") {
      const l = lessons.find((x) => x.id === W.lessonId);
      const deckId = l ? l.deckId : (allCards[0] && allCards[0].deckId);
      await store.addCard({ ownerId: ctx.contentOwnerId, deckId, front, back, category: W.category, strictMode: W.strictMode }, W.lessonId, now());
    } else {
      await store.editCard(W.cardId, { front, back, accepts: W.accepts, category: W.category, strictMode: W.strictMode }, now());
    }
    const lid = W.lessonId; editWordState = null; await refreshContent(); closeSheet(); renderLessonDetail(lid);
  }
  function openSectionPicker() {
    syncWordFields();
    const cats = lessonCategories(editWordState.lessonId);
    const opts = ["None", ...cats].map((name) => {
      const val = name === "None" ? "" : name;
      const sel = (editWordState.category || "") === val;
      return `<button class="merge-opt ${sel ? "is-sel" : ""}" data-act="word-section-pick" data-val="${esc(val)}"><span class="merge-opt__radio"></span><span class="merge-opt__main"><span class="row__title">${esc(name)}</span></span></button>`;
    }).join("");
    sheet(`<div class="sheet__title">Section</div><div class="merge-list">${opts}</div>
      <button class="btn btn--secondary" data-act="word-back">Back</button>`);
  }
  function pickSection(val) { editWordState.category = val || null; renderWordSheet(); }
  function openWordMove() {
    syncWordFields();
    const others = lessons.filter((l) => l.id !== editWordState.lessonId);
    if (!others.length) return;
    const opts = others.map((l) => `<button class="merge-opt" data-act="word-move-pick" data-id="${l.id}"><span class="merge-opt__radio"></span><span class="merge-opt__main"><span class="row__title" style="-webkit-line-clamp:1">${esc(l.name)}</span><span class="row__meta">${l.cardIds.length} words</span></span></button>`).join("");
    sheet(`<div class="sheet__title">Move to another lesson</div>
      <div class="sheet__text">Its progress comes with it.</div>
      <div class="merge-list">${opts}</div><button class="btn btn--secondary" data-act="word-back">Back</button>`);
  }
  async function doWordMove(toLessonId) {
    const W = editWordState; if (!W || W.mode === "add") return;
    await store.moveCard(W.cardId, W.lessonId, toLessonId, now());
    const from = W.lessonId; editWordState = null; await refreshContent(); closeSheet(); renderLessonDetail(from);
  }
  async function doWordDelete() {
    const W = editWordState; if (!W || W.mode === "add") return;
    const c = allCards.find((x) => x.id === W.cardId); const name = c ? c.front : "Word";
    const cardId = W.cardId, lid = W.lessonId;
    await store.deleteCard(cardId, lid, now());
    editWordState = null; await refreshContent(); closeSheet(); await renderLessonDetail(lid);
    app.querySelectorAll(".toast").forEach((n) => n.remove());
    app.insertAdjacentHTML("beforeend",
      `<div class="toast"><span>${esc(name)} deleted</span><button class="link" data-act="word-undo" data-id="${cardId}" data-lid="${lid}">Undo</button></div>`);
    const tst = app.querySelector(".toast"); setTimeout(() => { if (tst && tst.isConnected) tst.remove(); }, 6000);
  }
  async function undoWordDelete(cardId, lid) {
    await store.restoreCard(cardId, lid, now()); await refreshContent();
    app.querySelectorAll(".toast").forEach((n) => n.remove()); renderLessonDetail(lid);
  }
  async function startTricky() { startWith(trickyCards(await loadData())); }

  // ---- Me / settings (Phase 5a) -------------------------------------------
  const getPref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  function pronOn() { return getPref("aliyah.pronunciation", "on") !== "off"; }
  function reduceMotion() {
    const m = getPref("aliyah.motion", "follow");
    if (m === "reduce") return true; if (m === "full") return false;
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function applyTheme() {
    const a = getPref("aliyah.appearance", "system"); const root = document.documentElement;
    if (a === "light" || a === "dark") root.setAttribute("data-theme", a); else root.removeAttribute("data-theme");
  }
  const PICKERS = {
    direction: { key: "aliyah.direction", dflt: "mixed", title: "How words are shown",
      opts: [["mixed", "Mixed", "Random each card"], ["es-en", "Spanish → English", "See Spanish, type English"], ["en-es", "English → Spanish", "See English, type Spanish"]] },
    mode: { key: "aliyah.mode", dflt: "mixed", title: "How you answer",
      opts: [["mixed", "Mixed", "Random each card"], ["type", "Type it", ""], ["choice", "Pick the match", ""], ["speak", "Say it", "Needs a microphone"]] },
    session: { key: "aliyah.sessionSize", dflt: "20", title: "How much to study in one sitting",
      opts: [["full", "Full lesson", ""], ["10", "10 words", "Quick"], ["20", "20 words", "Usual"], ["30", "30 words", "Longer"]] },
    appearance: { key: "aliyah.appearance", dflt: "system", title: "Appearance", help: "Light and dark follow your iPhone unless you choose.",
      opts: [["system", "Follows iPhone", "Recommended"], ["light", "Light", ""], ["dark", "Dark", ""]] },
    motion: { key: "aliyah.motion", dflt: "follow", title: "Reduce motion",
      opts: [["follow", "Follows iPhone", ""], ["reduce", "Reduced", "Less animation"], ["full", "Full", ""]] },
  };
  const pickerLabel = (kind) => { const p = PICKERS[kind]; const v = getPref(p.key, p.dflt); const o = p.opts.find((x) => x[0] === v); return o ? o[1] : p.opts[0][1]; };
  function settingRow(title, meta, act, extra) {
    return `<button class="row" data-act="${act}"${extra || ""}><span class="row__main"><span class="row__title">${esc(title)}</span>${meta ? `<span class="row__meta">${esc(meta)}</span>` : ""}</span>${icon("chevron", "icon--sm")}</button>`;
  }
  function toggleRow(title, meta, on, act) {
    return `<button class="row" data-act="${act}" aria-pressed="${on}"><span class="row__main"><span class="row__title">${esc(title)}</span>${meta ? `<span class="row__meta">${esc(meta)}</span>` : ""}</span>
      <span class="toggle" style="pointer-events:none"><input type="checkbox" ${on ? "checked" : ""} tabindex="-1" aria-hidden="true"><span class="track"></span><span class="knob"></span></span></button>`;
  }
  function renderMe() {
    const name = esc(user.displayName || "Me");
    mount(`<section class="screen screen--tabbed">
      <h1 class="t-h1" style="margin-bottom:var(--s-6)">Me</h1>
      <div class="hero" style="flex-direction:row;align-items:center;gap:var(--s-6)">
        <span class="avatar">${name.slice(0, 1)}</span>
        <span><div class="t-title">${name}</div><div class="t-label" style="opacity:.75">Signed in with Google</div></span>
      </div>
      <div class="section-label"><span class="t-caps" style="opacity:.75">Study</span></div>
      <div class="list">
        ${settingRow("Direction", pickerLabel("direction"), "pick-open", ' data-kind="direction"')}
        ${settingRow("Answer style", pickerLabel("mode"), "pick-open", ' data-kind="mode"')}
        ${settingRow("Session length", pickerLabel("session"), "pick-open", ' data-kind="session"')}
        ${toggleRow("Exact answers", "Articles, plurals and small typos must be right", exactSetting(), "toggle-exact")}
        ${toggleRow("Pronunciation tips", "After Say-it answers", pronOn(), "toggle-pron")}
      </div>
      <div class="section-label"><span class="t-caps" style="opacity:.75">Look and feel</span></div>
      <div class="list">
        ${settingRow("Appearance", pickerLabel("appearance"), "pick-open", ' data-kind="appearance"')}
        ${settingRow("Reduce motion", pickerLabel("motion"), "pick-open", ' data-kind="motion"')}
      </div>
      <div class="section-label"><span class="t-caps" style="opacity:.75">Your data</span></div>
      <div class="list">
        ${settingRow("Sync", "All changes saved", "your-data")}
        ${settingRow("Export my data", "Save everything to a file", "export-data")}
        ${settingRow("Recently deleted", "Restore lessons and words within 7 days", "recently-deleted")}
      </div>
      ${user.role === "admin" ? `<div class="section-label"><span class="t-caps" style="opacity:.75">People</span></div>
      <div class="list">${settingRow("People with access", "Invite, roles, study as", "people")}</div>` : ""}
      <div class="section-label"><span class="t-caps" style="opacity:.75">Account</span></div>
      <div class="list">
        <button class="row" data-act="sign-out"><span class="row__main"><span class="row__title">Sign out</span></span>${icon("chevron", "icon--sm")}</button>
        <button class="row" data-act="delete-account"><span class="row__main"><span class="row__title" style="color:var(--destructive)">Delete account</span></span>${icon("chevron", "icon--sm")}</button>
      </div>
      <div class="muted" style="margin-top:var(--s-6)">People &amp; invites come with real sign-in (Phase 5).</div>
    </section>${tabbar("me")}`);
  }
  function toggleExact() { setPref("aliyah.exact", exactSetting() ? "off" : "on"); renderMe(); }
  function togglePron() { setPref("aliyah.pronunciation", pronOn() ? "off" : "on"); renderMe(); }
  function openPicker(kind) {
    const p = PICKERS[kind]; if (!p) return; const cur = getPref(p.key, p.dflt);
    const opts = p.opts.map(([val, label, meta]) => `<button class="merge-opt ${val === cur ? "is-sel" : ""}" data-act="pick-set" data-kind="${kind}" data-val="${val}">
      <span class="merge-opt__radio"></span><span class="merge-opt__main"><span class="row__title">${esc(label)}</span>${meta ? `<span class="row__meta">${esc(meta)}</span>` : ""}</span></button>`).join("");
    sheet(`<div class="sheet__title">${esc(p.title)}</div>${p.help ? `<div class="sheet__text">${esc(p.help)}</div>` : ""}
      <div class="merge-list">${opts}</div><button class="btn btn--secondary" data-act="close-sheet">Close</button>`);
  }
  function pickSet(kind, val) {
    const p = PICKERS[kind]; if (!p) return; setPref(p.key, val);
    if (kind === "appearance") applyTheme();
    closeSheet(); renderMe();
  }
  function renderYourData() {
    mount(`<section class="screen screen--tabbed">
      <div class="study-head__row" style="margin-bottom:var(--s-7)">
        <button class="study-head__exit" data-act="tab" data-tab="me">${icon("back")}</button>
        <span class="study-head__lesson" style="font-size:var(--t-title);font-weight:800">Your data</span>
      </div>
      <div class="section-label"><span class="t-caps" style="opacity:.75">Sync</span></div>
      <div class="banner"><span>All changes saved</span><span class="t-label" style="color:var(--sheet-muted)">On this device. Sign in to sync across devices (Phase 5).</span></div>
      <div class="section-label" style="margin-top:var(--s-7)"><span class="t-caps" style="opacity:.75">Export my data</span></div>
      <div class="muted" style="margin-bottom:var(--s-5)">Download everything you have in the app — lessons, words and progress — as one file. The file is made on your phone. Nothing is sent to anyone.</div>
      <button class="btn btn--primary" data-act="export-data">Export</button>
    </section>${tabbar("me")}`);
  }
  async function doExport() {
    const env = await io.exportUser(store, DEMO_ID, now());
    const blob = new Blob([JSON.stringify(env, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `aliyahs-flashcards-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- Delete account (Phase 5b, board 31/33) -----------------------------
  //  Demo models deletion as a 4-week pending flag + restore (the designed window).
  //  Real tombstone + cross-device purge hooks account.deleteAccount at Phase 5c.
  function deletePendingDate() { try { return localStorage.getItem("aliyah.deletePending"); } catch { return null; } }
  async function openDeleteAccount() {
    // Sole-admin guard: the last admin can't delete their account (would leave the
    // app with no admin). Ask them to hand off admin first.
    if (user.role === "admin" && (await store.listAdmins()).length <= 1) {
      sheet(`<div class="sheet__title">You’re the only admin</div>
        <div class="sheet__text">Make someone else an admin first (People with access → ⋯ → Make an admin), so the app still has an admin after you go.</div>
        <button class="btn btn--secondary" data-act="close-sheet">OK</button>`);
      return;
    }
    if (deletePendingDate()) renderDeletePending(); else renderDeleteAccount();
  }
  function renderDeleteAccount() {
    mount(`<section class="screen screen--tabbed">
      <div class="study-head__row" style="margin-bottom:var(--s-6)">
        <button class="study-head__exit" data-act="tab" data-tab="me">${icon("back")}</button>
        <span class="study-head__lesson" style="font-size:var(--t-title);font-weight:800">Delete account</span>
      </div>
      <div class="muted" style="margin-bottom:var(--s-5)">This removes your lessons, words and progress from every device. It happens after a 4-week window, so you can change your mind. Export a copy first if you want to keep one.</div>
      <button class="btn btn--secondary" data-act="export-data" style="margin-bottom:var(--s-7)">Export my data first</button>
      <label class="field-label">Type delete to confirm</label>
      <input id="del-field" class="field" placeholder="delete" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Type delete to confirm">
      <button class="btn btn--destructive" data-act="delete-confirm" disabled style="margin-top:var(--s-6)">Delete my account</button>
      <button class="btn btn--secondary" data-act="tab" data-tab="me">Keep my account</button>
    </section>${tabbar("me")}`);
    const f = document.getElementById("del-field");
    if (f) f.addEventListener("input", () => { const b = app.querySelector('[data-act="delete-confirm"]'); if (b) b.disabled = f.value.trim().toLowerCase() !== "delete"; });
  }
  function doDeleteAccount() {
    const f = document.getElementById("del-field");
    if (!f || f.value.trim().toLowerCase() !== "delete") return;
    try { localStorage.setItem("aliyah.deletePending", new Date(now() + 28 * 86400000).toISOString()); } catch {}
    renderDeletePending();
  }
  function renderDeletePending() {
    const when = deletePendingDate();
    const d = when ? new Date(when).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "";
    mount(`<section class="screen screen--tabbed">
      <div class="placeholder" style="margin-top:var(--s-11)">${icon("restore")}
        <div class="t-title">Your account is set to be deleted</div>
        <div class="muted">It will be gone for good on ${esc(d)}. Restore it now to keep everything.</div>
        <button class="btn btn--primary" data-act="account-restore" style="max-width:280px">Restore my account</button>
        <button class="btn btn--secondary" data-act="tab" data-tab="me" style="max-width:280px">Let it go</button>
      </div>
    </section>${tabbar("me")}`);
  }
  function restoreAccount() { try { localStorage.removeItem("aliyah.deletePending"); } catch {} renderMe(); }

  // ---- Install guide (Phase 5b, board 16 E3) — Safari, one time -----------
  let installChecked = false;
  function isStandalone() { return navigator.standalone === true || matchMedia("(display-mode: standalone)").matches; }
  function maybeShowInstallGuide() {
    try { if (isStandalone() || localStorage.getItem("aliyah.installSeen") === "1") return; } catch { return; }
    openInstallGuide();
  }
  function openInstallGuide() {
    app.querySelectorAll(".scrim, .sheet").forEach((n) => n.remove());
    app.insertAdjacentHTML("beforeend", `<div class="scrim" data-act="install-dismiss"></div>
      <div class="sheet">
        <div class="sheet__handle"></div>
        <div class="t-caps" style="opacity:.6;margin-bottom:4px">Step 1 of 1 · One time</div>
        <div class="sheet__title">Add it to your Home Screen</div>
        <div class="sheet__text">Then it opens like a real app, even without the internet.</div>
        <div class="install-steps">
          <div class="install-step"><span class="install-num">1</span><span>Tap Share</span>${icon("share", "icon--sm")}</div>
          <div class="install-step"><span class="install-num">2</span><span>Choose Add to Home Screen</span></div>
          <div class="install-step"><span class="install-num">3</span><span>Tap Add</span></div>
        </div>
        <button class="btn btn--secondary" data-act="install-dismiss">Maybe later</button>
      </div>`);
  }
  function dismissInstall() { try { localStorage.setItem("aliyah.installSeen", "1"); } catch {} app.querySelectorAll(".scrim, .sheet").forEach((n) => n.remove()); }

  // ---- People with access + emulation (Phase 5d) --------------------------
  //  Admin-only. Invite writes a local user record here; the real DB allowlist
  //  write goes through auth RPCs once the backend is live. Emulation uses the
  //  engine's non-persisting preview (or a separate admin@as track if opted in).
  async function renderPeople() {
    const users = await store.listUsers();
    const learners = users.filter((u) => u.role !== "admin");
    const admins = users.filter((u) => u.role === "admin");
    const row = (u, isLearner) => `<div class="row" style="cursor:default">
      <span class="avatar" style="width:40px;height:40px;font-size:17px">${esc((u.displayName || u.email || "?").slice(0, 1).toUpperCase())}</span>
      <span class="row__main" style="margin-left:var(--s-4)"><span class="row__title" style="-webkit-line-clamp:1">${esc(u.displayName || u.email)}${u.id === user.id ? " (you)" : ""}</span><span class="row__meta">${u.role === "admin" ? "Admin" : "Learner"}</span></span>
      ${isLearner && u.id !== user.id ? `<button class="chip" style="background:#fff;color:var(--btn-text)" data-act="study-as" data-id="${u.id}">Study as</button>` : ""}
      <button class="toolbtn toolbtn--icon" data-act="person-menu" data-id="${u.id}" aria-label="Options for ${esc(u.displayName || u.email)}">${icon("more")}</button></div>`;
    mount(`<section class="screen screen--tabbed">
      <div class="study-head__row" style="margin-bottom:var(--s-6)">
        <button class="study-head__exit" data-act="tab" data-tab="me">${icon("back")}</button>
        <span class="study-head__lesson" style="font-size:var(--t-title);font-weight:800">People with access</span>
      </div>
      ${learners.length ? `<div class="section-label"><span class="t-caps" style="opacity:.75">Learners</span></div><div class="list">${learners.map((u) => row(u, true)).join("")}</div>` : ""}
      ${admins.length ? `<div class="section-label"><span class="t-caps" style="opacity:.75">Admins</span></div><div class="list">${admins.map((u) => row(u, false)).join("")}</div>` : ""}
      <button class="btn btn--primary" data-act="invite-open" style="margin-top:var(--s-7)">Invite someone</button>
      <div class="muted" style="margin-top:var(--s-5)">Friends are fully separate users — their lessons and progress stay private.</div>
      ${roleplayOn() ? `<div class="section-label" style="margin-top:var(--s-7)"><span class="t-caps" style="opacity:.75">Safety</span></div>
      <div class="list"><button class="row" data-act="rp-log"><span class="row__main"><span class="row__title">Pretend-chat transcripts</span><span class="row__meta">Review every practice conversation</span></span>${icon("chevron", "icon--sm")}</button></div>` : ""}
    </section>${tabbar("me")}`);
  }
  let inviteRole = "user";
  function openInvite() { inviteRole = "user"; renderInviteSheet(); }
  function renderInviteSheet() {
    sheet(`<div class="sheet__title">Invite someone</div>
      <div class="sheet__text">They sign in with the Google account you enter. Only invited accounts can get in.</div>
      <label class="field-label">Google email</label>
      <input id="invite-email" class="field" placeholder="name@gmail.com" autocapitalize="off" autocorrect="off" spellcheck="false">
      <label class="field-label">Role</label>
      <div class="segmented seg3" style="width:100%">
        <button data-act="invite-role" data-val="user" aria-pressed="${inviteRole === "user"}">Learner</button>
        <button data-act="invite-role" data-val="admin" aria-pressed="${inviteRole === "admin"}">Admin</button>
      </div>
      <button class="btn btn--primary" data-act="invite-send">Send invite</button>
      <button class="btn btn--secondary" data-act="close-sheet">Cancel</button>`);
  }
  function inviteRoleSet(v) { const em = document.getElementById("invite-email"); const val = em ? em.value : ""; inviteRole = v; renderInviteSheet(); const e2 = document.getElementById("invite-email"); if (e2) e2.value = val; }
  async function doInvite() {
    const em = document.getElementById("invite-email"); const email = (em ? em.value : "").trim();
    if (!email) { if (em) em.focus(); return; }
    const u = model.createUser({ email, displayName: email.split("@")[0], role: inviteRole }, now());
    await store.putUser(u);
    closeSheet(); renderPeople();
  }
  async function studyAs(targetId) {
    const target = await store.getUser(targetId); if (!target) return;
    emu = { targetId, name: target.displayName || target.email || "Learner", countOwn: false };
    ctx = store.studyContext(user, { actingAsUserId: targetId, countEmulatedProgress: false });
    await refreshContent(); renderHome();
  }
  // Role management (R6): promote/demote, with the sole-admin guard (store-enforced).
  async function openPersonMenu(id) {
    const u = await store.getUser(id); if (!u) return;
    closeSheet();
    const isAdmin = u.role === "admin";
    const sole = isAdmin && (await store.listAdmins()).length <= 1;
    const name = esc(u.displayName || u.email || "This person");
    const studyAsItem = !isAdmin && id !== user.id
      ? `<button class="menu__item" data-act="study-as" data-id="${id}">${icon("eye")}<span>Study as ${name}</span></button>` : "";
    const roleItem = isAdmin
      ? `<button class="menu__item ${sole ? "" : "menu__item--danger"}" data-act="person-demote" data-id="${id}" ${sole ? "disabled" : ""}>${icon("me")}<span>Make a learner${sole ? " — only admin" : ""}</span></button>`
      : `<button class="menu__item" data-act="person-promote" data-id="${id}">${icon("star")}<span>Make an admin</span></button>`;
    sheet(`<div class="sheet__title">${name}${id === user.id ? " (you)" : ""}</div>
      <div class="sheet__text">${esc(u.email || "")} · ${isAdmin ? "Admin" : "Learner"}</div>
      <div class="menu">${studyAsItem}${roleItem}</div>
      <button class="btn btn--secondary" data-act="close-sheet">Close</button>`);
  }
  async function setRole(id, role) {
    try {
      const u = await store.setUserRole(id, role, now());
      if (id === user.id) { user.role = u.role; }
      scheduleSync();
    } catch (e) {
      closeSheet();
      const only = /only admin/.test(String((e && e.message) || ""));
      sheet(`<div class="sheet__title">Can't do that</div>
        <div class="sheet__text">${only ? "This is the only admin — make someone else an admin first." : "Couldn’t update this person’s role. Try again."}</div>
        <button class="btn btn--secondary" data-act="close-sheet">OK</button>`);
      return;
    }
    closeSheet();
    // Demoting yourself removes admin access → drop back to the Me screen.
    if (id === user.id && role !== "admin") renderMe(); else renderPeople();
  }
  async function exitEmulation() {
    emu = null; ctx = store.studyContext(user); await refreshContent(); renderMe();
  }
  function openEmuOptions() {
    if (!emu) return;
    sheet(`<div class="sheet__title">Viewing as ${esc(emu.name)}</div>
      <div class="sheet__text">You are looking at ${esc(emu.name)}'s account. Nothing you do here changes ${esc(emu.name)}'s progress.</div>
      <button class="row" data-act="emu-count" aria-pressed="${emu.countOwn}" style="background:var(--sheet-field);color:var(--sheet-ink)">
        <span class="row__main"><span class="row__title">Count my own practice</span><span class="row__meta" style="color:var(--sheet-muted)">Saved to a separate track for you, never to ${esc(emu.name)}</span></span>
        <span class="toggle" style="pointer-events:none"><input type="checkbox" ${emu.countOwn ? "checked" : ""} tabindex="-1" aria-hidden="true"><span class="track"></span><span class="knob"></span></span></button>
      <button class="btn btn--primary" data-act="close-sheet">Keep viewing</button>
      <button class="btn btn--secondary" data-act="emu-exit">Stop viewing as ${esc(emu.name)}</button>`);
  }
  async function toggleCountOwn() {
    if (!emu) return; emu.countOwn = !emu.countOwn;
    ctx = store.studyContext(user, { actingAsUserId: emu.targetId, countEmulatedProgress: emu.countOwn });
    openEmuOptions();
  }


  // ---- Phase 6: AI capture (photo -> OCR -> review -> lesson) --------------
  //  6a: C1 add-pages + C2 reading, against a MOCK proposer. The real
  //  importFromPhoto (Claude vision via a Netlify Function) swaps in at 6e;
  //  segmentation review (C3) + word HITL (C4/H3) + import commit land in 6b/6c.
  let capture = null;                 // { pages: [{id, dataUrl}], proposal }
  let _capInputs = null;
  // Persist an in-progress scan (R5) so a reload/force-quit can resume it. LOCAL-ONLY
  // (the `captureDrafts` IndexedDB store is never synced — a half-scan shouldn't leave
  // the device). Keyed by the signed-in account; fire-and-forget so it never blocks UI.
  const captureKey = () => (user && user.id) || DEMO_ID;
  function persistCapture() {
    const key = captureKey();
    try {
      if (capture && capture.pages && capture.pages.length) store.adapter.put("captureDrafts", { id: key, capture, updatedAt: now() });
      else store.adapter.remove("captureDrafts", key);
    } catch {}
  }
  function clearCapture() { capture = null; persistCapture(); }
  async function restoreCaptureDraft() {
    try {
      const rec = await store.adapter.get("captureDrafts", captureKey());
      if (rec && rec.capture && rec.capture.pages && rec.capture.pages.length) {
        if (!rec.updatedAt || now() - rec.updatedAt < 86400000) capture = rec.capture;   // resume drafts < 24h old
        else await store.adapter.remove("captureDrafts", captureKey());
      }
    } catch {}
  }
  function capInputs() {
    if (_capInputs) return _capInputs;
    const make = (useCamera) => {
      const el = document.createElement("input");
      el.type = "file"; el.accept = "image/*"; el.multiple = !useCamera;
      if (useCamera) el.setAttribute("capture", "environment");
      el.style.display = "none";
      el.addEventListener("change", async () => { await capAddFiles(el.files); el.value = ""; });
      document.body.appendChild(el);
      return el;
    };
    _capInputs = { lib: make(false), cam: make(true) };
    return _capInputs;
  }
  function readFileDataUrl(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  }
  // Downscale on add: shrinks OCR input tokens/cost and keeps requests under Netlify's
  // payload limit. Photos live only in memory for the import — never stored.
  function downscaleImage(file, maxDim, quality) {
    maxDim = maxDim || 1600; quality = quality || 0.85;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image load failed")); };
      img.src = url;
    });
  }
  async function capAddFiles(fileList) {
    if (!capture) capture = { pages: [], proposal: null };
    for (const f of Array.from(fileList || [])) {
      if (!/^image\//.test(f.type || "")) continue;
      let dataUrl = null;
      try { dataUrl = await downscaleImage(f); } catch { try { dataUrl = await readFileDataUrl(f); } catch {} }
      if (dataUrl) capture.pages.push({ id: "pg" + Date.now() + Math.random().toString(36).slice(2, 6), dataUrl });
    }
    renderCapture();
  }
  function startCapture() { capture = { pages: [], proposal: null }; renderCapture(); }

  function renderCapture() {
    if (!capture) capture = { pages: [], proposal: null };
    persistCapture();                 // pages added/removed → save the draft
    const pages = capture.pages;
    const thumb = (p, i) => `<div style="position:relative;aspect-ratio:3/4;border-radius:var(--s-3);overflow:hidden;background:rgba(128,128,128,.18)">
      ${p.dataUrl ? `<img src="${p.dataUrl}" alt="Page ${i + 1}" style="width:100%;height:100%;object-fit:cover">` : ""}
      <span style="position:absolute;left:6px;top:6px;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:rgba(0,0,0,.6);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</span>
      <button data-act="cap-remove" data-id="${p.id}" aria-label="Remove page ${i + 1}" style="position:absolute;right:6px;top:6px;width:24px;height:24px;border:0;border-radius:12px;background:rgba(0,0,0,.6);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon("close", "icon--sm")}</button>
    </div>`;
    const addTile = `<button data-act="cap-add-lib" aria-label="Add a page" style="aspect-ratio:3/4;border-radius:var(--s-3);border:2px dashed rgba(128,128,128,.5);background:transparent;color:inherit;display:flex;align-items:center;justify-content:center;cursor:pointer">${icon("add", "icon--lg")}</button>`;
    mount(`<section class="screen screen--tabbed">
      <div class="t-caps" style="opacity:.6;margin-bottom:var(--s-2)">Step 1 of 4 · Add pages</div>
      <h1 class="t-h1">Add homework</h1>
      <p class="muted" style="margin-top:var(--s-2)">Take a photo of each page. You can add as many as you need.</p>
      ${pages.length
        ? `<div class="section-label"><span class="t-caps" style="opacity:.75">${pages.length} page${pages.length > 1 ? "s" : ""}</span></div>
           <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--s-3);margin-top:var(--s-4)">${pages.map(thumb).join("")}${addTile}</div>
           <p class="muted" style="font-size:var(--t-label);margin-top:var(--s-3)">Tap a page’s × to remove it.</p>`
        : `<div class="placeholder" style="margin-top:var(--s-6)">${icon("camera")}<div class="t-title">No pages yet</div><div class="muted">Add your first homework page to begin.</div></div>`}
      <div style="display:flex;flex-direction:column;gap:var(--s-3);margin-top:var(--s-6)">
        <button class="row" data-act="cap-add-cam"><span class="row__main"><span class="row__title">${icon("camera", "icon--sm")} Take a photo</span></span>${icon("chevron", "icon--sm")}</button>
        <button class="row" data-act="cap-add-lib"><span class="row__main"><span class="row__title">Choose from library</span></span>${icon("chevron", "icon--sm")}</button>
        <button class="btn btn--primary" data-act="cap-read" ${pages.length ? "" : 'disabled style="opacity:.5;pointer-events:none"'}>${pages.length ? `Read ${pages.length} page${pages.length > 1 ? "s" : ""}` : "Read pages"}</button>
      </div>
    </section>${tabbar("add")}`);
  }

  const CAP_STEPS = ["Pages sent", "Reading your pages", "Finding your lessons", "Translating words"];
  function renderReading() {
    const n = capture ? capture.pages.length : 0;
    const paint = (done) => {
      const rows = CAP_STEPS.map((s, i) => {
        const state = i < done ? "done" : i === done ? "active" : "todo";
        const mark = state === "done" ? icon("check", "icon--sm")
          : state === "active" ? `<span style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite"></span>`
          : `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgba(128,128,128,.4)"></span>`;
        return `<div style="display:flex;align-items:center;gap:var(--s-3);padding:var(--s-3) 0;opacity:${state === "todo" ? ".5" : "1"}">${mark}<span>${s}${state === "active" && i === 1 && n ? ` (1 of ${n})` : ""}</span></div>`;
      }).join("");
      mount(`<section class="screen screen--tabbed">
        <div class="t-caps" style="opacity:.6;margin-bottom:var(--s-2)">Step 2 of 4 · Reading</div>
        <h1 class="t-h1">Reading your pages</h1>
        <div style="margin-top:var(--s-5)">${rows}</div>
        <p class="muted" style="margin-top:var(--s-4)">Big batches take a little longer. You can leave this open.</p>
        <button class="btn" data-act="cap-cancel" style="margin-top:var(--s-5);background:transparent;border:1px solid rgba(128,128,128,.4)">Cancel</button>
      </section>`);
    };
    if (typeof navigator !== "undefined" && navigator.onLine === false) return renderCapOffline();
    const importFn = captureProposer();
    if (!importFn) return renderCapPending();
    paint(0);
    let step = 0;
    const tick = setInterval(() => { step = Math.min(step + 1, CAP_STEPS.length - 1); paint(step); }, 500);
    importFn()
      .then((proposal) => {
        clearInterval(tick);
        if (proposal && proposal.unreadablePages && proposal.unreadablePages.length) { capture.proposal = proposal; return renderCapUnreadable(proposal.unreadablePages); }
        const total = ((proposal && proposal.lessons) || []).reduce((a, l) => a + l.sections.reduce((b, s) => b + s.words.length, 0), 0);
        if (!proposal || !proposal.lessons || !proposal.lessons.length || total === 0) return renderCapNoWords();
        capture.proposal = proposal; paint(CAP_STEPS.length); setTimeout(renderCaptureFound, 400);
      })
      .catch(() => { clearInterval(tick); renderCaptureProblem(); });
  }

  // C3 — segmentation review: rename / split / merge the proposed lessons.
  //  Operates on the in-memory proposal; nothing is saved until the word review
  //  (C4, 6c) commits via io.importLesson. "Review the words" bridges to 6c.
  const propWords = (l) => l.sections.reduce((b, s) => b + s.words.length, 0);
  function propPagesLabel(l) {
    const p = l.pages || []; if (!p.length) return "";
    const lo = Math.min(...p), hi = Math.max(...p);
    return lo === hi ? `Page ${lo}` : `Pages ${lo}–${hi}`;
  }
  function renderCaptureFound() {
    persistCapture();                 // proposal settled → save the draft
    const lessons = (capture.proposal && capture.proposal.lessons) || [];
    const card = (l, i) => {
      const w = propWords(l);
      const chips = l.sections.slice(0, 3).map((s) => `<span class="chip" style="pointer-events:none">${esc(s.cat)} · ${s.words.length}</span>`).join("")
        + (l.sections.length > 3 ? `<span class="chip" style="pointer-events:none">+${l.sections.length - 3} more</span>` : "");
      return `<div style="background:rgba(128,128,128,.12);border-radius:var(--s-4);padding:var(--s-5);margin-bottom:var(--s-3)">
        <div style="display:flex;align-items:center;gap:var(--s-3)">
          <span class="t-title" style="flex:1;-webkit-line-clamp:2">${esc(l.name)}</span>
          <button data-act="seg-rename" data-i="${i}" aria-label="Rename lesson" style="border:0;background:transparent;color:inherit;cursor:pointer;opacity:.7">${icon("edit", "icon--sm")}</button>
        </div>
        <div class="muted" style="font-size:var(--t-label);margin-top:4px">${propPagesLabel(l)} · ${w} word${w === 1 ? "" : "s"}</div>
        <div class="chips" style="margin-top:var(--s-3)">${chips}</div>
        ${l.sections.length >= 2 ? `<button class="link" data-act="seg-split" data-i="${i}" style="margin-top:var(--s-3)">${icon("split", "icon--sm")} Split this lesson</button>` : ""}
      </div>`;
    };
    const body = lessons.map((l, i) => {
      const merge = i < lessons.length - 1
        ? `<button class="row" data-act="seg-merge" data-i="${i}" style="justify-content:center;margin-bottom:var(--s-3)"><span class="row__title">${icon("merge", "icon--sm")} Merge into one lesson</span></button>`
        : "";
      return card(l, i) + merge;
    }).join("");
    mount(`<section class="screen screen--tabbed">
      <div class="t-caps" style="opacity:.6;margin-bottom:var(--s-2)">Step 3 of 4 · Check the lessons</div>
      <h1 class="t-h1">We found ${lessons.length} lesson${lessons.length === 1 ? "" : "s"}</h1>
      <p class="muted" style="margin-top:var(--s-2)">Does this match your homework? Rename, split, or merge. Nothing is saved yet.</p>
      <div style="margin-top:var(--s-5)">${body}</div>
      <button class="btn btn--primary" data-act="seg-review" style="margin-top:var(--s-4)">Review the words</button>
      <button class="btn btn--secondary" data-act="cap-cancel">Cancel</button>
    </section>${tabbar("add")}`);
  }

  function openSegRename(i) {
    const l = capture.proposal.lessons[i]; if (!l) return; const max = 80;
    sheet(`<div class="sheet__title">Rename lesson</div>
      <input id="seg-rename-field" class="field" maxlength="${max}" value="${esc(l.name)}" aria-label="Lesson name">
      <button class="btn btn--primary" data-act="seg-rename-save" data-i="${i}">Save</button>
      <button class="btn btn--secondary" data-act="close-sheet">Cancel</button>`);
    const f = document.getElementById("seg-rename-field");
    if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
  }
  function doSegRename(i) {
    const f = document.getElementById("seg-rename-field"); const name = (f ? f.value : "").trim();
    if (!name) { if (f) f.focus(); return; }
    if (capture.proposal.lessons[i]) capture.proposal.lessons[i].name = name;
    closeSheet(); renderCaptureFound();
  }
  function segMerge(i) {
    const ls = capture.proposal.lessons; const a = ls[i], b = ls[i + 1]; if (!a || !b) return;
    const map = new Map();
    for (const s of a.sections.concat(b.sections)) {
      if (!map.has(s.cat)) map.set(s.cat, { cat: s.cat, words: [] });
      map.get(s.cat).words.push(...s.words);
    }
    a.sections = [...map.values()];
    a.pages = [...new Set([...(a.pages || []), ...(b.pages || [])])].sort((x, y) => x - y);
    ls.splice(i + 1, 1);
  }

  let segSplitState = null;
  function renderSegSplit(i) {
    const l = capture.proposal.lessons[i]; if (!l || l.sections.length < 2) return renderCaptureFound();
    if (!segSplitState || segSplitState.i !== i) segSplitState = { i, cut: 1 };
    if (segSplitState.cut < 1 || segSplitState.cut >= l.sections.length) segSplitState.cut = 1;
    const firstN = l.sections.slice(0, segSplitState.cut).reduce((a, s) => a + s.words.length, 0);
    const secondN = propWords(l) - firstN;
    const rows = l.sections.map((s, idx) => {
      const divider = idx === segSplitState.cut ? `<div class="split-div">${icon("split", "icon--sm")} Second lesson starts here</div>` : "";
      return `${divider}<button class="row" data-act="seg-split-at" data-i="${idx}" ${idx === 0 ? "disabled" : ""}>
        <span class="row__main"><span class="row__title">${esc(s.cat)}</span><span class="row__meta">${s.words.length} word${s.words.length === 1 ? "" : "s"}</span></span></button>`;
    }).join("");
    mount(`<section class="screen">
      <div class="study-head__row" style="margin-bottom:var(--s-5)">
        <button class="study-head__exit" data-act="seg-back">${icon("back")}</button>
        <span class="study-head__lesson" style="font-size:var(--t-title);font-weight:800">Split lesson</span></div>
      <div class="muted" style="margin-bottom:var(--s-5)">Tap a section to start the second lesson there.</div>
      <div class="list">${rows}</div>
      <div style="display:flex;gap:var(--s-4);margin-top:var(--s-6)">
        <div class="hero" style="flex:1;padding:var(--s-6);gap:4px"><div class="t-title">${firstN}</div><div class="t-label" style="opacity:.75">first lesson</div></div>
        <div class="hero" style="flex:1;padding:var(--s-6);gap:4px"><div class="t-title">${secondN}</div><div class="t-label" style="opacity:.75">second lesson</div></div></div>
      <button class="btn btn--primary" data-act="seg-split-confirm" style="margin-top:var(--s-7)">Split into two</button>
      <button class="btn btn--secondary" data-act="seg-back">Cancel</button>
    </section>`);
  }
  function segSplitAt(idx) { if (segSplitState) { segSplitState.cut = Number(idx); renderSegSplit(segSplitState.i); } }
  function doSegSplit() {
    if (!segSplitState) return renderCaptureFound();
    const { i, cut } = segSplitState; const ls = capture.proposal.lessons; const l = ls[i]; if (!l) return renderCaptureFound();
    const moved = l.sections.splice(cut);
    const secondName = (moved[0] && moved[0].cat) ? moved[0].cat : l.name + " (2)";
    ls.splice(i + 1, 0, { name: secondName, pages: (l.pages || []).slice(), sections: moved });
    segSplitState = null; renderCaptureFound();
  }

  // C4 — word-level HITL review + H3 "Fix this word", one lesson at a time, then
  //  commit the kept words via io.importLesson (the tested commit) so they become
  //  real `ocr`-sourced lessons under the active account and sync like anything else.
  function startWordReview() {
    for (const l of capture.proposal.lessons)
      for (const s of l.sections)
        for (const w of s.words)
          if (w.keep === undefined) w.keep = !w.duplicate;   // duplicates start unticked
    capture.review = { idx: 0, filter: "__all__", saved: [] };
    renderWordReview();
  }
  function renderWordReview() {
    persistCapture();                 // word-review edits → save the draft
    const prop = capture.proposal, R = capture.review, l = prop.lessons[R.idx];
    const cats = l.sections.map((s) => s.cat);
    const filterChips = ["__all__", ...cats].map((c) => {
      const on = R.filter === c;
      return `<button class="chip" data-act="rw-filter" data-c="${esc(c)}" style="${on ? "background:#fff;color:var(--btn-text)" : ""}">${c === "__all__" ? "All" : esc(c)}</button>`;
    }).join("");
    const rows = [];
    l.sections.forEach((s, si) => {
      if (R.filter !== "__all__" && R.filter !== s.cat) return;
      s.words.forEach((w, wi) => {
        const low = w.confidence === "low" && !w.duplicate;
        const box = `<button data-act="rw-toggle" data-si="${si}" data-wi="${wi}" aria-label="${w.keep ? "Remove" : "Keep"} ${esc(w.front)}" style="width:26px;height:26px;flex:0 0 auto;border-radius:8px;border:2px solid ${w.keep ? "transparent" : "rgba(128,128,128,.6)"};background:${w.keep ? "var(--accent,#2273C4)" : "transparent"};color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer">${w.keep ? icon("check", "icon--sm") : ""}</button>`;
        const badge = w.duplicate ? `<span class="chip" style="pointer-events:none;opacity:.8">Already saved</span>`
          : low ? `<button class="chip" data-act="rw-edit" data-si="${si}" data-wi="${wi}">Check this</button>` : "";
        rows.push(`<div style="display:flex;align-items:center;gap:var(--s-3);padding:var(--s-3);border-radius:var(--s-3);${low ? "background:rgba(127,178,255,.12)" : ""};opacity:${w.keep ? "1" : ".55"}">
          ${box}
          <button data-act="rw-edit" data-si="${si}" data-wi="${wi}" style="flex:1;text-align:left;border:0;background:transparent;color:inherit;cursor:pointer">
            <span class="row__title" style="display:block">${esc(w.front)}</span>
            <span class="row__meta">${esc(w.back) || "—"}</span></button>
          ${badge}
        </div>`);
      });
    });
    const keepCount = l.sections.reduce((a, s) => a + s.words.filter((w) => w.keep).length, 0);
    const next = prop.lessons[R.idx + 1];
    mount(`<section class="screen screen--tabbed">
      <div class="t-caps" style="opacity:.6;margin-bottom:var(--s-2)">Step 4 of 4 · Check the words · Lesson ${R.idx + 1} of ${prop.lessons.length}</div>
      <h1 class="t-h1" style="font-size:var(--t-title)">${esc(l.name)}</h1>
      <p class="muted" style="margin-top:4px">Untick any word you don’t want. Tap a word to fix it.</p>
      <div class="chips" style="margin:var(--s-4) 0">${filterChips}</div>
      <div style="display:flex;flex-direction:column;gap:6px">${rows.join("")}</div>
      <button class="btn btn--primary" data-act="rw-commit" ${keepCount ? "" : "disabled"} style="margin-top:var(--s-6)${keepCount ? "" : ";opacity:.5;pointer-events:none"}">Add ${keepCount} word${keepCount === 1 ? "" : "s"} to this lesson</button>
      ${next ? `<div class="muted" style="text-align:center;margin-top:var(--s-3)">Next: ${esc(next.name)}, ${propWords(next)} words</div>` : ""}
      <button class="btn btn--secondary" data-act="seg-back">Back to the lessons</button>
    </section>${tabbar("add")}`);
  }
  function openWordFix(si, wi) {
    const R = capture.review, l = capture.proposal.lessons[R.idx], sec = l.sections[si], w = sec.words[wi];
    const catOpts = l.sections.map((s) => `<option value="${esc(s.cat)}" ${s.cat === sec.cat ? "selected" : ""}>${esc(s.cat)}</option>`).join("");
    sheet(`<div class="sheet__title">Fix this word</div>
      <div class="sheet__text">Our Spanish checker wasn’t sure about this one.</div>
      <label class="field-label">Spanish</label><input id="wf-es" class="field" value="${esc(w.front)}">
      <label class="field-label">English</label><input id="wf-en" class="field" value="${esc(w.back)}" placeholder="Translation">
      <label class="field-label">Section</label><select id="wf-cat" class="field">${catOpts}</select>
      <button class="btn btn--primary" data-act="wf-save" data-si="${si}" data-wi="${wi}">Looks right</button>
      <button class="btn btn--secondary" data-act="wf-remove" data-si="${si}" data-wi="${wi}">Don’t add this word</button>`);
    const f = document.getElementById("wf-es"); if (f) f.focus();
  }
  function doWordFix(si, wi) {
    const l = capture.proposal.lessons[capture.review.idx], sec = l.sections[si], w = sec.words[wi];
    const es = document.getElementById("wf-es"), en = document.getElementById("wf-en"), cat = document.getElementById("wf-cat");
    w.front = (es ? es.value : w.front).trim();
    w.back = (en ? en.value : w.back).trim();
    w.confidence = null; w.keep = true;                         // fixed → keep
    const newCat = cat ? cat.value : sec.cat;
    if (newCat !== sec.cat) {
      sec.words.splice(wi, 1);
      let tgt = l.sections.find((s) => s.cat === newCat);
      if (!tgt) { tgt = { cat: newCat, words: [] }; l.sections.push(tgt); }
      tgt.words.push(w);
      if (!sec.words.length) l.sections = l.sections.filter((s) => s !== sec);
    }
    closeSheet(); renderWordReview();
  }
  function removeWord(si, wi) {
    capture.proposal.lessons[capture.review.idx].sections[si].words[wi].keep = false;
    closeSheet(); renderWordReview();
  }
  async function commitReviewLesson() {
    const R = capture.review, l = capture.proposal.lessons[R.idx];
    const cards = [];
    for (const s of l.sections) for (const w of s.words) if (w.keep) cards.push({ front: w.front, back: w.back, category: s.cat });
    if (cards.length) {
      const res = await self.SpanishFlashcardsImport.importLesson(store, ctx.contentOwnerId, { name: l.name, source: "ocr", cards }, now());
      R.saved.push({ name: l.name, count: res.cardCount });
    }
    R.idx++; R.filter = "__all__";
    if (R.idx >= capture.proposal.lessons.length) {
      await refreshContent();
      try { await store.adapter.remove("captureDrafts", captureKey()); } catch {}  // scan imported — don't resume it
      renderCaptureSaved();
    } else renderWordReview();
  }
  function renderCaptureSaved() {
    const saved = capture.review.saved, total = saved.reduce((a, s) => a + s.count, 0);
    const name = ((emu ? emu.name : user.displayName) || "").split(" ")[0];
    const rows = saved.map((s) => `<div class="row" style="cursor:default"><span class="row__main"><span class="row__title">${esc(s.name)}</span><span class="row__meta">${s.count} word${s.count === 1 ? "" : "s"}</span></span>${icon("check", "icon--sm")}</div>`).join("");
    mount(`<section class="screen screen--tabbed">
      <div class="hero" style="align-items:center;text-align:center">
        <div class="mark" style="width:72px;height:72px;animation:none"><i class="mark__icon icon--check" style="background:var(--btn-text)"></i></div>
        <div class="t-hero" style="font-size:clamp(28px,8vw,40px)">¡Listo${name ? ", " + esc(name) : ""}!</div>
        <div class="muted">${saved.length} new lesson${saved.length === 1 ? "" : "s"} · ${total} new word${total === 1 ? "" : "s"}</div>
      </div>
      <div class="list" style="margin-top:var(--s-5)">${rows}</div>
      <button class="btn btn--primary" data-act="cap-done-lessons" style="margin-top:var(--s-6)">See my lessons</button>
      <button class="btn btn--secondary" data-act="cap-cancel">Back to home</button>
    </section>${tabbar("add")}`);
  }

  function renderCaptureProblem() {
    mount(`<section class="screen screen--tabbed">
      <div class="t-caps" style="opacity:.6;margin-bottom:var(--s-2)">Reading</div>
      <h1 class="t-h1">We couldn’t read those</h1>
      <div class="placeholder" style="margin-top:var(--s-5)">${icon("offline")}<div class="t-title">Something interrupted the scan</div><div class="muted">Your photos are safe on this phone. Try again in a moment.</div></div>
      <div style="display:flex;flex-direction:column;gap:var(--s-3);margin-top:var(--s-5)">
        <button class="btn btn--primary" data-act="cap-read">Try again</button>
        <button class="btn" data-act="cap-cancel" style="background:transparent;border:1px solid rgba(128,128,128,.4)">Back to home</button>
      </div>
    </section>${tabbar("add")}`);
  }

  // First-run onboarding (board 26) — shown on Home when the account has no lessons.
  function renderFirstRun() {
    const name = ((emu ? emu.name : user.displayName) || "").split(" ")[0];
    const step = (ic, txt) => `<div style="display:flex;align-items:center;gap:var(--s-3)">${icon(ic, "icon--sm")}<span>${txt}</span></div>`;
    mount(`<section class="screen screen--tabbed">
      <h1 class="t-h1">Hi${name ? ", " + esc(name) : ""}</h1>
      <div class="hero" style="margin-top:var(--s-5)">
        <div class="t-caps hero__label">Let’s start</div>
        <div class="t-title">Add your first homework</div>
        <div class="muted">Take a photo of a page. We turn the Spanish words into flashcards for you.</div>
        <div style="display:flex;flex-direction:column;gap:var(--s-3);margin:var(--s-4) 0">
          ${step("camera", "Take a photo")}${step("lessons", "We make a lesson")}${step("check", "You study it")}
        </div>
        <button class="btn btn--primary" data-act="cap-add-cam">${icon("camera", "icon--sm")} Take a photo</button>
        <button class="btn btn--secondary" data-act="cap-add-lib">Choose from library</button>
      </div>
    </section>${tabbar("home")}`);
  }

  // C5 capture problem states — calm blue, blame neither her nor the photo.
  function renderCapOffline() {
    mount(`<section class="screen screen--tabbed">
      <div class="t-caps" style="opacity:.6;margin-bottom:var(--s-2)">Reading</div>
      <h1 class="t-h1">You’re offline</h1>
      <div class="placeholder" style="margin-top:var(--s-5)">${icon("offline")}<div class="t-title">Reading new pages needs the internet</div><div class="muted">Your photos are safe on this phone. Studying still works offline.</div></div>
      <div style="display:flex;flex-direction:column;gap:var(--s-3);margin-top:var(--s-5)">
        <button class="btn btn--primary" data-act="cap-study">Study a lesson</button>
        <button class="btn btn--secondary" data-act="cap-save-later">Save pages and read later</button>
      </div>
    </section>${tabbar("add")}`);
  }
  function renderCapNoWords() {
    mount(`<section class="screen screen--tabbed">
      <div class="t-caps" style="opacity:.6;margin-bottom:var(--s-2)">Reading</div>
      <h1 class="t-h1">We couldn’t find any words</h1>
      <div class="placeholder" style="margin-top:var(--s-5)">${icon("search")}<div class="t-title">No printed Spanish found</div><div class="muted">The page may be too dark or cropped, or it’s handwriting. Printed vocabulary lists read best.</div></div>
      <div style="display:flex;flex-direction:column;gap:var(--s-3);margin-top:var(--s-5)">
        <button class="btn btn--primary" data-act="cap-retake">Take a new photo</button>
        <button class="btn btn--secondary" data-act="cap-add-manual">Add words by hand</button>
      </div>
    </section>${tabbar("add")}`);
  }
  function renderCapUnreadable(badPages) {
    const bad = (badPages || []).slice().sort((a, b) => a - b);
    const total = capture ? capture.pages.length : 0;
    const good = []; for (let i = 1; i <= total; i++) if (!bad.includes(i)) good.push(i);
    const tiles = (capture ? capture.pages : []).map((p, i) => {
      const n = i + 1, isBad = bad.includes(n);
      return `<div style="position:relative;aspect-ratio:3/4;border-radius:var(--s-3);overflow:hidden;background:rgba(128,128,128,.18)${isBad ? ";outline:2px solid #E8B84B;outline-offset:-2px" : ""}">
        ${p.dataUrl ? `<img src="${p.dataUrl}" style="width:100%;height:100%;object-fit:cover">` : ""}
        <span style="position:absolute;left:6px;top:6px;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:rgba(0,0,0,.6);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center">${n}</span>
        ${isBad ? `<span style="position:absolute;right:6px;top:6px;width:22px;height:22px;border-radius:11px;background:#E8B84B;color:#1a1200;font-weight:800;display:flex;align-items:center;justify-content:center">!</span>` : ""}
      </div>`;
    }).join("");
    mount(`<section class="screen screen--tabbed">
      <div class="t-caps" style="opacity:.6;margin-bottom:var(--s-2)">Reading</div>
      <h1 class="t-h1">${bad.length === 1 ? "One page needs a retake" : bad.length + " pages need a retake"}</h1>
      <p class="muted" style="margin-top:var(--s-2)">Page${bad.length > 1 ? "s" : ""} ${bad.join(", ")} came out too blurry to read.${good.length ? ` Page${good.length > 1 ? "s" : ""} ${good.join(", ")} ${good.length > 1 ? "are" : "is"} fine.` : ""}</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--s-3);margin-top:var(--s-4)">${tiles}</div>
      <div style="display:flex;flex-direction:column;gap:var(--s-3);margin-top:var(--s-5)">
        <button class="btn btn--primary" data-act="cap-retake">Retake the pages</button>
        <button class="btn btn--secondary" data-act="cap-skip-bad" data-bad="${bad.join(",")}">Skip ${bad.length === 1 ? "that page" : "those pages"} · read the rest</button>
      </div>
    </section>${tabbar("add")}`);
  }

  // Choose the proposer: the real Claude-vision function when AI is enabled, else
  // the dev mock on localhost, else a "being set up" state on prod (null).
  function aiReady() { return !!(self.AliyahConfig && self.AliyahConfig.ai && self.AliyahConfig.ai.enabled); }
  function captureProposer() {
    if (aiReady() && self.SpanishFlashcardsAiAdapter) {
      const adapter = self.SpanishFlashcardsAiAdapter.createFunctionAiAdapter({
        endpoint: self.AliyahConfig.ai.endpoint,
        getAccessToken: () => (_auth ? _auth.getAccessToken() : null),
      });
      return () => adapter.importFromPhoto((capture ? capture.pages : []).map((p) => p.dataUrl), {});
    }
    const onProd = /(^|\.)aliyahsflashcards\.(com|netlify\.app)$/.test(location.hostname);
    if (onProd && !(capture && capture.mode)) return null;   // prod, AI not switched on yet → pending
    return () => mockImportFromPhoto(capture ? capture.pages : [], capture && capture.mode);
  }
  function renderCapPending() {
    mount(`<section class="screen screen--tabbed">
      <div class="t-caps" style="opacity:.6;margin-bottom:var(--s-2)">Reading</div>
      <h1 class="t-h1">Photo reading is almost ready</h1>
      <div class="placeholder" style="margin-top:var(--s-5)">${icon("camera")}<div class="t-title">Being set up</div><div class="muted">The photo-to-flashcards reader is being switched on. Your pages are safe on this phone.</div></div>
      <button class="btn btn--primary" data-act="cap-cancel" style="margin-top:var(--s-5)">Back to home</button>
    </section>${tabbar("add")}`);
  }

  // DEV MOCK proposer — replaced by the Netlify Function (Claude vision) at 6e.
  //  `mode` ("nowords" | "unreadable") only exists to exercise the C5 states.
  function mockImportFromPhoto(pages, mode) {
    const np = (pages && pages.length) || 1;
    return new Promise((resolve) => setTimeout(() => {
      if (mode === "nowords") return resolve({ lessons: [] });
      if (mode === "unreadable") return resolve({ unreadablePages: [2], lessons: [] });
      resolve({
        lessons: [
          { name: "Las frutas — Fruits", pages: [1], sections: [
            { cat: "Fruits", words: [
              { front: "la manzana", back: "apple" },
              { front: "el plátano", back: "banana" },
            ] },
            { cat: "Berries", words: [
              { front: "la fresa", back: "strawberry", confidence: "low" },
              { front: "la sandía", back: "watermelon", duplicate: true },
            ] } ] },
          { name: "La comida callejera — Street food", pages: np > 1 ? [2, Math.min(np, 3)] : [1], sections: [
            { cat: "Street food", words: [
              { front: "el taco", back: "taco" },
              { front: "la quesadilla", back: "quesadilla" },
              { front: "el elote", back: "corn on the cob", confidence: "low" },
            ] } ] },
        ],
      });
    }, 1500));
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

  // ---- logged-out screens: Sign in + Not on the list -----------------------
  //  Photo treatment per the sign-in handoff. These are the ONLY screens that use
  //  the photo/navy ground; everything after sign-in keeps the blue --ground.
  //  PHASE 5: there is no real Google OAuth yet. The real app still boots straight
  //  to Home (demo user); these screens are reachable only via a dev route
  //  (#dev=signin / #dev=notonlist), and "Continue" just crossfades to the
  //  not-on-list state so the designed transition is demoable. Replace the dev
  //  route + the button handlers below with real auth + allowlist in Phase 5.
  const GOOGLE_G = `<svg class="auth__g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

  function authMarkup(email) {
    return `<section class="auth" data-state="signin">
      <div class="auth__ground"></div>
      <img class="auth__photo auth__photo--blur" src="assets/signin-bg-blur.jpg" alt="" aria-hidden="true">
      <img class="auth__photo auth__photo--sharp" src="assets/signin-bg.jpg" alt="" aria-hidden="true">
      <div class="auth__scrim"></div>

      <div class="auth__content auth__content--signin">
        <img class="auth__logo" src="assets/logo-mark.png" alt="" aria-hidden="true">
        <div class="auth__sp-2"></div>
        <div class="auth__mid">
          <h1 class="auth__title">Aliyah's Flashcards</h1>
          <p class="auth__tagline">Turn your Spanish homework into flashcards.</p>
        </div>
        <div class="auth__sp-1"></div>
        <div class="auth__bottom">
          <button class="btn btn--primary auth__google" data-act="auth-continue">${GOOGLE_G}Continue with Google</button>
          <p class="auth__fine">This app is invite-only.</p>
        </div>
      </div>

      <div class="auth__content auth__content--notlist">
        <div class="auth__lock">${icon("lock")}</div>
        <h1 class="auth__nl-title">This app is invite-only</h1>
        <p class="auth__nl-body">We could not find an invite for this account. Ask the person who shared the app with you to add you, then try again.</p>
        <div class="auth__email">${esc(email)}</div>
        <div class="auth__actions">
          <button class="btn btn--secondary" data-act="auth-different">Use a different account</button>
          <button class="btn btn--primary" data-act="auth-retry">Try again</button>
        </div>
      </div>
    </section>`;
  }
  function renderAuth(state /* "signin" | "notlist" */, email = "you@gmail.com") {
    mount(authMarkup(email));
    const el = document.querySelector(".auth");
    if (el) el.dataset.state = state === "notlist" ? "notlist" : "signin";
    // decode photos before they first show (README): avoids a flash on reveal
    for (const img of document.querySelectorAll(".auth__photo")) { try { img.decode?.().catch(() => {}); } catch {} }
  }
  function authGoTo(state) { const el = document.querySelector(".auth"); if (el) el.dataset.state = state; }

  // ---- confetti (motion.css drives the keyframes) --------------------------
  function launchConfetti() {
    if (reduceMotion()) return;
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
  function mount(html) {
    app.innerHTML = html; window.scrollTo(0, 0);
    app.classList.toggle("emulating", !!emu);
    if (emu) app.insertAdjacentHTML("afterbegin",
      `<div class="emu-bar">${icon("eye")}<span class="emu-bar__txt"><b>Viewing as ${esc(emu.name)}</b><span>Nothing you do here is saved</span></span>
        <button class="emu-bar__btn" data-act="emu-options">Options</button>
        <button class="emu-bar__btn emu-bar__btn--x" data-act="emu-exit">Exit</button></div>`);
  }

  app.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]"); if (!t) return;
    const act = t.dataset.act, id = t.dataset.id, lid = t.dataset.lid;
    if (act === "tab") {
      const tab = t.dataset.tab;
      if (tab === "home") renderHome();
      else if (tab === "lessons") renderLessons();
      else if (tab === "progress") renderProgress();
      else if (tab === "me") renderMe();
      else if (tab === "add") { if (capture && capture.pages.length) renderCapture(); else startCapture(); }
    }
    else if (act === "home") renderHome();
    else if (act === "lessons") renderLessons();
    else if (act === "open-lesson") renderLessonDetail(id);
    else if (act === "study-lesson") startSession([lessons.find((l) => l.id === id)]);
    else if (act === "study-all" || act === "keep-practicing") startSession(lessons);
    else if (act === "resume") resumeSession();
    else if (act === "new-session") { clearResume(); renderHome(); }
    // Phase 6 capture
    else if (act === "cap-add-lib") capInputs().lib.click();
    else if (act === "cap-add-cam") capInputs().cam.click();
    else if (act === "cap-remove") { if (capture) { capture.pages = capture.pages.filter((p) => p.id !== id); renderCapture(); } }
    else if (act === "cap-read") renderReading();
    else if (act === "cap-cancel") { clearCapture(); renderHome(); }
    else if (act === "seg-rename") openSegRename(Number(t.dataset.i));
    else if (act === "seg-rename-save") doSegRename(Number(t.dataset.i));
    else if (act === "seg-split") renderSegSplit(Number(t.dataset.i));
    else if (act === "seg-split-at") segSplitAt(t.dataset.i);
    else if (act === "seg-split-confirm") doSegSplit();
    else if (act === "seg-merge") { segMerge(Number(t.dataset.i)); renderCaptureFound(); }
    else if (act === "seg-back") renderCaptureFound();
    else if (act === "seg-review") startWordReview();
    else if (act === "rw-filter") { capture.review.filter = t.dataset.c; renderWordReview(); }
    else if (act === "rw-toggle") { const w = capture.proposal.lessons[capture.review.idx].sections[Number(t.dataset.si)].words[Number(t.dataset.wi)]; w.keep = !w.keep; renderWordReview(); }
    else if (act === "rw-edit") openWordFix(Number(t.dataset.si), Number(t.dataset.wi));
    else if (act === "wf-save") doWordFix(Number(t.dataset.si), Number(t.dataset.wi));
    else if (act === "wf-remove") removeWord(Number(t.dataset.si), Number(t.dataset.wi));
    else if (act === "rw-commit") commitReviewLesson();
    else if (act === "cap-done-lessons") { clearCapture(); renderLessons(); }
    else if (act === "cap-study") { clearCapture(); renderLessons(); }
    else if (act === "cap-save-later") renderHome();
    else if (act === "cap-retake") { if (capture) capture.mode = null; renderCapture(); }
    else if (act === "cap-add-manual") { clearCapture(); renderLessons(); }
    else if (act === "cap-skip-bad") { if (capture) { const bad = (t.dataset.bad || "").split(",").map(Number); capture.pages = capture.pages.filter((p, i) => !bad.includes(i + 1)); capture.mode = null; renderReading(); } }
    else if (act === "practice-tricky") renderTricky();
    else if (act === "study-tricky") startTricky();
    else if (act === "idk") idk();
    else if (act === "pick-option") chooseAnswer(t.dataset.val);
    else if (act === "speak-start") speakStart();
    else if (act === "speak-stop") speakStop();
    else if (act === "speak-check") speakCheck();
    else if (act === "speak-retry") speakRetry();
    else if (act === "type-instead") typeInstead();
    else if (act === "grade-next") gradeNext();
    else if (act === "speak") speak(t.dataset.say);
    else if (act === "explain") openExplain(S.current, S.typed, S.dir);
    else if (act === "example") openExample(S.current);
    else if (act === "adjudicate") openAdjudicate(S.current, S.typed, S.dir);
    else if (act === "adj-accept") doAdjAccept();
    else if (act === "pronounce") openPronounce(t.dataset.say);
    else if (act === "pron-consent-ok") { try { localStorage.setItem("aliyah.pron.consent", "1"); } catch {} openPronounce(t.dataset.say); }
    else if (act === "pron-record") doPronRecord(t.dataset.say);
    else if (act === "word-suggest-en") wordSuggestEn();
    else if (act === "open-rating") openRating();
    else if (act === "rate") rate(t.dataset.val);
    else if (act === "close-rating") closeRating();
    else if (act === "exit-study") openExit();
    else if (act === "close-exit") closeExit();
    // lesson management (Phase 4b)
    else if (act === "lesson-menu") openLessonMenu(id);
    else if (act === "lesson-rename") openRename(id);
    else if (act === "lesson-rename-save") doRename(id);
    else if (act === "lesson-delete") openDeleteLesson(id);
    else if (act === "lesson-delete-confirm") doDeleteLesson(id);
    else if (act === "lesson-undo") undoDelete(id);
    else if (act === "recently-deleted") renderRecentlyDeleted();
    else if (act === "lesson-restore") restoreFromList(id);
    else if (act === "word-restore") restoreDeletedWord(id);
    else if (act === "close-sheet") closeSheet();
    // merge + split (Phase 4c)
    else if (act === "lesson-merge") openMerge(id);
    else if (act === "merge-pick") mergePick(id);
    else if (act === "merge-confirm") doMerge();
    else if (act === "lesson-split") renderSplit(id);
    else if (act === "split-at") splitAt(t.dataset.i);
    else if (act === "split-confirm") doSplit(id);
    // word editing (Phase 4d)
    else if (act === "word-edit") openEditWord(id, lid);
    else if (act === "word-add") openAddWord(id);
    else if (act === "word-strict") wordStrict(t.dataset.val);
    else if (act === "word-accept-add") wordAcceptAdd();
    else if (act === "word-accept-rm") wordAcceptRm(t.dataset.i);
    else if (act === "word-section") openSectionPicker();
    else if (act === "word-section-pick") pickSection(t.dataset.val);
    else if (act === "word-move") openWordMove();
    else if (act === "word-move-pick") doWordMove(id);
    else if (act === "word-back") renderWordSheet();
    else if (act === "word-delete") doWordDelete();
    else if (act === "word-undo") undoWordDelete(id, lid);
    else if (act === "word-save") wordSave();
    else if (act === "toggle-exact") toggleExact();
    else if (act === "toggle-pron") togglePron();
    else if (act === "pick-open") openPicker(t.dataset.kind);
    else if (act === "pick-set") pickSet(t.dataset.kind, t.dataset.val);
    else if (act === "your-data") renderYourData();
    else if (act === "export-data") doExport();
    else if (act === "sign-out") doSignOut();
    else if (act === "delete-account") openDeleteAccount();
    else if (act === "delete-confirm") doDeleteAccount();
    else if (act === "account-restore") restoreAccount();
    else if (act === "install-dismiss") dismissInstall();
    // Roleplay (R4)
    else if (act === "rp-open") openRoleplayPicker(id);
    else if (act === "rp-start" || act === "rp-again") startRoleplay(t.dataset.scn, t.dataset.lid || null);
    else if (act === "rp-send") sendRoleplay();
    else if (act === "rp-toggle-en") roleplayToggleEn();
    else if (act === "rp-exit") exitRoleplay();
    else if (act === "rp-log") renderRoleplayLog();
    else if (act === "rp-log-open") renderRoleplayTranscript(id);
    // People + emulation (Phase 5d)
    else if (act === "people") renderPeople();
    else if (act === "invite-open") openInvite();
    else if (act === "invite-role") inviteRoleSet(t.dataset.val);
    else if (act === "invite-send") doInvite();
    else if (act === "study-as") studyAs(id);
    else if (act === "person-menu") openPersonMenu(id);
    else if (act === "person-promote") setRole(id, "admin");
    else if (act === "person-demote") setRole(id, "user");
    else if (act === "emu-options") openEmuOptions();
    else if (act === "emu-exit") exitEmulation();
    else if (act === "emu-count") toggleCountOwn();
    // Logged-out screens
    else if (act === "auth-continue") signInGoogle();
    else if (act === "auth-retry") authGate();
    else if (act === "auth-different") signInGoogle();
    else if (act === "noop") { /* Explain / dispute — later phases */ }
  });
  app.addEventListener("submit", (e) => {
    if (e.target.id === "answer-form") { e.preventDefault(); check(); }
    else if (e.target.dataset && e.target.dataset.act === "rp-send-form") { e.preventDefault(); sendRoleplay(); }
  });

  // ---- auth gate (Phase 5c) — INERT unless configured ----------------------
  //  Set localStorage "aliyah.supabase" = {"url":"https://api.aliyahsflashcards.com",
  //  "anonKey":"<ANON_KEY>"} to turn real Google sign-in on. With no config the app
  //  stays in local demo mode and boots straight to Home exactly as before.
  //  Backend prerequisites (Mike runs): Google enabled on the box's GoTrue + a Google
  //  OAuth client + SITE_URL = the Netlify origin. See PROGRESS.md.
  //  NOTE: per-account data binding + cross-device sync land once the backend is live;
  //  for now the signed-in gate decides access, and local data stays on the demo store.
  //  Backend config resolution: an explicit localStorage override wins (dev/testing),
  //  then the baked-in prod default from config.js (null until the anon key is filled
  //  in, and only on a prod host). `aliyah.demo=1` forces demo mode anywhere.
  function authConfig() {
    try {
      if (localStorage.getItem("aliyah.demo") === "1") return null;
      const ls = JSON.parse(localStorage.getItem("aliyah.supabase") || "null");
      if (ls && ls.url && ls.anonKey) return ls;
    } catch {}
    return (self.AliyahConfig && self.AliyahConfig.backend) || null;
  }
  let _auth = null;
  function loadSupabase() {
    if (self.supabase && self.supabase.createClient) return Promise.resolve(self.supabase);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
      s.onload = () => resolve(self.supabase); s.onerror = () => reject(new Error("supabase-js failed to load"));
      document.head.appendChild(s);
    });
  }
  async function getAuth() {
    const cfg = authConfig(); if (!cfg || !cfg.url || !cfg.anonKey) return null;
    if (_auth) return _auth;
    await loadSupabase();
    _auth = self.SpanishFlashcardsAuth.createAuth({ url: cfg.url, anonKey: cfg.anonKey });
    _auth.onAuthChange((ev) => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") authGate(); });
    return _auth;
  }
  async function signInGoogle() {
    let auth = null; try { auth = await getAuth(); } catch {}
    if (!auth) { authGoTo("notlist"); return; }   // unconfigured demo: show the designed crossfade
    await auth.signInWithGoogle(location.origin + location.pathname);
  }
  async function doSignOut() {
    try { const auth = await getAuth(); if (auth) await auth.signOut(); } catch {}
    renderAuth("signin");
  }
  // ---- account binding + sync (prod) ---------------------------------------
  let _sync = null, _activated = null, _demoReady = false, _syncing = false, _syncTimer = null;
  const syncCursorKey = (uid) => "aliyah.synccursor:" + uid;
  function scheduleSync() { if (!_sync) return; clearTimeout(_syncTimer); _syncTimer = setTimeout(runSync, 1500); }
  async function runSync() {
    if (!_sync || !user || _syncing) return;
    _syncing = true;
    const k = syncCursorKey(user.id);
    try {
      let cur = localStorage.getItem(k) || undefined;
      cur = await _sync.sync(cur);
      try { if (cur) localStorage.setItem(k, cur); } catch {}
      await _recache();
    } catch (e) { console.warn("sync deferred (offline?):", e && e.message); }
    finally { _syncing = false; }
  }

  // The local demo account — used only when no backend is configured.
  async function ensureDemo() {
    if (_demoReady) { await _recache(); return; }
    user = demoUser; emu = null; ctx = store.studyContext(user);
    await seedUser(store, DEMO_ID, now());
    _demoReady = true;
    await _recache();
    await restoreCaptureDraft();                    // resume an in-progress scan (R5)
  }

  // Bind the signed-in Google account as the active account, load its data, sync.
  async function activateAccount(session) {
    const auth = _auth;
    const acct = await auth.ensureUserRecord(store, session, now());
    if (acct) user = acct;
    emu = null;
    ctx = store.studyContext(user);
    if (!_sync && self.SpanishFlashcardsSync && self.SpanishFlashcardsSupabaseTransport) {
      const cfg = authConfig();
      const transport = self.SpanishFlashcardsSupabaseTransport.createSupabaseTransport({
        url: cfg.url, anonKey: cfg.anonKey, getAccessToken: () => auth.getAccessToken(),
      });
      // Sync the default collections; add roleplay transcripts only once the
      // Supabase roleplay_sessions table + RLS exist (config.roleplay.synced),
      // so the feature can't break sync before the migration is applied.
      const syncCollections = roleplaySynced()
        ? store.COLLECTIONS.concat([store.ROLEPLAY_COLLECTION])
        : store.COLLECTIONS;
      _sync = self.SpanishFlashcardsSync.createSync(store, transport, { collections: syncCollections });
      setInterval(scheduleSync, 60000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleSync(); });
    }
    // Pull server state down FIRST (so seeding can't duplicate an existing account),
    // then seed starter content only if this account still has none.
    const k = syncCursorKey(user.id);
    try {
      let cur = localStorage.getItem(k) || undefined;
      if (_sync) { cur = await _sync.pull(cur); try { if (cur) localStorage.setItem(k, cur); } catch {} }
    } catch (e) { console.warn("initial pull deferred (offline?):", e && e.message); }
    await seedUser(store, user.id, now());
    await _recache();
    await restoreCaptureDraft();                    // resume an in-progress scan (R5)
    scheduleSync();                                 // push the seed + catch up, in the background
  }

  // Decide the first screen. Dev route (#dev=…) always wins for design review.
  async function authGate() {
    applyTheme();
    const m = /(?:^|[#&])dev=(signin|notlist|notonlist)/.exec(location.hash);
    if (m) { renderAuth(m[1] === "signin" ? "signin" : "notlist"); return; }
    let auth = null; try { auth = await getAuth(); } catch {}
    if (!auth) { await ensureDemo(); renderHome(); return; }   // unconfigured → local demo
    let session = null; try { session = await auth.getSession(); } catch {}
    if (!session) { _activated = null; renderAuth("signin"); return; }
    let allowed = false; try { allowed = await auth.isAllowed(); } catch {}
    if (!allowed) { renderAuth("notlist", (session.user && session.user.email) || "you@gmail.com"); return; }
    if (_activated !== session.user.id) { _activated = session.user.id; await activateAccount(session); }
    else { await _recache(); }
    renderHome();                                   // allowed → per-account data + background sync
  }
  function boot() { authGate(); }
  window.addEventListener("hashchange", authGate);
  authGate();
  // console poking (getters: user/ctx are reassigned on sign-in)
  window.__app = { store, get user() { return user; }, get ctx() { return ctx; }, renderAuth, authConfig, runSync, explain: openExplain, example: openExample, adjudicate: openAdjudicate, pronounce: openPronounce,
    cap: { start: startCapture, reading: renderReading, firstrun: renderFirstRun, offline: renderCapOffline, downscale: downscaleImage,
      seed(n, mode) { capture = { pages: Array.from({ length: n || 3 }, (_, i) => ({ id: "pg" + i, dataUrl: "" })), proposal: null, mode }; renderReading(); } } };
});
