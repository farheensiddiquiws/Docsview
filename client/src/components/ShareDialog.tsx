import { useEffect, useState, type FormEvent } from 'react';
import { Link2, Loader2, Mail, UserPlus, X } from 'lucide-react';
import { api, type Share, type ShareResult, type User } from '../api';
import { useAuth } from '../auth';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { useToast } from './Toast';

function shareNotice(to: string, r: ShareResult): { text: string; kind: 'success' | 'info' | 'warn' } | null {
  const signup = r.registered ? '' : ' They don’t have an account yet, so the email links them to sign-up.';
  switch (r.email) {
    case 'sent': return { kind: 'success', text: `Invitation email sent to ${to}.${signup}` };
    case 'failed': return { kind: 'warn', text: `Shared, but the email to ${to} couldn’t be sent. Copy the link and send it to them.` };
    case 'not_configured': return { kind: 'info', text: `Shared with ${to}. Email notifications aren’t enabled on this server, so copy the link and send it to them.${r.registered ? '' : ' They should sign up with this email address.'}` };
    default: return null;
  }
}

export function ShareDialog({ docId, title, onClose }: { docId: string; title: string; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Share['role']>('editor');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<ReturnType<typeof shareNotice>>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.shares(docId), api.users()])
      .then(([s, u]) => { setShares(s); setUsers(u); })
      .catch((e) => setError(e.message));
  }, [docId]);

  async function mutate(action: () => Promise<Share[]>) {
    setBusy(true); setError(''); setNotice(null);
    try { setShares(await action()); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    let result: ShareResult | undefined;
    if (await mutate(async () => (result = await api.share(docId, target, role)).shares)) {
      setEmail('');
      setNotice(shareNotice(target, result!));
    }
  }

  async function copyLink() {
    const url = `${location.origin}/d/${docId}`;
    try { await navigator.clipboard.writeText(url); toast('Link copied to clipboard', 'success'); }
    catch { toast(url, 'info'); }
  }

  const sharedIds = new Set(shares?.map((s) => s.userId));
  const suggestions = users.filter((u) => !sharedIds.has(u.id));

  return (
    <Modal title={<>Share “{title}”</>} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={copyLink}><Link2 size={16} /> Copy link</button>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </>}>
      <form onSubmit={add} className="share-form">
        <div className="input-icon">
          <Mail size={16} />
          <input type="email" list="share-users" required placeholder="Add people by email" value={email}
            onChange={(e) => setEmail(e.target.value)} autoFocus aria-label="Email address" />
          <datalist id="share-users">
            {suggestions.map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
          </datalist>
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value as Share['role'])} aria-label="Access level">
          <option value="editor">Can edit</option>
          <option value="viewer">Can view</option>
        </select>
        <button className="btn btn-primary" disabled={busy || !email}>
          {busy ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />} Share
        </button>
      </form>
      <p className="hint">Share with any email address. People without an account get access as soon as they sign up.</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className={`alert alert-${notice.kind}`} role="status">{notice.text}</div>}

      <h3 className="section-label">People with access</h3>
      <ul className="people">
        {user && (
          <li>
            <Avatar name={user.name} email={user.email} />
            <div className="person"><span className="person-name">{user.name}<span className="muted">(you)</span></span><span className="person-email">{user.email}</span></div>
            <span className="role-static">Owner</span>
          </li>
        )}
        {shares === null && <li className="muted small">Loading…</li>}
        {shares?.map((s) => (
          <li key={s.userId}>
            <Avatar name={s.name} email={s.email} />
            <div className="person">
              <span className="person-name">{s.name}{s.pending ? <span className="pill pill-pending">Invited</span> : null}</span>
              <span className="person-email">{s.email}</span>
            </div>
            <select className="role-select" value={s.role} disabled={busy} aria-label={`Access for ${s.name}`}
              onChange={(e) => mutate(async () => (await api.share(docId, s.email, e.target.value as Share['role'])).shares)}>
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button className="icon-btn" disabled={busy} title="Remove access" aria-label={`Remove ${s.name}`}
              onClick={() => mutate(() => api.unshare(docId, s.userId))}><X size={16} /></button>
          </li>
        ))}
      </ul>
      {suggestions.length > 0 && <p className="hint">Demo accounts: {suggestions.map((u) => u.email).join(', ')}</p>}
    </Modal>
  );
}
