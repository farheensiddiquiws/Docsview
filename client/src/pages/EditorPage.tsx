import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { AlertTriangle, ArrowLeft, Cloud, CloudCheck, CloudOff, Eye, FileX2, Loader2, Lock, PencilLine } from 'lucide-react';
import { api, ApiError, timeAgo, type Doc } from '../api';
import { Avatar } from '../components/Avatar';
import { AppHeader } from '../components/AppHeader';
import { Toolbar } from '../components/Toolbar';
import { ShareDialog } from '../components/ShareDialog';

export function EditorPage() {
  const { id = '' } = useParams();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    setDoc(null); setError(null);
    api.getDoc(id).then(setDoc).catch((e) => setError({ status: e instanceof ApiError ? e.status : 0, message: e.message }));
  }, [id]);

  if (error) {
    return (<div className="app-shell"><AppHeader /><main className="container">
      <div className="empty-state standalone">
        <div className="empty-icon"><FileX2 size={28} /></div>
        <h3>{error.status === 404 ? 'Document not found' : 'Couldn’t open this document'}</h3>
        <p className="muted">{error.status === 404 ? 'It may have been deleted, or it hasn’t been shared with you.' : error.message}</p>
        <Link className="btn btn-primary" to="/"><ArrowLeft size={16} /> Back to documents</Link>
      </div>
    </main></div>);
  }
  if (!doc) return <div className="app-shell"><AppHeader /><div className="center"><span className="spinner" aria-label="Loading document" /></div></div>;
  return <DocumentEditor key={doc.id} initial={doc} />;
}

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';
const STATUS = {
  saved: { icon: CloudCheck, text: 'Saved', cls: '' },
  unsaved: { icon: Cloud, text: 'Unsaved changes', cls: '' },
  saving: { icon: Loader2, text: 'Saving…', cls: 'spin-icon' },
  error: { icon: CloudOff, text: 'Couldn’t save', cls: 'danger' },
  conflict: { icon: AlertTriangle, text: 'Out of date', cls: 'danger' },
} as const;

function DocumentEditor({ initial }: { initial: Doc }) {
  const canEdit = initial.role !== 'viewer';
  const [title, setTitle] = useState(initial.title);
  const [savedTitle, setSavedTitle] = useState(initial.title);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState('');
  const [sharing, setSharing] = useState(false);

  // Save pipeline: edits accumulate in `pending`; at most one request is in flight;
  // each request carries the last known version so stale writes are rejected (409).
  const version = useRef(initial.version);
  const pending = useRef<{ title?: string; content?: string }>({});
  const inFlight = useRef(false);
  const conflicted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current || conflicted.current || Object.keys(pending.current).length === 0) return;
    const patch = pending.current;
    pending.current = {};
    inFlight.current = true;
    setSaveState('saving');
    try {
      const saved = await api.updateDoc(initial.id, { ...patch, version: version.current });
      version.current = saved.version;
      setSavedTitle(saved.title);
      setSaveError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        conflicted.current = true;
        setSaveState('conflict');
        return;
      }
      pending.current = { ...patch, ...pending.current }; // keep the edits, retry later
      setSaveError(e instanceof ApiError ? e.message : 'Save failed');
      setSaveState('error');
      // Retry transient failures (offline / 5xx); validation errors wait for the next edit.
      const transient = !(e instanceof ApiError) || e.status === 0 || e.status >= 500;
      if (transient) timer.current = setTimeout(flush, 3000);
      return;
    } finally {
      inFlight.current = false;
    }
    if (Object.keys(pending.current).length) { setSaveState('unsaved'); timer.current = setTimeout(flush, 300); }
    else setSaveState('saved');
  }, [initial.id]);

  const queue = useCallback((patch: { title?: string; content?: string }, delay = 800) => {
    if (conflicted.current) return;
    Object.assign(pending.current, patch);
    setSaveState((s) => (s === 'error' ? s : 'unsaved'));
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  }, [flush]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      Placeholder.configure({ placeholder: canEdit ? 'Start writing…' : '' }),
    ],
    content: initial.content,
    editable: canEdit,
    editorProps: { attributes: { class: 'page-content', 'aria-label': 'Document body' } },
    onUpdate: ({ editor: e }) => queue({ content: e.getHTML() }),
  });

  // Flush on unmount and warn before closing the tab with unsaved work.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || inFlight.current) { flush(); e.preventDefault(); }
    };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); flush(); };
  }, [flush]);

  function commitTitle() {
    const next = title.trim();
    if (!next) { setTitle(savedTitle); return; }
    if (next.length > 200) { setSaveError('Title must be at most 200 characters'); setSaveState('error'); return; }
    if (next !== savedTitle) queue({ title: next }, 0);
    setTitle(next);
  }

  const status = STATUS[saveState];
  const StatusIcon = status.icon;

  return (
    <div className="editor-page">
      <AppHeader actions={initial.role === 'owner'
        ? <button className="btn btn-primary" onClick={() => setSharing(true)}><Lock size={15} /> Share</button>
        : <span className={`pill pill-${initial.role}`}>{initial.role === 'editor' ? <PencilLine size={13} /> : <Eye size={13} />}{initial.role === 'editor' ? 'Can edit' : 'View only'}</span>}>
        <Link to="/" className="icon-btn" aria-label="Back to documents" title="Back to documents"><ArrowLeft size={18} /></Link>
        <div className="doc-header">
          <input className="title-input" value={title} disabled={!canEdit} maxLength={200} aria-label="Document title"
            onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setTitle(savedTitle); } }} />
          <div className="doc-meta">
            {canEdit
              ? <span className={`save-status ${status.cls}`} title={saveError || undefined}><StatusIcon size={14} className={saveState === 'saving' ? 'spin' : undefined} /> {status.text}</span>
              : <span className="save-status"><Eye size={14} /> View only</span>}
            <span className="dot hide-sm">·</span>
            <span className="owner-meta hide-sm"><Avatar name={initial.owner.name} email={initial.owner.email} size={18} />
              {initial.role === 'owner' ? 'Owned by you' : `Owned by ${initial.owner.name}`}</span>
            <span className="dot hide-sm">·</span>
            <span className="hide-sm">Created {timeAgo(initial.createdAt)}</span>
          </div>
        </div>
      </AppHeader>

      {saveState === 'conflict' && (
        <div className="banner banner-warn" role="alert">
          <AlertTriangle size={18} />
          <span>Someone else saved a newer version while you were editing. Your latest changes were <strong>not</strong> saved.</span>
          <button className="btn btn-secondary btn-sm" onClick={() => location.reload()}>Load latest version</button>
        </div>
      )}
      {saveState === 'error' && saveError && <div className="banner banner-error" role="alert"><CloudOff size={18} /> {saveError}</div>}
      {!canEdit && (
        <div className="banner banner-info"><Eye size={18} /> You have view-only access to this document. Ask {initial.owner.name} for edit access.</div>
      )}

      {canEdit && editor && <Toolbar editor={editor} />}
      <div className="page-scroller">
        <article className="page"><EditorContent editor={editor} /></article>
      </div>
      {sharing && <ShareDialog docId={initial.id} title={savedTitle} onClose={() => setSharing(false)} />}
    </div>
  );
}
