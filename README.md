# Ajaia Docs

A lightweight collaborative document editor: create, format, import, and share documents with owner, editor and viewer access.

**Live demo:** https://ajaia-docs-v6il.onrender.com · **Walkthrough:** see [VIDEO_URL.txt](VIDEO_URL.txt)

## Demo accounts

All accounts use the password **`password123`**. The login page also has one-click buttons for each account. You can also **create your own account** from the login page.

| User | Email | Suggested use |
|---|---|---|
| Alice Owner | alice@ajaia.test | Owns the seeded "Welcome" doc; share from here |
| Bob Editor | bob@ajaia.test | Share with "Can edit" |
| Carol Viewer | carol@ajaia.test | Share with "Can view" |

**Sharing flow to try:** sign in as Alice, open a doc, click **Share**, add `bob@ajaia.test` (Can edit) and `carol@ajaia.test` (Can view). Then open a private window, sign in as Bob or Carol, and look under **Shared with me**.

## Features

| Area | What works |
|---|---|
| Documents | Create, rename (click the title), edit, delete (owner only), reopen. Autosaves about 0.8 s after you stop typing, with a "Saving… / All changes saved" indicator |
| Formatting | Bold, italic, underline, strikethrough, H1–H3, bulleted and numbered lists, quotes, undo/redo, standard keyboard shortcuts |
| File import | Upload **.txt, .md or .docx (max 2 MB)** to create a new editable document. Markdown and Word formatting (headings, bold, lists) is preserved |
| Sharing | Owner grants **Can edit** or **Can view** to **any email address**, changes roles, and revokes access. If the email has no account yet, it's shown as *Invited · not signed up yet*, and the doc appears for that person as soon as they sign up with that email. If SMTP is configured, recipients get a notification email linking to the doc, or to sign-up for new users (see below). The list page separates **My documents** from **Shared with me** |
| Access control | Enforced on the server for every request. Viewers get a read-only editor. Documents you can't access return 404 |
| Persistence | SQLite. Content is stored as sanitized HTML, so formatting survives reloads |
| Conflict safety | Optimistic versioning: if two people edit the same doc, the stale save is rejected (409) and the user is asked to reload instead of silently overwriting |

## Run locally

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`, so there's nothing native to compile).

```bash
npm install
npm run dev        # API on :3001, web on http://localhost:5173 (proxied)
```

Production mode (a single server that serves both API and UI):

```bash
npm run build
NODE_ENV=production INSECURE_COOKIES=1 npm start   # http://localhost:3001
```

`INSECURE_COOKIES=1` is only needed for plain-http localhost. Deployed over HTTPS, leave it unset.

The database is created at `data/ajaia-docs.db`; override it with `DATABASE_PATH`. Demo users are seeded automatically on startup. To reset everything, delete the `data/` folder.

## Share-notification emails (optional)

Sharing works without email. To also email recipients, set **one** of these (in `.env` locally, or as environment variables on the host):

| Option | Variables | When to use |
|---|---|---|
| **Brevo HTTPS API** (free, 300/day) | `BREVO_API_KEY`, `MAIL_FROM_EMAIL` (a sender verified in Brevo) | Hosts that block SMTP ports, such as **Render's free plan** |
| Gmail SMTP | `SMTP_USER`, `SMTP_PASS` (a Gmail App Password) | Local development or hosts that allow outbound SMTP |

Also set `APP_URL=https://your-deployment-url` so email links point to the live app. On startup the server logs `Share emails: enabled via …`. If sending fails, the share still succeeds, the failure is logged, and the Share dialog tells the owner to send the link manually.

## Tests

```bash
npm test           # API integration tests (vitest + supertest, in-memory SQLite)
npm run typecheck  # frontend TypeScript
```

The tests cover auth, sign-up and invite-by-email, create/rename/edit/reopen with formatting preserved, HTML sanitization, validation, stale-write conflicts, the full owner/editor/viewer permission matrix including revocation, and .md/.txt import plus rejection of unsupported types.

## Deploy

The app is one stateless Node process plus a SQLite file, so any Docker host works:

```bash
docker build -t ajaia-docs . && docker run -p 3001:3001 -v ajaia-data:/data ajaia-docs
```

- **Render:** "New → Blueprint" with this repo uses [render.yaml](render.yaml). On the free plan the disk is ephemeral, so documents reset when the instance redeploys or sleeps. Demo users are always re-seeded.
- **Railway / Fly.io:** deploy the Dockerfile and mount a volume at `/data` for durable storage.

## Project layout

```
server/        Express API: app.js (routes + access control), db.js (schema), auth.js, content.js (sanitize + import), seed.js
server/*.test.js
client/src/    React + TipTap UI: pages/ (Login, DocList, Editor), components/ (Toolbar, ShareDialog, AppHeader), api.ts
docs/          Screenshots
```

See [ARCHITECTURE.md](ARCHITECTURE.md), [AI_WORKFLOW.md](AI_WORKFLOW.md) and [SUBMISSION.md](SUBMISSION.md).
