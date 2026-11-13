// @ts-check
/**
 * Baked-in backend config. The anon key is a PUBLIC key — it ships in every
 * Supabase web client and is safe to commit; RLS + the allowlist enforce access.
 * (The service_role key must NEVER appear here.)
 *
 * Resolution (see main.js authConfig): localStorage "aliyah.supabase" overrides
 * this; "aliyah.demo"=1 forces demo. This default only activates on the prod
 * hosts, so local/file dev stays in demo mode. Fill in anonKey to go live.
 */
(function (root) {
  "use strict";
  var PROD = {
    url: "https://api.aliyahsflashcards.com",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzk0MTY4MDQyLCJleHAiOjE5NTE4NDgwNDJ9.EKBYSwtBXRnADzG2HX2aZxLW9PvFFlMoCm3mkEZ6_80", // public anon JWT (role:anon) — safe to ship
  };
  var host = (root.location && root.location.hostname) || "";
  var onProdHost = /(^|\.)aliyahsflashcards\.(com|netlify\.app)$/.test(host);
  var keyLooksReal = typeof PROD.anonKey === "string" && PROD.anonKey.split(".").length === 3;
  root.AliyahConfig = {
    backend: onProdHost && keyLooksReal ? PROD : null,
    // Photo OCR via the Claude-vision Netlify Function. `enabled` is flipped to true
    // once the ANTHROPIC_API_KEY is set in Netlify; until then prod shows a "being set
    // up" state and localhost uses the dev mock.
    ai: { enabled: onProdHost, endpoint: "/.netlify/functions/ai" },
    // Scripted roleplay (R4). Kept INERT (enabled:false) until reviewed on a real
    // device — flip `enabled` to true to surface the "pretend chat" feature. `synced`
    // stays false until the roleplay_sessions table + RLS are applied (db/migrations/
    // 2026-11-13-roleplay.sql); transcripts persist locally until then.
    roleplay: { enabled: false, synced: false },
  };
})(typeof self !== "undefined" ? self : this);
