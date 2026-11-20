import nodemailer from 'nodemailer';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Returns a mailer, or null when email isn't configured (sharing still works; the email is just skipped).
 *
 * 1. BREVO_API_KEY + MAIL_FROM_EMAIL: sends over HTTPS. Use this on hosts that block SMTP ports
 *    (e.g. Render's free plan blocks outbound 25/465/587).
 * 2. SMTP_USER + SMTP_PASS: Gmail by default (App Password), or any server via SMTP_HOST/SMTP_PORT.
 */
export function createMailerFromEnv(env = process.env, fetchImpl = globalThis.fetch) {
  const fromName = env.MAIL_FROM_NAME ?? 'Ajaia Docs';

  if (env.BREVO_API_KEY) {
    const fromEmail = env.MAIL_FROM_EMAIL ?? env.SMTP_USER;
    if (!fromEmail) throw new Error('BREVO_API_KEY is set but MAIL_FROM_EMAIL is missing');
    return {
      describe: `Brevo API (from ${fromEmail})`,
      async send({ to, subject, text, html }) {
        const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender: { name: fromName, email: fromEmail }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Brevo responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
      },
    };
  }

  if (env.SMTP_USER && env.SMTP_PASS) {
    const auth = { user: env.SMTP_USER, pass: env.SMTP_PASS.replace(/\s+/g, '') }; // Google shows app passwords with spaces
    // Short timeouts: if the host blocks SMTP we want a quick, visible failure, not a 2-minute hang.
    const timeouts = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 };
    const transport = nodemailer.createTransport(env.SMTP_HOST
      ? { host: env.SMTP_HOST, port: Number(env.SMTP_PORT ?? 587), secure: Number(env.SMTP_PORT) === 465, auth, ...timeouts }
      : { service: 'gmail', auth, ...timeouts });
    const from = `${fromName} <${env.MAIL_FROM_EMAIL ?? env.SMTP_USER}>`;
    return { describe: `SMTP (${env.SMTP_USER})`, send: (msg) => transport.sendMail({ from, ...msg }) };
  }

  return null;
}

export function shareEmail({ to, ownerName, title, role, url, isNewUser }) {
  const access = role === 'editor' ? 'edit' : 'view';
  const cta = isNewUser ? 'Create your account to open it' : 'Open document';
  const note = isNewUser ? `<p style="color:#5f6368;font-size:13px">Sign up with <b>${escapeHtml(to)}</b> and the document will be waiting under “Shared with me”.</p>` : '';
  return {
    to,
    subject: `${ownerName} shared “${title}” with you`,
    text: `${ownerName} shared "${title}" with you (can ${access}).\n\n${cta}: ${url}\n`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px">
      <p><b>${escapeHtml(ownerName)}</b> shared a document with you (can ${access}):</p>
      <p style="font-size:18px;margin:16px 0">📄 ${escapeHtml(title)}</p>
      <p><a href="${escapeHtml(url)}" style="background:#1a5fd0;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">${cta}</a></p>
      ${note}</div>`,
  };
}
