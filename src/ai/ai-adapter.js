// @ts-check
/**
 * AI adapter (M3+) — the single seam every AI feature sits behind (see
 * AI-FEATURES.md). All calls go through a Netlify Function so the API key stays
 * server-side; the adapter is pluggable (Claude primary; Azure for OCR /
 * pronunciation; Tesseract offline). The deterministic study loop NEVER calls it.
 *
 * Operations (all async, all optional per provider):
 *   importFromPhoto(images, opts)   -> { lesson, uncertain[] }  (OCR + pair + structure)
 *   explainAnswer(card, typed, opts)-> string                   (why it was wrong)
 *   enrichCard(card, opts)          -> { exampleSentence?, mnemonic?, pronunciationNote? }
 *   assessPronunciation(audio, card)-> { score, feedback }      (Azure + Claude coaching)
 *
 * Until wired, `createStubAiAdapter()` rejects with a clear message so callers
 * fail loudly rather than silently. A real adapter is injected at M3.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SpanishFlashcardsAiAdapter = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const OPERATIONS = ["importFromPhoto", "explainAnswer", "enrichCard", "suggestTranslation", "adjudicateAnswer", "speechToken", "coachPronunciation", "roleplayTurn"];

  /** A placeholder adapter whose every op rejects — real impl injected at M3. */
  function createStubAiAdapter() {
    const adapter = {};
    for (const op of OPERATIONS) {
      adapter[op] = async () => {
        throw new Error("AI adapter not wired yet: " + op + " (M3 — routes through a Netlify Function)");
      };
    }
    return adapter;
  }

  /**
   * Build an adapter from a Netlify-Function endpoint. Each op POSTs to
   * `${endpoint}/<op>`; the function holds the provider key and picks the engine.
   * (Transport only — not exercised until the function exists.)
   * @param {{endpoint: string, getAccessToken?: () => (string|Promise<string>)}} cfg
   */
  function createFunctionAiAdapter(cfg) {
    const base = cfg.endpoint.replace(/\/+$/, "");
    const adapter = {};
    for (const op of OPERATIONS) {
      adapter[op] = async (...args) => {
        const headers = { "Content-Type": "application/json" };
        if (cfg.getAccessToken) {
          const token = await cfg.getAccessToken();
          if (token) headers.Authorization = "Bearer " + token;
        }
        const res = await fetch(base + "/" + op, {
          method: "POST",
          headers,
          body: JSON.stringify({ args }),
        });
        if (!res.ok) throw new Error(op + " failed: " + res.status + " " + (await res.text()));
        return res.json();
      };
    }
    return adapter;
  }

  return { OPERATIONS, createStubAiAdapter, createFunctionAiAdapter };
});
