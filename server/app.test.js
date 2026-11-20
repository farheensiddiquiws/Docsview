import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { openDb } from './db.js';
import { seed, DEMO_PASSWORD } from './seed.js';
import { createApp } from './app.js';
import { createMailerFromEnv } from './mailer.js';

let app;
async function loginAs(email) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: DEMO_PASSWORD }).expect(200);
  return agent;
}

beforeEach(() => {
  const db = openDb(':memory:');
  seed(db);
  app = createApp(db);
});

describe('auth', () => {
  it('rejects bad credentials and unauthenticated requests', async () => {
    await request(app).post('/api/auth/login').send({ email: 'alice@ajaia.test', password: 'nope' }).expect(401);
    await request(app).get('/api/documents').expect(401);
  });
});

describe('documents', () => {
  it('creates, renames, edits and reopens a document with formatting preserved', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    expect(doc).toMatchObject({ title: 'Untitled document', role: 'owner', version: 1 });

    const html = '<h2>Plan</h2><p><strong>bold</strong> <em>it</em> <u>u</u></p><ol><li>one</li></ol>';
    const { body: saved } = await alice.patch(`/api/documents/${doc.id}`)
      .send({ title: '  Q3 plan ', content: html, version: 1 }).expect(200);
    expect(saved).toMatchObject({ title: 'Q3 plan', version: 2 });

    const { body: reopened } = await alice.get(`/api/documents/${doc.id}`).expect(200);
    expect(reopened.content).toBe(html);
  });

  it('strips unsafe markup before persisting', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    const { body } = await alice.patch(`/api/documents/${doc.id}`)
      .send({ content: '<p onclick="x()">hi<script>alert(1)</script><img src=x onerror=alert(1)></p>', version: 1 }).expect(200);
    expect(body.content).toBe('<p>hi</p>');
  });

  it('validates titles and rejects stale writes with 409', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    await alice.patch(`/api/documents/${doc.id}`).send({ title: '   ', version: 1 }).expect(400);
    await alice.patch(`/api/documents/${doc.id}`).send({ content: '<p>a</p>', version: 1 }).expect(200);
    const res = await alice.patch(`/api/documents/${doc.id}`).send({ content: '<p>b</p>', version: 1 }).expect(409);
    expect(res.body.version).toBe(2);
  });
});

describe('sharing and access control', () => {
  it('enforces owner / editor / viewer permissions', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const bob = await loginAs('bob@ajaia.test');
    const carol = await loginAs('carol@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({ title: 'Secret' }).expect(201);

    // Not shared yet: invisible (404, not 403, so existence isn't leaked).
    await bob.get(`/api/documents/${doc.id}`).expect(404);

    await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'editor' }).expect(200);
    await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'carol@ajaia.test', role: 'viewer' }).expect(200);

    // Shared docs show up in the recipient's "shared" list, not "owned".
    const { body: bobList } = await bob.get('/api/documents').expect(200);
    expect(bobList.owned).toHaveLength(0);
    expect(bobList.shared).toEqual([expect.objectContaining({ id: doc.id, role: 'editor', ownerName: 'Alice Owner' })]);

    // Editor can edit; viewer can read but not edit; neither can manage sharing or delete.
    await bob.patch(`/api/documents/${doc.id}`).send({ content: '<p>bob was here</p>', version: 1 }).expect(200);
    const { body: carolView } = await carol.get(`/api/documents/${doc.id}`).expect(200);
    expect(carolView).toMatchObject({ role: 'viewer', content: '<p>bob was here</p>' });
    await carol.patch(`/api/documents/${doc.id}`).send({ content: '<p>no</p>', version: 2 }).expect(403);
    await bob.put(`/api/documents/${doc.id}/shares`).send({ email: 'carol@ajaia.test', role: 'editor' }).expect(403);
    await bob.delete(`/api/documents/${doc.id}`).expect(403);

    // Revoking access removes it.
    const { body: carolUser } = await carol.get('/api/auth/me');
    await alice.delete(`/api/documents/${doc.id}/shares/${carolUser.id}`).expect(200);
    await carol.get(`/api/documents/${doc.id}`).expect(404);
  });

  it('rejects invalid emails or roles', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'not-an-email', role: 'viewer' }).expect(400);
    await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'admin' }).expect(400);
  });

  it('invites an unregistered email, who gets access after signing up', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({ title: 'For Dana' }).expect(201);
    const { body: { shares } } = await alice.put(`/api/documents/${doc.id}/shares`)
      .send({ email: 'Dana@Example.com', role: 'editor' }).expect(200);
    expect(shares).toEqual([expect.objectContaining({ email: 'dana@example.com', pending: 1 })]);

    // The placeholder account can't be logged into before sign-up.
    await request(app).post('/api/auth/login').send({ email: 'dana@example.com', password: '' }).expect(401);

    const dana = request.agent(app);
    await dana.post('/api/auth/signup').send({ name: 'Dana', email: 'dana@example.com', password: 'short' }).expect(400);
    await dana.post('/api/auth/signup').send({ name: 'Dana', email: 'dana@example.com', password: 'longenough' }).expect(201);
    const { body: list } = await dana.get('/api/documents').expect(200);
    expect(list.shared).toEqual([expect.objectContaining({ id: doc.id, role: 'editor' })]);

    // Email is now taken; pending flag cleared for the owner.
    await request(app).post('/api/auth/signup').send({ name: 'X', email: 'dana@example.com', password: 'longenough' }).expect(409);
    const { body: after } = await alice.get(`/api/documents/${doc.id}/shares`).expect(200);
    expect(after[0].pending).toBe(0);
  });
});

