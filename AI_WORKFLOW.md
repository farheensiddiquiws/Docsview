# AI workflow note

## Tools used
- **Claude Code** (agentic coding assistant in VS Code/terminal): scaffolding, implementation, test writing, running the headless-browser verification, drafting docs.
- <!-- TODO: add any other tools you used (ChatGPT, Copilot, …) or delete this line -->

## Where AI materially sped things up
- **Boilerplate across the stack**: Express routes, the React pages, the TipTap toolbar wiring and CSS. These are the parts with a well-known shape where typing speed is the bottleneck.
- **Test matrix**: turning "owner/editor/viewer × read/edit/share/delete" into concrete supertest cases quickly.
- **Verification loop**: the assistant wrote and ran a throwaway Playwright script against the production build. The script logs in as all three users, formats text, reloads, shares, checks the viewer is read-only, and triggers a conflict. It also took the screenshots in `docs/screenshots/`.

## What I changed or rejected
- **Retry loop bug.** The first version of the autosave retried *every* failed save every 3 s. A 400 (for example a too-long title) or a 403 would retry forever. I changed it to retry only transient failures (offline/5xx) and wait for the next edit otherwise.
- **Persistence claims.** The default assumption was "deploy to a free host with SQLite". A free Render instance has an ephemeral disk, so I documented that limitation and the volume-based alternative instead of claiming data is durable.
- **Native dependency.** I chose Node's built-in `node:sqlite` over `better-sqlite3` to avoid native compilation failures on deploy hosts.
- **Typecheck caught a gap.** The CSS side-effect import had no type declaration. Fixed with `vite-env.d.ts`.
- **Scope.** I rejected suggestions to start on real-time collaboration (Yjs). Optimistic versioning with a clear conflict banner was the better fit for the timebox.
- <!-- TODO: add anything you personally reviewed and changed -->

## How correctness was verified
- **Automated:** `npm test` runs 11 API integration tests on an in-memory DB, covering permissions, revocation, invite-by-email then sign-up, notification emails (sent, skipped on role change, escaped, and a share that still succeeds when SMTP fails), sanitization (`<script>`/`onerror` stripped), the 409 on stale writes, validation, and import. `npm run typecheck` checks the client.
- **End-to-end in a real browser** against `npm run build && npm start`. Formatting (H1, bold, underline, bullets) survived a reload byte-for-byte. Bob's edit was visible to Carol. Carol's editor had `contenteditable=false` and no toolbar. The conflict banner appeared for a stale editor. The only console errors were the expected 401 (pre-login `/me`) and 409 (the deliberate conflict).
- **UX:** reviewed screenshots of each screen and tried the flows manually. <!-- TODO: confirm after your own pass -->
