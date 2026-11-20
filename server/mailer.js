import nodemailer from 'nodemailer';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Returns a mailer, or null when SMTP isn't configured (sharing still works; the email is just skipped).
 * Gmail: SMTP_USER=you@gmail.com SMTP_PASS=<16-char app password>. Other providers: also set SMTP_HOST/SMTP_PORT.
 */
export function createMailerFromEnv(env = process.env) {
  if (!env.SMTP_USER || !env.SMTP_PASS) return null;
  const transport = nodemailer.createTransport(env.SMTP_HOST
    ? { host: env.SMTP_HOST, port: Number(env.SMTP_PORT ?? 587), secure: Number(env.SMTP_PORT) === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
    : { service: 'gmail', auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  const from = env.MAIL_FROM ?? `Ajaia Docs <${env.SMTP_USER}>`;
  return { send: (msg) => transport.sendMail({ from, ...msg }) };
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