describe('share notification email', () => {
  it('emails new recipients with the right link, but not on role changes', async () => {
    const sent = [];
    const db = openDb(':memory:'); seed(db);
    app = createApp(db, { mailer: { send: async (m) => { sent.push(m); } }, appUrl: 'https://docs.example' });
    const alice = await loginAs('alice@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({ title: 'Plan <b>' }).expect(201);

    const r1 = await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'viewer' }).expect(200);
    expect(r1.body.email).toBe('sent');
    expect(sent[0]).toMatchObject({ to: 'bob@ajaia.test', subject: 'Alice Owner shared “Plan <b>” with you' });
    expect(sent[0].text).toContain(`https://docs.example/d/${doc.id}`);
    expect(sent[0].html).toContain('Plan &lt;b&gt;'); // escaped

    await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'new@example.com', role: 'editor' }).expect(200);
    expect(sent[1].text).toContain('https://docs.example/login?signup=1&email=new%40example.com');

    const r3 = await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'editor' }).expect(200);
    expect(r3.body.email).toBe('not_applicable');
    expect(sent).toHaveLength(2);
  });

  it('still shares when email is not configured or fails', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body: doc } = await alice.post('/api/documents').send({}).expect(201);
    const r = await alice.put(`/api/documents/${doc.id}/shares`).send({ email: 'bob@ajaia.test', role: 'viewer' }).expect(200);
    expect(r.body).toMatchObject({ email: 'not_configured', shares: [expect.objectContaining({ email: 'bob@ajaia.test' })] });

    const db = openDb(':memory:'); seed(db);
    app = createApp(db, { mailer: { send: async () => { throw new Error('SMTP down'); } } });
    const a2 = await loginAs('alice@ajaia.test');
    const { body: d2 } = await a2.post('/api/documents').send({}).expect(201);
    const r2 = await a2.put(`/api/documents/${d2.id}/shares`).send({ email: 'bob@ajaia.test', role: 'viewer' }).expect(200);
    expect(r2.body.email).toBe('failed');
    expect(r2.body.shares).toHaveLength(1);
  });
});

describe('mailer configuration', () => {
  it('uses the Brevo HTTPS API when BREVO_API_KEY is set', async () => {
    const calls = [];
    const fakeFetch = async (url, init) => { calls.push({ url, init }); return { ok: true }; };
    const mailer = createMailerFromEnv({ BREVO_API_KEY: 'k', MAIL_FROM_EMAIL: 'me@example.com' }, fakeFetch);
    await mailer.send({ to: 'x@example.com', subject: 'S', text: 'T', html: '<p>H</p>' });
    expect(calls[0].url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(calls[0].init.headers['api-key']).toBe('k');
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ sender: { email: 'me@example.com' }, to: [{ email: 'x@example.com' }], subject: 'S' });
  });

  it('surfaces Brevo errors and returns null when nothing is configured', async () => {
    const mailer = createMailerFromEnv({ BREVO_API_KEY: 'k', MAIL_FROM_EMAIL: 'me@example.com' },
      async () => ({ ok: false, status: 401, text: async () => 'Key not found' }));
    await expect(mailer.send({ to: 'x@example.com', subject: 'S', text: 'T', html: 'H' })).rejects.toThrow(/401/);
    expect(createMailerFromEnv({})).toBeNull();
  });
});

describe('file import', () => {
  it('turns a markdown file into a formatted document', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const md = '# Notes\n\nSome **bold** text\n\n- one\n- two\n';
    const { body } = await alice.post('/api/documents/import')
      .attach('file', Buffer.from(md), 'meeting-notes.md').expect(201);
    expect(body.title).toBe('meeting-notes');
    expect(body.content).toContain('<h1>Notes</h1>');
    expect(body.content).toContain('<strong>bold</strong>');
    expect(body.content).toContain('<li>one</li>');
  });

  it('escapes plain text and rejects unsupported types', async () => {
    const alice = await loginAs('alice@ajaia.test');
    const { body } = await alice.post('/api/documents/import')
      .attach('file', Buffer.from('a <b>\n\nsecond'), 'plain.txt').expect(201);
    expect(body.content).toBe('<p>a &lt;b&gt;</p><p>second</p>');
    const res = await alice.post('/api/documents/import').attach('file', Buffer.from('x'), 'evil.exe').expect(415);
    expect(res.body.error).toMatch(/Unsupported/);
  });
});
