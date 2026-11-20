import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2, FileText, FileUp, Loader2, Search, Trash2, Upload, Users } from 'lucide-react';
import { api, ApiError, SUPPORTED_UPLOADS, timeAgo, type Role } from '../api';
import { useAuth } from '../auth';
import { AppHeader } from '../components/AppHeader';
import { Avatar } from '../components/Avatar';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';

type Row = { id: string; title: string; updatedAt: string; ownerName: string; ownerEmail?: string; access: Role; shareCount: number };
type Tab = 'all' | 'owned' | 'shared';
const ACCESS_LABEL: Record<Role, string> = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' };

export function DocListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'create' | 'import' | null>(null);
  const [dragging, setDragging] = useState(false);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = () => api.listDocs()
    .then(({ owned, shared }) => setRows([
      ...owned.map((d) => ({ ...d, ownerName: user?.name ?? 'Me', ownerEmail: user?.email, access: 'owner' as Role })),
      ...shared.map((d) => ({ ...d, access: d.role as Role, shareCount: 0 })),
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))))
    .catch((e) => { setRows([]); toast(e.message, 'error'); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => ({
    all: rows?.length ?? 0,
    owned: rows?.filter((r) => r.access === 'owner').length ?? 0,
    shared: rows?.filter((r) => r.access !== 'owner').length ?? 0,
  }), [rows]);

  const visible = useMemo(() => (rows ?? [])
    .filter((r) => tab === 'all' || (tab === 'owned') === (r.access === 'owner'))
    .filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase())), [rows, tab, query]);

  async function run(kind: 'create' | 'import', action: () => Promise<{ id: string }>) {
    setBusy(kind);
    try { navigate(`/d/${(await action()).id}`); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error'); }
    finally { setBusy(null); }
  }

  const importFile = (file?: File) => { if (file) run('import', () => api.importDoc(file)); };

  function onDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false);
    importFile(e.dataTransfer.files?.[0]);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteDoc(toDelete.id);
      toast(`“${toDelete.title}” was deleted`, 'success');
      setToDelete(null);
      load();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setDeleting(false); }
  }

  return (
    <div className="app-shell" onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.relatedTarget) setDragging(false); }} onDrop={onDrop}>
      <AppHeader />
      <main className="container">
        <div className="page-head">
          <div>
            <h1>Documents</h1>
            <p className="muted">Create, import and share documents with your team.</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-secondary" disabled={!!busy} onClick={() => fileInput.current?.click()}
              title="Supports .txt, .md and .docx up to 2 MB">
              {busy === 'import' ? <Loader2 size={16} className="spin" /> : <Upload size={16} />} Import file
            </button>
            <button className="btn btn-primary" disabled={!!busy} onClick={() => run('create', () => api.createDoc())}>
              {busy === 'create' ? <Loader2 size={16} className="spin" /> : <FilePlus2 size={16} />} New document
            </button>
            <input ref={fileInput} type="file" accept={SUPPORTED_UPLOADS} hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; importFile(f); }} />
          </div>
        </div>

        <div className="toolbar-row">
          <div className="tabs" role="tablist">
            {(['all', 'owned', 'shared'] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'all' ? 'All' : t === 'owned' ? 'Owned by me' : 'Shared with me'}
                <span className="tab-count">{counts[t]}</span>
              </button>
            ))}
          </div>
          <div className="search">
            <Search size={16} />
            <input type="search" placeholder="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search documents" />
          </div>
        </div>

        <div className="table-card">
          <table className="doc-table">
            {(rows === null || visible.length > 0) && <thead>
              <tr><th>Name</th><th className="col-owner">Owner</th><th className="col-access">Access</th><th className="col-date">Last modified</th><th aria-label="Actions" /></tr>
            </thead>}
            <tbody>
              {rows === null && [0, 1, 2].map((i) => (
                <tr key={i} className="skeleton-row"><td colSpan={5}><span className="skeleton" /></td></tr>
              ))}
              {visible.map((d) => (
                <tr key={d.id} onClick={() => navigate(`/d/${d.id}`)}>
                  <td>
                    <Link to={`/d/${d.id}`} className="doc-name" onClick={(e) => e.stopPropagation()}>
                      <span className={`doc-icon ${d.access !== 'owner' ? 'shared' : ''}`}>{d.access === 'owner' ? <FileText size={18} /> : <Users size={18} />}</span>
                      <span className="doc-title">{d.title}</span>
                    </Link>
                  </td>
                  <td className="col-owner">
                    <span className="owner-cell"><Avatar name={d.ownerName} email={d.ownerEmail} size={24} />{d.access === 'owner' ? 'You' : d.ownerName}</span>
                  </td>
                  <td className="col-access">
                    <span className={`pill pill-${d.access}`}>{ACCESS_LABEL[d.access]}</span>
                    {d.shareCount > 0 && <span className="muted small"> · shared with {d.shareCount}</span>}
                  </td>
                  <td className="col-date muted">{timeAgo(d.updatedAt)}</td>
                  <td className="col-actions">
                    {d.access === 'owner' && (
                      <button className="icon-btn danger" aria-label={`Delete ${d.title}`} title="Delete"
                        onClick={(e) => { e.stopPropagation(); setToDelete(d); }}><Trash2 size={16} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows !== null && visible.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">{query ? <Search size={28} /> : tab === 'shared' ? <Users size={28} /> : <FileText size={28} />}</div>
              <h3>{query ? 'No matching documents' : tab === 'shared' ? 'Nothing shared with you yet' : 'No documents yet'}</h3>
              <p className="muted">{query ? `Nothing matches “${query}”.`
                : tab === 'shared' ? 'When someone shares a document with you, it will appear here.'
                  : 'Create a blank document, or drop a .docx, .md or .txt file anywhere on this page.'}</p>
              {!query && tab !== 'shared' && (
                <button className="btn btn-primary" onClick={() => run('create', () => api.createDoc())}><FilePlus2 size={16} /> New document</button>
              )}
            </div>
          )}
        </div>
        <p className="muted small footnote">Tip: drag a .docx, .md or .txt file (max 2 MB) anywhere onto this page to import it as a new document.</p>
      </main>

      {dragging && (
        <div className="drop-overlay"><div className="drop-box"><FileUp size={36} /><strong>Drop to import</strong><span>.docx, .md or .txt, up to 2 MB</span></div></div>
      )}

      {toDelete && (
        <Modal title="Delete document?" size="sm" onClose={() => !deleting && setToDelete(null)}
          footer={<>
            <button className="btn btn-secondary" onClick={() => setToDelete(null)} disabled={deleting}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 size={16} className="spin" />} Delete
            </button>
          </>}>
          <p>“<strong>{toDelete.title}</strong>” will be permanently deleted for you and everyone it’s shared with. This can’t be undone.</p>
        </Modal>
      )}
    </div>
  );
}
