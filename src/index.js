// @ts-check
/**
 * M1 data-layer barrel. Node consumers can `require("./src")` to get every
 * module; the browser PWA loads the individual UMD scripts and uses the globals
 * (SpanishFlashcardsModel, …Scheduler, …Matcher, …Store, …IO, …Seed, adapters).
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory({
      model: require("./model/model.js"),
      scheduler: require("./srs/scheduler.js"),
      matcher: require("./match/matcher.js"),
      store: require("./store/store.js"),
      memoryAdapter: require("./store/memory-adapter.js"),
      idbAdapter: require("./store/idb-adapter.js"),
      io: require("./io/export-import.js"),
      seed: require("./seed/seed.js"),
    });
  } else {
    root.SpanishFlashcards = factory({
      model: root.SpanishFlashcardsModel,
      scheduler: root.SpanishFlashcardsScheduler,
      matcher: root.SpanishFlashcardsMatcher,
      store: root.SpanishFlashcardsStore,
      memoryAdapter: root.SpanishFlashcardsMemoryAdapter,
      idbAdapter: root.SpanishFlashcardsIdbAdapter,
      io: root.SpanishFlashcardsIO,
      seed: root.SpanishFlashcardsSeed,
    });
  }
})(typeof self !== "undefined" ? self : this, function (mods) {
  "use strict";
  return mods;
});
