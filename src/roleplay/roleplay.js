// @ts-check
/**
 * Roleplay (R4) — shared, provider-free core for the "pretend chat" practice.
 *
 * This module is the single source of truth for BOTH the Netlify Function
 * (netlify/functions/ai.mjs, which runs the two-pass moderation + reply) and the
 * client UI (app/main.js, which renders the chat and saves the transcript). It
 * holds the LOCKED scenario catalog (never open-ended) and the pure, testable
 * helpers (turn cap, lesson-word list, deterministic PII backstop). No network,
 * no DOM — so node tests exercise all of it.
 *
 * Safety model (see PROGRESS.md R4 spec, approved 2026-11-13):
 *   - Fixed scenarios only, chosen by id the server knows — the learner can never
 *     steer the model off into open-ended chat.
 *   - Typed input only (v1).
 *   - Two-pass Claude moderation (her input BEFORE the roleplay model sees it, and
 *     the AI reply BEFORE it is shown) runs SERVER-SIDE so the client can't skip it.
 *   - `looksLikePII` is a cheap deterministic backstop (emails / phone / long digit
 *     runs) layered under the Claude pass — defence in depth, never the only guard.
 *   - Bounded to TURN_LIMIT learner turns.
 *   - Full transcript is saved so a parent/admin can review every exchange.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SpanishFlashcardsRoleplay = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Max LEARNER turns before the chat gently wraps up (AI opening doesn't count). */
  const TURN_LIMIT = 8;

  /** How many lesson words to hand the model as the allowed vocabulary. */
  const MAX_LESSON_WORDS = 60;

  /**
   * The LOCKED scenario catalog. Each scenario pins the setting, the role the AI
   * plays, the goal, and a fixed Spanish opening line. The server prompts from
   * THIS (by id); the client only sends an id, so the dialogue can never become
   * open-ended. Keep every scenario an everyday, age-appropriate Spanish-2 errand.
   * @typedef {Object} Scenario
   * @property {string} id
   * @property {string} emoji
   * @property {string} title       short English label (chooser)
   * @property {string} blurb       one line: what she'll do
   * @property {string} aiRole      who the AI plays (English, for the prompt)
   * @property {string} setting     where it happens (English, for the prompt)
   * @property {string} goal        what "finishing" looks like (English, for the prompt)
   * @property {string} openingEs   the AI's fixed first line (Spanish)
   * @property {string} openingEn   its English translation
   */
  /** @type {Scenario[]} */
  const SCENARIOS = [
    {
      id: "cafe",
      emoji: "☕",
      title: "Ordering at a café",
      blurb: "Order a drink and a snack from a friendly server.",
      aiRole: "a warm, patient café server",
      setting: "a small café in a Spanish-speaking town",
      goal: "the student orders something to eat or drink and pays",
      openingEs: "¡Hola! Bienvenida al café. ¿Qué te gustaría tomar?",
      openingEn: "Hi! Welcome to the café. What would you like to drink?",
    },
    {
      id: "directions",
      emoji: "🗺️",
      title: "Asking for directions",
      blurb: "Ask a kind stranger how to get somewhere in town.",
      aiRole: "a friendly local helping with directions",
      setting: "a street corner in a Spanish-speaking town",
      goal: "the student asks where a place is and understands the way there",
      openingEs: "¡Hola! Te ves un poco perdida. ¿Buscas algo?",
      openingEn: "Hi! You look a little lost. Are you looking for something?",
    },
    {
      id: "shopping",
      emoji: "🛍️",
      title: "Shopping for clothes",
      blurb: "Buy something at a shop — ask about size, color and price.",
      aiRole: "a helpful shop assistant",
      setting: "a small clothing shop",
      goal: "the student asks about an item (size, color, or price) and decides",
      openingEs: "¡Hola! ¿En qué te puedo ayudar hoy?",
      openingEn: "Hi! How can I help you today?",
    },
    {
      id: "school",
      emoji: "🎒",
      title: "School small-talk",
      blurb: "Chat with a classmate about school, classes and the day.",
      aiRole: "a friendly classmate the same age",
      setting: "the hallway at school between classes",
      goal: "the student chats about classes, the day, or weekend plans",
      openingEs: "¡Hola! ¿Qué tal tu día? ¿Tienes clase ahora?",
      openingEn: "Hi! How's your day? Do you have class now?",
    },
  ];

  const _byId = {};
  for (const s of SCENARIOS) _byId[s.id] = s;

  /** @param {string} id @returns {Scenario|null} */
  function getScenario(id) {
    return (id && _byId[id]) || null;
  }

  /** The valid scenario ids (so the server can reject anything else). */
  const SCENARIO_IDS = SCENARIOS.map((s) => s.id);

  /**
   * The allowed vocabulary to hand the model, from a lesson's cards. Spanish +
   * English, de-duped, capped. (The model is told to lean on these words.)
   * @param {{front?: string, back?: string}[]} cards
   * @returns {{es: string, en: string}[]}
   */
  function lessonWordList(cards) {
    const out = [];
    const seen = new Set();
    for (const c of cards || []) {
      const es = String((c && c.front) || "").trim();
      const en = String((c && c.back) || "").trim();
      if (!es) continue;
      const key = es.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ es, en });
      if (out.length >= MAX_LESSON_WORDS) break;
    }
    return out;
  }

  /**
   * Count the learner's turns already taken in a transcript.
   * @param {{turns?: {role: string}[]}} session
   * @returns {number}
   */
  function learnerTurnsTaken(session) {
    const turns = (session && session.turns) || [];
    let n = 0;
    for (const t of turns) if (t && t.role === "learner") n++;
    return n;
  }

  /** @param {{turns?: {role: string}[]}} session @param {number} [limit] @returns {number} */
  function turnsRemaining(session, limit) {
    const lim = typeof limit === "number" ? limit : TURN_LIMIT;
    return Math.max(0, lim - learnerTurnsTaken(session));
  }

  /** @param {{turns?: {role: string}[]}} session @param {number} [limit] @returns {boolean} */
  function atTurnLimit(session, limit) {
    return turnsRemaining(session, limit) <= 0;
  }

  /**
   * Cheap deterministic PII backstop (layered UNDER the Claude moderation pass).
   * Flags emails, phone-like / long digit runs, and "@handle" mentions. Never the
   * only guard — just defence in depth so an obvious leak is caught even if a model
   * call is degraded.
   * @param {string} text
   * @returns {boolean}
   */
  function looksLikePII(text) {
    const s = String(text || "");
    if (/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(s)) return true; // email
    const digits = (s.match(/\d/g) || []).length;
    if (digits >= 7) return true;                                          // phone / id runs
    if (/(?:\+?\d[\s().-]*){7,}/.test(s)) return true;                     // formatted phone
    if (/(^|\s)@[a-z0-9_]{2,}/i.test(s)) return true;                      // social handle
    return false;
  }

  /**
   * Trim and hard-cap a learner message (defensive — the UI also limits length).
   * @param {string} text @returns {string}
   */
  function clampInput(text) {
    return String(text == null ? "" : text).trim().slice(0, 300);
  }

  return {
    TURN_LIMIT,
    MAX_LESSON_WORDS,
    SCENARIOS,
    SCENARIO_IDS,
    getScenario,
    lessonWordList,
    learnerTurnsTaken,
    turnsRemaining,
    atTurnLimit,
    looksLikePII,
    clampInput,
  };
});
