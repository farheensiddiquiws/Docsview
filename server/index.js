import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { seed } from './seed.js';
import { createApp } from './app.js';
import { createMailerFromEnv } from './mailer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isProd = process.env.NODE_ENV === 'production';
const dbFile = process.env.DATABASE_PATH ?? path.join(root, 'data', 'ajaia-docs.db');
const port = Number(process.env.PORT ?? 3001);

const db = openDb(dbFile);
seed(db);

const mailer = createMailerFromEnv();
console.log(mailer ? `Share emails: enabled (${process.env.SMTP_USER})` : 'Share emails: disabled (set SMTP_USER and SMTP_PASS to enable)');
const app = createApp(db, { secureCookies: isProd && process.env.INSECURE_COOKIES !== '1', mailer, appUrl: process.env.APP_URL ?? null });
if (isProd) app.set('trust proxy', 1);

// In production the API also serves the built SPA (single deployable unit).
const clientDist = path.join(root, 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(port, () => console.log(`Ajaia Docs listening on http://localhost:${port} (db: ${dbFile})`));
