# Aliyah's Flashcards

An offline-first, installable **flashcard PWA** for learning Spanish (built subject-agnostically, so it can grow beyond Spanish). It turns photos of vocabulary homework into spaced-repetition flashcards, with cross-device sync for a small, invite-only set of users.

> **Status:** under active rebuild. The local data layer, spaced-repetition scheduler, forgiving answer-matching, and the seeded content are complete and tested; cross-device sync and the on-device OCR import are in progress. See `PROGRESS.md` (in the planning workspace) for the milestone log.

## What it does
- **Spaced repetition & recall.** A Leitner/SM-2-lite scheduler with real due dates; each study session serves the cards that are actually due.
- **Forgiving answers.** Accepts natural variation — accents, case, punctuation, articles, possessives, singular/plural, minor typos, and multiple valid translations in any order — *except* where a card is specifically teaching that form.
- **Lessons = assignments.** Each imported worksheet becomes a selectable lesson; you can study one, several, or all at once, and drill a sub-section.
- **Photo import (in progress).** Snap a vocabulary page → on-device OCR → you review/approve the extracted pairs → it becomes a lesson. Photos are discarded after approval; only the approved word pairs are kept.
- **Multiple users.** Invite-only via Google sign-in and an allowlist. An admin can inspect another user's lessons without affecting their learning progress.

## Privacy
This build **does** use accounts and a server, by design — which supersedes the original standalone version's "no account / no server / no sync" description.
- **Sign-in:** Google, limited to an **allowlist** of invited users.
- **Backend:** a **self-hosted** Supabase instance (the project's own server), not a third-party SaaS database.
- **Data minimization (this is a kid's app):** we store the vocabulary and your learning progress — not photos. Imported images are used only long enough to OCR and for you to approve the pairs, then discarded.
- **Export & delete, from day one:** export all your data as JSON, or delete your account; deletions propagate across your devices.

## Architecture (short version)
- Dependency-free, offline-first PWA; the daily study loop runs entirely locally.
- Local store (IndexedDB) ⇄ self-hosted Supabase via a last-write-wins sync engine (tombstones for deletes).
- Optional, opt-in AI assistance (explanations, example sentences, pronunciation feedback, and the OCR import) runs only at the edges and never inside the study loop; API keys stay server-side.

## Develop
```bash
npm test        # pure logic (model, scheduler, matcher, store, sync, seed, import, account) via node:test
```
No build step. Modules under `src/` are plain dependency-free JavaScript (UMD) with `// @ts-check` type-checking.
