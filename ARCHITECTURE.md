# Architecture note

## Shape

```
Browser (React + TipTap) ──fetch /api/*, session cookie──▶ Express ──▶ SQLite (node:sqlite)
          ▲                                                   │
          └──────────── built SPA served by the same process ◀┘
```

It runs as one process and one deployable unit. Reviewers get a single URL, there is no CORS, and cookies are same-origin.

## What I prioritized, and why

1. **The editing loop has to feel trustworthy.** TipTap (ProseMirror) gives solid rich text without building an editor. Most of the effort went into the save pipeline. Edits are debounced and coalesced, only one request is in flight at a time, the user sees the save state, transient failures are retried, and the user is warned before closing a tab with unsaved work. A doc editor that loses text is worse than one with fewer buttons.
2. **Access control lives in one function on the server.** `loadDoc(id, user, requiredRole)` in `server/app.js` is the only place that decides who can read, edit or manage a doc. Every route calls it. The UI hides controls for convenience, but the server enforces. Docs you can't access return **404, not 403**, so their existence isn't leaked.
3. **Tests target the riskiest logic**: the permission matrix, sanitization, conflict detection and import. Pixel-level UI tests were lower value for this timebox.

## Key decisions and tradeoffs

| Decision | Why | Cost |
|---|---|---|
| Store **sanitized HTML** (not ProseMirror JSON) | Round-trips directly with TipTap, imports (Markdown/DOCX → HTML) fit naturally, and it's human-readable in the DB | Less structured than JSON for future features like comments anchored to nodes |
| **Server-side allowlist sanitization** (`sanitize-html`) on every write and import | Content is shared between users, so stored XSS is the main real risk | Unknown formatting from imported files is dropped |
| **Optimistic concurrency** (`version` column, `UPDATE … WHERE version = ?`) | Prevents silent overwrites when two people edit, at about 10 lines of cost | The second writer has to reload. Not real-time merging |
| **SQLite via built-in `node:sqlite`** | Zero infrastructure, no native build step, easy for reviewers | Single instance. Postgres would be next for horizontal scale |
| **Seeded users + sign-up + real sessions** (scrypt hashes, httpOnly cookie) | Sharing needs distinct identities. A proper login takes little extra time over a fake user switcher | No password reset, email verification or OAuth |
| **Share with any email** via a passwordless placeholder user that is claimed at sign-up | Reuses the same `document_shares` table and permission check. No separate invites table and no merge logic | No email delivery, and no email verification, so whoever signs up first with that address gets the access |
| **Import creates a new doc** (.txt/.md/.docx) | It's the most product-relevant upload ("bring my existing notes in") and reuses the sanitize path | No attachments or import-into-existing-doc |
| **Viewer/editor roles** (the optional stretch item) | Small extra cost because the permission model was already centralized | Only two roles. No commenter role |

## Intentionally deprioritized

- **Real-time co-editing** (CRDT/Yjs, cursors). This is the biggest piece of Google Docs, and a half-working version would be worse than clean conflict detection.
- Comments, suggestions, version history, export, search, folders.
- Email verification. Share notifications are sent over optional SMTP (Gmail App Password), and sharing never depends on email succeeding.
- Pagination of the doc list, rate limiting, CSRF tokens. SameSite=Lax cookies plus JSON-only mutation endpoints cover the demo threat model.

## Next 2–4 hours

1. Version history: snapshot on each save into a `document_versions` table, with a restore UI. The `version` column already exists.
2. Export to Markdown/PDF.
3. Presence indicator ("Bob is viewing") via SSE as a step toward real-time collaboration.
4. Playwright e2e test in CI for the create → share → view-only flow (it was verified manually and with an ad-hoc script during development).
