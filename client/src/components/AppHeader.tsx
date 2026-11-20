import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar } from './Avatar';
import { Logo } from './Logo';

export function AppHeader({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  async function signOut() {
    await api.logout().catch(() => {});
    setUser(null);
    navigate('/login');
  }

  return (
    <header className="app-header">
      <Link to="/" className="brand" aria-label="Ajaia Docs home">
        <Logo />
        {!children && <span className="brand-name">Ajaia Docs</span>}
      </Link>
      <div className="header-middle">{children}</div>
      <div className="header-actions">
        {actions}
        {user && (
          <div className="user-menu" ref={menuRef}>
            <button className="user-trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu">
              <Avatar name={user.name} email={user.email} size={30} />
              <ChevronDown size={14} className="muted" />
            </button>
            {open && (
              <div className="menu" role="menu">
                <div className="menu-header">
                  <Avatar name={user.name} email={user.email} size={36} />
                  <div><div className="menu-name">{user.name}</div><div className="menu-email">{user.email}</div></div>
                </div>
                <button role="menuitem" className="menu-item" onClick={signOut}><LogOut size={16} /> Sign out</button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
