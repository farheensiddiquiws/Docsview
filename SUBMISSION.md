# Submission: Ajaia Docs

- **Live URL:** https://ajaia-docs-v6il.onrender.com
- **Walkthrough video:** see `VIDEO_URL.txt`
- **Test accounts** (password `password123`): `alice@ajaia.test` (owner of the seeded doc), `bob@ajaia.test`, `carol@ajaia.test`

## Included

| Item | Location |
|---|---|
| Source code | `server/` (Express + SQLite API), `client/` (React + TipTap UI) |
| Setup and run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| Automated tests | `server/app.test.js` (run `npm test`) |
| Deployment config | `Dockerfile`, `render.yaml` |
| Walkthrough video URL | `VIDEO_URL.txt` |
| Screenshots | `docs/screenshots/` |

## Status

**Working end to end:** login with seeded users; create, rename, edit, autosave, reopen and delete; rich text (bold, italic, underline, strike, H1–H3, bulleted and numbered lists, quotes); .txt/.md/.docx import into a new document; self sign-up; sharing with any email address (pending invite until that person signs up) with optional notification emails over SMTP with Can edit / Can view, role changes and revocation; owned vs. shared lists; server-enforced permissions; read-only viewer mode; stale-edit conflict detection; persistence in SQLite.

**Stretch done:** role-based sharing permissions (viewer/editor).

**Not built (deliberately):** real-time co-editing and presence, comments, version history, export, email verification, attachments.

**Known limitations:** on a free host with an ephemeral disk, documents reset on redeploy or sleep (demo users are re-seeded). Concurrent edits are detected and blocked, not merged.

**Next 2–4 hours:** version history with restore, Markdown/PDF export, a presence indicator, and a Playwright e2e test in CI.
