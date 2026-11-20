import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { FileUp, Loader2, ShieldCheck, Users } from 'lucide-react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Avatar } from '../components/Avatar';
import { Logo } from '../components/Logo';

const DEMO_USERS = [
  { email: 'alice@ajaia.test', name: 'Alice Owner', hint: 'Owns the sample document' },
  { email: 'bob@ajaia.test', name: 'Bob Editor', hint: 'Try sharing with edit access' },
  { email: 'carol@ajaia.test', name: 'Carol Viewer', hint: 'Try sharing with view access' },
];
const DEMO_PASSWORD = 'password123';

export function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  // Links from share emails look like /login?signup=1&email=…&next=/d/<id>
  const [params] = useSearchParams();
  const rawNext = params.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const [mode, setMode] = useState<'signin' | 'signup'>(params.get('signup') ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  if (user) return <Navigate to={next} replace />;
  const isSignup = mode === 'signup';

  async function submit(e: string, p: string, signup = false, key = 'form') {
    setBusy(key); setError('');
    try {
      setUser(signup ? await api.signup(name, e, p) : await api.login(e, p));
      navigate(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally { setBusy(null); }
  }

  const onSubmit = (ev: FormEvent) => { ev.preventDefault(); submit(email, password, isSignup); };

  return (
    <div className="auth">
      <aside className="auth-hero">
        <div className="auth-hero-inner">
          <div className="auth-brand"><Logo size={36} /> Ajaia Docs</div>
          <h1>Write together.<br />Ship faster.</h1>
          <p>A focused workspace for team documents: rich-text editing, quick imports and simple sharing.</p>
          <ul className="auth-features">
            <li><span><Users size={18} /></span><div><strong>Share with anyone</strong><br />Invite by email with edit or view access.</div></li>
            <li><span><FileUp size={18} /></span><div><strong>Bring your files</strong><br />Import .docx, .md and .txt with formatting intact.</div></li>
            <li><span><ShieldCheck size={18} /></span><div><strong>Never lose work</strong><br />Autosave with conflict protection.</div></li>
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-mobile-brand"><Logo size={32} /> Ajaia Docs</div>
          <h2>{isSignup ? 'Create your account' : 'Welcome back'}</h2>
          <p className="muted">{isSignup
            ? 'Documents already shared with your email will be waiting for you.'
            : 'Sign in to continue to your documents.'}</p>

          <form onSubmit={onSubmit} className="form">
            {isSignup && (
              <div className="field"><label htmlFor="name">Full name</label>
                <input id="name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Jane Doe" /></div>
            )}
            <div className="field"><label htmlFor="email">Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@company.com" /></div>
            <div className="field"><label htmlFor="password">Password</label>
              <input id="password" type="password" required minLength={isSignup ? 8 : undefined} value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'}
                placeholder={isSignup ? 'At least 8 characters' : '••••••••'} /></div>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <button className="btn btn-primary btn-lg btn-block" disabled={!!busy}>
              {busy === 'form' && <Loader2 size={16} className="spin" />}
              {isSignup ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="auth-switch">
            {isSignup ? 'Already have an account?' : 'New to Ajaia Docs?'}{' '}
            <button type="button" className="link-btn" onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError(''); }}>
              {isSignup ? 'Sign in' : 'Create an account'}
            </button>
          </p>

          {!isSignup && (
            <div className="demo">
              <div className="divider"><span>Demo accounts</span></div>
              <div className="demo-list">
                {DEMO_USERS.map((u) => (
                  <button key={u.email} type="button" className="demo-user" disabled={!!busy}
                    aria-label={`Sign in as ${u.name}`} onClick={() => submit(u.email, DEMO_PASSWORD, false, u.email)}>
                    <Avatar name={u.name} email={u.email} size={34} />
                    <span className="demo-text"><strong>{u.name}</strong><span>{u.hint}</span></span>
                    {busy === u.email ? <Loader2 size={16} className="spin" /> : <span className="demo-cta">Sign in</span>}
                  </button>
                ))}
              </div>
              <p className="muted small center-text">Password for all demo accounts: <code>{DEMO_PASSWORD}</code></p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
