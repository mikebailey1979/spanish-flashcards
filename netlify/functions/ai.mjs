// @ts-nocheck
/**
 * AI functions for Aliyah's Flashcards (M3 / Phase 6e).
 *
 * The capture pipeline's `importFromPhoto` operation: receives the homework page
 * images, asks Claude (vision) to OCR the printed Spanish vocabulary, pair it with
 * English, and structure it into lessons/sections with per-item uncertainty flags —
 * returning the exact proposal shape the app's segmentation/word-review screens read.
 *
 * The Anthropic API key stays server-side: it is read from the ANTHROPIC_API_KEY
 * Netlify environment variable and never reaches the client. Requests must carry a
 * valid signed-in Supabase access token (Authorization: Bearer ...), so the endpoint
 * can't be used anonymously to burn API credit.
 *
 * Routed by the function adapter (src/ai/ai-adapter.js) as POST
 * /.netlify/functions/ai/<op> with body { args: [images, opts] }.
 */
import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://api.aliyahsflashcards.com";
// The public anon key (role:anon) — safe to ship; used only to call GoTrue /user to
// verify the caller's access token. Overridable via the SUPABASE_ANON_KEY env var.
const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzk0MTY4MDQyLCJleHAiOjE5NTE4NDgwNDJ9.EKBYSwtBXRnADzG2HX2aZxLW9PvFFlMoCm3mkEZ6_80";

const PROMPT = `You are helping a Spanish student turn photos of her textbook/homework vocabulary pages into flashcards.

You are given one or more photos of homework pages, in order (page 1, page 2, ...). For each page, read the PRINTED Spanish vocabulary (ignore her handwriting and her answers). Pair each Spanish term with its English translation — use the translation printed on the page when present, otherwise supply the correct translation yourself. Group the words into lessons (usually one lesson per distinct assignment / unit / page) and, within a lesson, into sections by the printed sub-heading or category.

Return ONLY a JSON object (no prose, no markdown fences) with exactly this shape:
{
  "lessons": [
    {
      "name": "<short lesson name; use the page's visible title, e.g. \\"Las frutas — Fruits\\", else a sensible short name>",
      "pages": [<1-based page numbers this lesson's words came from>],
      "sections": [
        {
          "cat": "<section / category name from the page's sub-heading, else a short sensible category>",
          "words": [
            { "front": "<Spanish term as printed>", "back": "<English>", "confidence": "low", "duplicate": true }
          ]
        }
      ]
    }
  ],
  "unreadablePages": [<1-based page numbers that are too blurry/dark to read>]
}

Rules:
- "front" is the Spanish term as printed (keep a leading article like "la"/"el" when the page shows one). "back" is the English.
- Include "confidence":"low" ONLY for a word you are unsure about (blurry, ambiguous, or you had to guess); omit the field otherwise.
- Include "duplicate":true ONLY for a word whose Spanish term already appeared earlier in this result; omit it otherwise.
- If a page has no readable printed Spanish, add its number to "unreadablePages" and do not invent words for it.
- If NO page has any readable printed Spanish vocabulary, return {"lessons": [], "unreadablePages": [<all page numbers>]}.
- "unreadablePages" may be [] when every page read fine.`;

function parseDataUrl(u) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(u || ""));
  return m ? { media_type: m[1], data: m[2] } : null;
}

async function verifyUser(authz) {
  if (!authz) return false;
  try {
    const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: SUPABASE_ANON, Authorization: authz },
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function importFromPhoto(images) {
  const blocks = [];
  for (const u of images || []) {
    const p = parseDataUrl(u);
    if (p) blocks.push({ type: "image", source: { type: "base64", media_type: p.media_type, data: p.data } });
  }
  if (!blocks.length) return { lessons: [], unreadablePages: [] };

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  const resp = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: [...blocks, { type: "text", text: PROMPT }] }],
  });

  const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  const slice = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  const proposal = JSON.parse(slice);
  proposal.lessons = Array.isArray(proposal.lessons) ? proposal.lessons : [];
  if (!Array.isArray(proposal.unreadablePages)) proposal.unreadablePages = [];
  return proposal;
}

export const handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "method not allowed" }) };
    const op = String(event.path || "").split("/").filter(Boolean).pop();
    const h = event.headers || {};
    const authz = h.authorization || h.Authorization || "";
    if (!(await verifyUser(authz))) return { statusCode: 401, headers, body: JSON.stringify({ error: "not signed in" }) };

    const body = JSON.parse(event.body || "{}");
    const args = Array.isArray(body.args) ? body.args : [];
    if (op === "importFromPhoto") {
      const proposal = await importFromPhoto(args[0]);
      return { statusCode: 200, headers, body: JSON.stringify(proposal) };
    }
    return { statusCode: 404, headers, body: JSON.stringify({ error: "unknown op: " + op }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String((e && e.message) || e) }) };
  }
};
