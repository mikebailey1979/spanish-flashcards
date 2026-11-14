// @ts-check
/**
 * Aliyah's Flashcards — core data model (M1).
 *
 * Design notes that fall out of the product decisions (2026-11-09):
 *  - **Content is owned per-user.** Deck / Lesson / Card each carry `ownerId`.
 *    Users are fully separated; an admin may *emulate* another user to view and
 *    manage their content.
 *  - **Progress is separate from content.** A Card does NOT carry SRS state.
 *    Instead `Progress` and `ReviewEvent` rows are keyed by the *studier's*
 *    `userId`. This is what lets an admin emulate Aliyah without ever touching
 *    her schedule: grading simply runs under a different (or no) userId.
 *  - **Sync-ready from day one.** Every record is a `Syncable` (UUID id,
 *    `updatedAt`, `deletedAt` tombstone), so M2 only adds transport.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SpanishFlashcardsModel = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** @typedef {"admin"|"user"} Role */
  /** @typedef {"again"|"hard"|"good"|"easy"} Grade */
  /** @typedef {"seed"|"ocr"|"manual"} LessonSource */
  /** @typedef {"type"|"choice"|"speak"} ReviewMode */

  const ROLES = /** @type {const} */ (["admin", "user"]);
  const GRADES = /** @type {const} */ (["again", "hard", "good", "easy"]);
  const LESSON_SOURCES = /** @type {const} */ (["seed", "ocr", "manual"]);
  const REVIEW_MODES = /** @type {const} */ (["type", "choice", "speak"]);

  /**
   * @typedef {Object} Syncable
   * @property {string} id            UUID
   * @property {string} updatedAt     ISO timestamp of last change
   * @property {string|null} deletedAt ISO timestamp if tombstoned, else null
   */

  /**
   * @typedef {Syncable & {
   *   email: string,
   *   displayName: string,
   *   role: Role
   * }} User
   */

  /**
   * @typedef {Syncable & {
   *   ownerId: string,
   *   name: string,
   *   frontLocale: string,
   *   backLocale: string
   * }} Deck
   */

  /**
   * @typedef {Syncable & {
   *   ownerId: string,
   *   deckId: string,
   *   name: string,
   *   source: LessonSource,
   *   cardIds: string[]
   * }} Lesson
   */

  /**
   * @typedef {Object} StrictFlags
   * @property {boolean} [article] If true, do NOT forgive a leading article/particle.
   * @property {boolean} [plural]  If true, do NOT accept singular⇄plural equivalence.
   * @property {boolean} [typo]    If true, do NOT allow edit-distance typo tolerance.
   */

  /**
   * @typedef {Syncable & {
   *   ownerId: string,
   *   deckId: string,
   *   front: string,
   *   back: string,
   *   accepts: string[],
   *   strict: StrictFlags,
   *   strictMode: "follow"|"exact"|"forgiving",
   *   category: string|null
   * }} Card  category = the bilingual sub-heading/section within a lesson (or null)
   *   strictMode: how this card resolves spelling tolerance — "follow" the global Exact
   *   setting (default), always "exact", or always "forgiving".
   */

  /**
   * @typedef {Object} SrsState
   * @property {number|null} stability  FSRS memory stability in days (null until first review)
   * @property {number|null} difficulty FSRS difficulty 1..10 (null until first review)
   * @property {number} intervalDays    Current interval in days (may be fractional)
   * @property {string} dueAt           ISO timestamp the card is next due
   * @property {string|null} lastReviewedAt ISO timestamp of the last review
   * @property {number} reps            Total reviews
   * @property {number} lapses          Times graded "again"
   */

  /**
   * Per-studier SRS state for one card. Keyed by (userId, cardId) — NOT by card owner.
   * @typedef {Syncable & {
   *   userId: string,
   *   cardId: string,
   *   srs: SrsState
   * }} Progress
   */

  /**
   * Append-only; never mutated. Drives analytics and M2 sync. Keyed by studier.
   * @typedef {Syncable & {
   *   userId: string,
   *   cardId: string,
   *   at: string,
   *   grade: Grade,
   *   autoGrade: Grade,
   *   rating: ("easy"|"good"|"tricky"|"didnt")|null,
   *   typedAnswer: string|null,
   *   mode: ReviewMode
   * }} ReviewEvent
   */

  /** @returns {string} */
  function uuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // Fallback (older runtimes): RFC4122-ish v4 from Math.random.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** @param {number} [now] epoch ms (defaults to Date.now()) @returns {string} */
  function toIso(now) {
    return new Date(typeof now === "number" ? now : Date.now()).toISOString();
  }

  /** @param {number} [now] @returns {Syncable} */
  function base(now) {
    const ts = toIso(now);
    return { id: uuid(), updatedAt: ts, deletedAt: null };
  }

  /**
   * @param {{email: string, displayName: string, role?: Role}} input
   * @param {number} [now]
   * @returns {User}
   */
  function createUser(input, now) {
    return Object.assign(base(now), {
      email: input.email,
      displayName: input.displayName,
      role: input.role || "user",
    });
  }

  /**
   * @param {{ownerId: string, name: string, frontLocale?: string, backLocale?: string}} input
   * @param {number} [now]
   * @returns {Deck}
   */
  function createDeck(input, now) {
    return Object.assign(base(now), {
      ownerId: input.ownerId,
      name: input.name,
      frontLocale: input.frontLocale || "es",
      backLocale: input.backLocale || "en",
    });
  }

  /**
   * @param {{ownerId: string, deckId: string, name: string, source?: LessonSource, cardIds?: string[]}} input
   * @param {number} [now]
   * @returns {Lesson}
   */
  function createLesson(input, now) {
    return Object.assign(base(now), {
      ownerId: input.ownerId,
      deckId: input.deckId,
      name: input.name,
      source: input.source || "manual",
      cardIds: input.cardIds ? input.cardIds.slice() : [],
    });
  }

  /**
   * @param {{ownerId: string, deckId: string, front: string, back: string, accepts?: string[], strict?: StrictFlags, strictMode?: "follow"|"exact"|"forgiving", category?: string|null}} input
   * @param {number} [now]
   * @returns {Card}
   */
  function createCard(input, now) {
    return Object.assign(base(now), {
      ownerId: input.ownerId,
      deckId: input.deckId,
      front: input.front,
      back: input.back,
      accepts: input.accepts ? input.accepts.slice() : [],
      strict: input.strict ? Object.assign({}, input.strict) : {},
      strictMode: input.strictMode || "follow",
      category: input.category == null ? null : String(input.category),
    });
  }

  /**
   * @param {{userId: string, cardId: string, srs: SrsState}} input
   * @param {number} [now]
   * @returns {Progress}
   */
  function createProgress(input, now) {
    return Object.assign(base(now), {
      userId: input.userId,
      cardId: input.cardId,
      srs: input.srs,
    });
  }

  /**
   * @param {{userId: string, cardId: string, grade: Grade, mode: ReviewMode, typedAnswer?: string|null, at?: number}} input
   * @param {number} [now]
   * @returns {ReviewEvent}
   */
  function createReviewEvent(input, now) {
    const b = base(now);
    return Object.assign(b, {
      userId: input.userId,
      cardId: input.cardId,
      at: toIso(typeof input.at === "number" ? input.at : now),
      grade: input.grade,
      // autoGrade = the grade the matcher produced; grade = what was persisted
      // after an optional face rating (never lifts a miss). rating = her face, or null.
      autoGrade: input.autoGrade == null ? input.grade : input.autoGrade,
      rating: input.rating == null ? null : input.rating,
      typedAnswer: input.typedAnswer == null ? null : String(input.typedAnswer),
      mode: input.mode,
    });
  }

  /**
   * A scripted-roleplay transcript (R4). Keyed by the STUDIER (same track id as
   * progress), so the admin RLS read makes it parent-visible. Append-only in
   * spirit — turns are added as the chat proceeds; `status` flips to "ended" when
   * it wraps up. `moderation` on a turn records a blocked/redirected learner line.
   * @typedef {Syncable & {
   *   userId: string,
   *   scenarioId: string,
   *   lessonId: string|null,
   *   lessonName: string|null,
   *   startedAt: string,
   *   endedAt: string|null,
   *   status: "active"|"ended",
   *   turns: { role: "ai"|"learner", es: string, en: string|null, at: string, moderation?: {action: string, reason: string} }[]
   * }} RoleplaySession
   */

  /**
   * @param {{userId: string, scenarioId: string, lessonId?: string|null, lessonName?: string|null, turns?: any[]}} input
   * @param {number} [now]
   * @returns {RoleplaySession}
   */
  function createRoleplaySession(input, now) {
    const ts = toIso(now);
    return Object.assign(base(now), {
      userId: input.userId,
      scenarioId: input.scenarioId,
      lessonId: input.lessonId == null ? null : String(input.lessonId),
      lessonName: input.lessonName == null ? null : String(input.lessonName),
      startedAt: ts,
      endedAt: null,
      status: "active",
      turns: input.turns ? input.turns.slice() : [],
    });
  }

  /**
   * Compound key for a per-studier progress / event row.
   * @param {string} userId @param {string} cardId @returns {string}
   */
  function progressKey(userId, cardId) {
    return userId + ":" + cardId;
  }

  // --- study-track ids -----------------------------------------------------
  // A Progress/ReviewEvent `userId` is a *track id*, not always a User.id:
  //  - a plain user id            → that user studying their own content
  //  - `<adminId>@as:<targetId>`  → an admin's OWN persistent track for emulating
  //                                 `targetId` (isolated from the target's real data)
  const TRACK_SEP = "@as:";

  /** @param {string} studierId @param {string} contentOwnerId @returns {string} */
  function makeTrack(studierId, contentOwnerId) {
    return studierId + TRACK_SEP + contentOwnerId;
  }
  /** Base user behind a track id (the admin, or the user themselves). @param {string} trackId @returns {string} */
  function trackBaseUser(trackId) {
    const i = trackId.indexOf(TRACK_SEP);
    return i === -1 ? trackId : trackId.slice(0, i);
  }
  /** The emulated target of a track, or null for an own-content track. @param {string} trackId @returns {string|null} */
  function trackTarget(trackId) {
    const i = trackId.indexOf(TRACK_SEP);
    return i === -1 ? null : trackId.slice(i + TRACK_SEP.length);
  }

  /**
   * Mark a record changed (bumps updatedAt). Mutates and returns it.
   * @template {Syncable} T @param {T} rec @param {number} [now] @returns {T}
   */
  function markUpdated(rec, now) {
    rec.updatedAt = toIso(now);
    return rec;
  }

  /**
   * Soft-delete (tombstone) a record. Mutates and returns it.
   * @template {Syncable} T @param {T} rec @param {number} [now] @returns {T}
   */
  function softDelete(rec, now) {
    const ts = toIso(now);
    rec.deletedAt = ts;
    rec.updatedAt = ts;
    return rec;
  }

  /** @param {Syncable} rec @returns {boolean} */
  function isDeleted(rec) {
    return rec.deletedAt != null;
  }

  return {
    ROLES,
    GRADES,
    LESSON_SOURCES,
    REVIEW_MODES,
    uuid,
    toIso,
    createUser,
    createDeck,
    createLesson,
    createCard,
    createProgress,
    createReviewEvent,
    createRoleplaySession,
    progressKey,
    TRACK_SEP,
    makeTrack,
    trackBaseUser,
    trackTarget,
    markUpdated,
    softDelete,
    isDeleted,
  };
});
