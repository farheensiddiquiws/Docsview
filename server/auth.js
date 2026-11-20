import crypto from 'node:crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false; // invited-but-not-registered accounts have no password yet
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

export const SESSION_COOKIE = 'sid';

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

/** Express middleware: attaches req.user or responds 401. */
export function requireAuth(db) {
  const stmt = db.prepare(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
  );
  return (req, res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    const user = token ? stmt.get(token) : undefined;
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    req.user = user;
    next();
  };
}
