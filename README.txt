SPANISH FLASH CARDS
===================

WHAT'S INCLUDED
- index.html — the app shell
- app.js — vocabulary, number generation, spaced repetition, answer modes
- manifest.webmanifest — installable web-app metadata
- sw.js — offline caching after the first successful visit

BEST WAY TO SHARE WITH AN IPHONE + LAPTOP
This package is a small static website. Put these four files together on any HTTPS static host.
Good choices include GitHub Pages, Netlify, Cloudflare Pages, or an existing website.

IMPORTANT
Opening index.html directly from the Files app is not the recommended iPhone deployment.
Service workers/offline installation require the app to be served over HTTPS (or localhost).

IPHONE
1. Open the hosted HTTPS address in Safari.
2. Tap Share.
3. Choose "Add to Home Screen."
4. Open it from the new home-screen icon.
5. Allow microphone access if prompted for spoken-answer cards.

LAPTOP
Open the same hosted address in Safari, Chrome, Edge, or Firefox.
Progress is stored locally in that browser/device. It does not automatically sync between
the iPhone and laptop because the app has no account or server-side database.

SPEECH MODE
Speech recognition depends on browser/OS support and permission. If unavailable, the app
automatically presents a typed-answer fallback. Recognition errors can be overridden with
"That's what I said" so they do not incorrectly hurt spaced-repetition progress. Microphone
and recognition-service failures do not count as missed answers and can be retried.

SKIPPING A CARD
Every answer mode includes "Skip / I don't know." A skip reveals the answer and records the
same spaced-repetition miss as an incorrect answer, so that card is shown more often.

PRIVACY
There is no analytics, account, advertising, or remote database in this build. Flash-card
progress is stored in browser localStorage.

DEPLOYING WITH GITHUB PAGES
1. Create a repository (for example: spanish-flashcards).
2. Upload the four app files from this package to the repository root.
3. In GitHub: Settings > Pages.
4. Under Build and deployment, select "Deploy from a branch."
5. Select the main branch and /(root), then Save.
6. GitHub will provide the HTTPS Pages address. Send that address to the student.

NOTE
The vocabulary was transcribed from the two supplied study pages. The number deck emphasizes
structural building blocks through 1000 and representative compound numbers.
