import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import { SESSION_COOKIE, createSession, hashPassword, requireAuth, verifyPassword } from './auth.js';
import { shareEmail } from './mailer.js';
import { MAX_UPLOAD_BYTES, UnsupportedFileError, fileToDocument, sanitizeContent } from './content.js';

const MAX_TITLE = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw) {
  if (typeof raw !== 'string' || !EMAIL_RE.test(raw.trim())) throw new HttpError(400, 'Enter a valid email address');
  return raw.trim().toLowerCase();
}
const MAX_CONTENT_BYTES = 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function validateTitle(raw) {
  if (typeof raw !== 'string') throw new HttpError(400, 'Title must be a string');
  const title = raw.trim();
  if (!title) throw new HttpError(400, 'Title cannot be empty');
  if (title.length > MAX_TITLE) throw new HttpError(400, `Title must be at most ${MAX_TITLE} characters`);
  return title;
}

export function createApp(db, { secureCookies = false, mailer = null, appUrl = null } = {}) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  const auth = requireAuth(db);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  // ---- Access control: the single place that decides who can do what ----
  const getDoc = db.prepare('SELECT d.*, u.name AS owner_name, u.email AS owner_email FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = ?');
  const getShare = db.prepare('SELECT role FROM document_shares WHERE document_id = ? AND user_id = ?');

  /** Returns { doc, role } or throws 404 (we don't reveal existence of docs you can't see). */
  function loadDoc(docId, user, required = 'viewer') {
    const doc = getDoc.get(docId);
    let role = null;
    if (doc) role = doc.owner_id === user.id ? 'owner' : getShare.get(docId, user.id)?.role ?? null;
    if (!role) throw new HttpError(404, 'Document not found');
    const rank = { viewer: 1, editor: 2, owner: 3 };
    if (rank[role] < rank[required]) {
      throw new HttpError(403, required === 'owner' ? 'Only the owner can do that' : 'You have view-only access');
    }
    return { doc, role };
  }

  const docDto = (doc, role) => ({
    id: doc.id, title: doc.title, content: doc.content, version: doc.version,
    createdAt: doc.created_at, updatedAt: doc.updated_at, role,
    owner: { name: doc.owner_name, email: doc.owner_email },
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // ---- Auth ----
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') throw new HttpError(400, 'Email and password are required');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, 'Invalid email or password');
    const token = createSession(db, user.id);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 7 * 864e5 });
    res.json({ id: user.id, email: user.email, name: user.name });
  });

  // Sign-up. If someone was already invited to documents with this email, the placeholder
  // account created at invite time is "claimed", so their shared docs appear immediately.
  app.post('/api/auth/signup', (req, res) => {
    const { name, password } = req.body ?? {};
    const email = normalizeEmail(req.body?.email);
    if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'Name is required');
    if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    const existing = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
    if (existing?.password_hash) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
    let userId;
    if (existing) {
      db.prepare('UPDATE users SET name = ?, password_hash = ? WHERE id = ?').run(name.trim().slice(0, 100), hashPassword(password), existing.id);
      userId = existing.id;
    } else {
      userId = Number(db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
        .run(email, name.trim().slice(0, 100), hashPassword(password)).lastInsertRowid);
    }
    const token = createSession(db, userId);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 7 * 864e5 });
    res.status(201).json(db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(userId));
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(SESSION_COOKIE).status(204).end();
  });

  app.get('/api/auth/me', auth, (req, res) => res.json(req.user));

  app.get('/api/users', auth, (req, res) => {
    res.json(db.prepare("SELECT id, email, name FROM users WHERE id != ? AND password_hash != '' ORDER BY name").all(req.user.id));
  });

  // ---- Documents ----
  app.get('/api/documents', auth, (req, res) => {
    const owned = db.prepare(
      `SELECT id, title, updated_at AS updatedAt,
              (SELECT COUNT(*) FROM document_shares s WHERE s.document_id = d.id) AS shareCount
       FROM documents d WHERE owner_id = ? ORDER BY updated_at DESC`).all(req.user.id);
    const shared = db.prepare(
      `SELECT d.id, d.title, d.updated_at AS updatedAt, s.role, u.name AS ownerName
       FROM document_shares s JOIN documents d ON d.id = s.document_id JOIN users u ON u.id = d.owner_id
       WHERE s.user_id = ? ORDER BY d.updated_at DESC`).all(req.user.id);
    res.json({ owned, shared });
  });

  const insertDoc = db.prepare('INSERT INTO documents (id, owner_id, title, content) VALUES (?, ?, ?, ?)');
  function createDoc(user, title, content) {
    const id = crypto.randomUUID();
    insertDoc.run(id, user.id, title, content);
    return docDto(getDoc.get(id), 'owner');
  }

  app.post('/api/documents', auth, (req, res) => {
    const title = req.body?.title === undefined ? 'Untitled document' : validateTitle(req.body.title);
    res.status(201).json(createDoc(req.user, title, ''));
  });

  app.post('/api/documents/import', auth, upload.single('file'), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Attach a file in the "file" field');
    if (req.file.size === 0) throw new HttpError(400, 'The file is empty');
    const { title, content } = await fileToDocument(req.file.originalname, req.file.buffer);
    res.status(201).json(createDoc(req.user, title, content));
  });

  app.get('/api/documents/:id', auth, (req, res) => {
    const { doc, role } = loadDoc(req.params.id, req.user);
    res.json(docDto(doc, role));
  });

  app.patch('/api/documents/:id', auth, (req, res) => {
    const { doc } = loadDoc(req.params.id, req.user, 'editor');
    const { title, content, version } = req.body ?? {};
    if (!Number.isInteger(version)) throw new HttpError(400, 'version (integer) is required');
    if (title === undefined && content === undefined) throw new HttpError(400, 'Nothing to update');
    const nextTitle = title === undefined ? doc.title : validateTitle(title);
    let nextContent = doc.content;
    if (content !== undefined) {
      if (typeof content !== 'string') throw new HttpError(400, 'Content must be a string');
      if (Buffer.byteLength(content) > MAX_CONTENT_BYTES) throw new HttpError(413, 'Document is too large (max 1 MB)');
      nextContent = sanitizeContent(content);
    }
    // Optimistic concurrency: only write if nobody else saved since this client loaded the doc.
    const result = db.prepare(
      `UPDATE documents SET title = ?, content = ?, version = version + 1, updated_at = datetime('now')
       WHERE id = ? AND version = ?`).run(nextTitle, nextContent, doc.id, version);
    if (result.changes === 0) {
      const latest = getDoc.get(doc.id);
      return res.status(409).json({ error: 'This document was changed by someone else. Reload to get the latest version.', version: latest.version });
    }
    const { role } = loadDoc(doc.id, req.user);
    res.json(docDto(getDoc.get(doc.id), role));
  });

  app.delete('/api/documents/:id', auth, (req, res) => {
    const { doc } = loadDoc(req.params.id, req.user, 'owner');
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
    res.status(204).end();
  });

  // ---- Sharing (owner only) ----
  const listShares = db.prepare(
    `SELECT u.id AS userId, u.email, u.name, s.role, (u.password_hash = '') AS pending FROM document_shares s JOIN users u ON u.id = s.user_id
     WHERE s.document_id = ? ORDER BY u.name`);

  app.get('/api/documents/:id/shares', auth, (req, res) => {
    const { doc } = loadDoc(req.params.id, req.user, 'owner');
    res.json(listShares.all(doc.id));
  });

  app.put('/api/documents/:id/shares', auth, async (req, res) => {
    const { doc } = loadDoc(req.params.id, req.user, 'owner');
    const { email, role } = req.body ?? {};
    if (!['viewer', 'editor'].includes(role)) throw new HttpError(400, 'Role must be "viewer" or "editor"');
    const normalized = normalizeEmail(email);
    let target = db.prepare("SELECT id, password_hash != '' AS registered FROM users WHERE email = ?").get(normalized);
    if (!target) {
      // Not registered yet: create a passwordless placeholder that they claim by signing up.
      const id = db.prepare("INSERT INTO users (email, name, password_hash) VALUES (?, ?, '')")
        .run(normalized, normalized.split('@')[0]).lastInsertRowid;
      target = { id: Number(id), registered: 0 };
    }
    const alreadyShared = Boolean(getShare.get(doc.id, target.id));
    if (target.id === req.user.id) throw new HttpError(400, 'You already own this document');
    db.prepare(
      `INSERT INTO document_shares (document_id, user_id, role) VALUES (?, ?, ?)
       ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`).run(doc.id, target.id, role);

    // Notify only on a new share (not on role changes). Email failure never fails the share itself.
    let emailStatus = 'not_applicable';
    if (!alreadyShared) {
      if (!mailer) emailStatus = 'not_configured';
      else {
        const base = appUrl ?? `${req.protocol}://${req.get('host')}`;
        const next = `/d/${doc.id}`;
        const url = target.registered ? base + next
          : `${base}/login?signup=1&email=${encodeURIComponent(normalized)}&next=${encodeURIComponent(next)}`;
        try {
          await mailer.send(shareEmail({ to: normalized, ownerName: req.user.name, title: doc.title, role, url, isNewUser: !target.registered }));
          emailStatus = 'sent';
        } catch (err) {
          console.error('Share email failed:', err.message);
          emailStatus = 'failed';
        }
      }
    }
    res.json({ shares: listShares.all(doc.id), email: emailStatus, registered: Boolean(target.registered) });
  });

  app.delete('/api/documents/:id/shares/:userId', auth, (req, res) => {
    const { doc } = loadDoc(req.params.id, req.user, 'owner');
    db.prepare('DELETE FROM document_shares WHERE document_id = ? AND user_id = ?').run(doc.id, Number(req.params.userId));
    res.json(listShares.all(doc.id));
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // ---- Errors → consistent JSON ----
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof UnsupportedFileError) return res.status(415).json({ error: err.message });
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 2 MB)' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
