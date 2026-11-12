// @ts-check
/**
 * Auth (M2) — Google sign-in + allowlist, over self-hosted GoTrue via supabase-js.
 *
 * Encodes the hard-won M0-A lessons:
 *   - **IMPLICIT flow**, not PKCE: on an installed iOS standalone PWA the PKCE
 *     code-verifier is lost across the Google hop; implicit returns tokens in the
 *     URL fragment with no verifier. (PKCE works on desktop but fails on the phone.)
 *   - **Never call getSession() inside onAuthStateChange** — it re-enters the
 *     auth lock an in-flight exchange holds and deadlocks. Always paint from the
 *     session the listener is handed.
 *   - A no-op `lock` avoids cross-tab lock stalls.
 *
 * A user's app id = their GoTrue auth uid (so RLS uses auth.uid()). Allowlist +
 * role come from the `is_allowed()` / `is_admin()` RPCs (see db/schema.sql).
 *
 * Browser code: validated once wired to the live backend. `supabase` = the
 * supabase-js UMD global (or passed in as cfg.supabase).
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../model/model.js"), root);
  } else {
    root.SpanishFlashcardsAuth = factory(root.SpanishFlashcardsModel, root);
  }
})(typeof self !== "undefined" ? self : this, function (model, root) {
  "use strict";

  /** @param {{url: string, anonKey: string, supabase?: any}} cfg */
  function createAuth(cfg) {
    const lib = cfg.supabase || root.supabase;
    if (!lib || !lib.createClient) throw new Error("supabase-js is required (global `supabase` or cfg.supabase)");

    const client = lib.createClient(cfg.url, cfg.anonKey, {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        lock: async (_name, _ttl, fn) => await fn(),
      },
    });

    const api = {
      client,

      /** @param {string} redirectTo */
      signInWithGoogle(redirectTo) {
        return client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
      },
      signOut() {
        return client.auth.signOut();
      },
      async getSession() {
        const { data } = await client.auth.getSession();
        return data.session;
      },
      /** JWT for the sync transport (null when signed out). */
      async getAccessToken() {
        const { data } = await client.auth.getSession();
        return (data.session && data.session.access_token) || null;
      },
      /** Paint from the handed session — do NOT call getSession() in the callback. */
      onAuthChange(cb) {
        return client.auth.onAuthStateChange((event, session) => cb(event, session));
      },

      async isAllowed() {
        const { data, error } = await client.rpc("is_allowed");
        return !error && !!data;
      },
      async isAdmin() {
        const { data, error } = await client.rpc("is_admin");
        return !error && !!data;
      },

      /**
       * Map the signed-in GoTrue user to our local User (id = auth uid), creating
       * it on first sign-in. Returns null if there is no session.
       * @param {any} store @param {any} session @param {number} [now]
       */
      async ensureUserRecord(store, session, now) {
        if (!session || !session.user) return null;
        const uid = session.user.id;
        let user = await store.getUser(uid);
        if (!user) {
          const admin = await api.isAdmin();
          const meta = session.user.user_metadata || {};
          user = Object.assign(
            model.createUser(
              {
                email: session.user.email || "",
                displayName: meta.full_name || meta.name || session.user.email || "User",
                role: admin ? "admin" : "user",
              },
              now
            ),
            { id: uid }
          );
          await store.putUser(user);
        }
        return user;
      },
    };
    return api;
  }

  return { createAuth };
});
