// @ts-check
/**
 * Supabase (PostgREST) transport for the sync engine (M2).
 *
 * Implements the sync transport contract — pullSince(sinceIso) / push(changes)
 * — against the self-hosted Supabase REST API, mapping our documents to the
 * {id, owner, updated_at, deleted_at, doc} rows defined in db/schema.sql.
 *
 * Browser/network code: not covered by node tests; validated once auth + box
 * schema are wired. Requires fetch (browser or Node ≥ 18).
 *
 * Config: { url, anonKey, getAccessToken() } where getAccessToken returns the
 * signed-in user's JWT (from the auth module); RLS does the per-user filtering.
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../model/model.js"));
  } else {
    root.SpanishFlashcardsSupabaseTransport = factory(root.SpanishFlashcardsModel);
  }
})(typeof self !== "undefined" ? self : this, function (model) {
  "use strict";

  const TABLE = {
    users: "users",
    decks: "decks",
    lessons: "lessons",
    cards: "cards",
    progress: "progress",
    reviewEvents: "review_events",
  };

  /** Who owns (may read/write) a row — mirrors db/schema.sql. */
  function ownerOf(collection, rec) {
    if (collection === "progress" || collection === "reviewEvents") return model.trackBaseUser(rec.userId);
    if (collection === "users") return rec.id;
    return rec.ownerId;
  }

  /** @param {{url: string, anonKey: string, getAccessToken: () => (string|Promise<string>)}} cfg */
  function createSupabaseTransport(cfg) {
    const base = cfg.url.replace(/\/+$/, "") + "/rest/v1";

    async function headers(extra) {
      const token = await cfg.getAccessToken();
      return Object.assign(
        {
          apikey: cfg.anonKey,
          Authorization: "Bearer " + (token || cfg.anonKey),
          "Content-Type": "application/json",
        },
        extra || {}
      );
    }

    return {
      /** @param {string} sinceIso @returns {Promise<Record<string, any[]>>} */
      async pullSince(sinceIso) {
        const out = {};
        for (const [collection, table] of Object.entries(TABLE)) {
          const url =
            base + "/" + table + "?select=doc&updated_at=gt." + encodeURIComponent(sinceIso);
          const res = await fetch(url, { headers: await headers() });
          if (!res.ok) throw new Error("pull " + table + " failed: " + res.status + " " + (await res.text()));
          const rows = await res.json();
          out[collection] = rows.map((r) => r.doc);
        }
        return out;
      },

      /** @param {Record<string, any[]>} changes */
      async push(changes) {
        for (const collection of Object.keys(changes)) {
          const records = changes[collection] || [];
          if (!records.length) continue;
          const table = TABLE[collection];
          const rows = records.map((rec) => ({
            id: rec.id,
            owner: ownerOf(collection, rec),
            updated_at: rec.updatedAt,
            deleted_at: rec.deletedAt,
            doc: rec,
          }));
          const res = await fetch(base + "/" + table, {
            method: "POST",
            headers: await headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
            body: JSON.stringify(rows),
          });
          if (!res.ok) throw new Error("push " + table + " failed: " + res.status + " " + (await res.text()));
        }
      },
    };
  }

  return { createSupabaseTransport, TABLE, ownerOf };
});
