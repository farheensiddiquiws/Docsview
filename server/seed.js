import { hashPassword } from './auth.js';

export const DEMO_PASSWORD = 'password123';
export const SEED_USERS = [
  { email: 'alice@ajaia.test', name: 'Alice Owner' },
  { email: 'bob@ajaia.test', name: 'Bob Editor' },
  { email: 'carol@ajaia.test', name: 'Carol Viewer' },
];

const WELCOME = `<h1>Welcome to Ajaia Docs</h1>
<p>This document was seeded so you can try the editor straight away. Try <strong>bold</strong>, <em>italic</em> and <u>underline</u>.</p>
<h2>Try sharing</h2>
<ul><li>Open <strong>Share</strong> and add bob@ajaia.test as an editor</li><li>Sign in as Bob in another browser to see it under “Shared with me”</li></ul>`;

/** Idempotently insert demo users (and one welcome doc for Alice). */
export function seed(db) {
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (email, name, password_hash) VALUES (?, ?, ?)');
  for (const u of SEED_USERS) insertUser.run(u.email, u.name, hashPassword(DEMO_PASSWORD));

  const alice = db.prepare('SELECT id FROM users WHERE email = ?').get(SEED_USERS[0].email);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM documents WHERE owner_id = ?').get(alice.id);
  if (n === 0) {
    db.prepare('INSERT INTO documents (id, owner_id, title, content) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), alice.id, 'Welcome to Ajaia Docs', WELCOME);
  }
}
