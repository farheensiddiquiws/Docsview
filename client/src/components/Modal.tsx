import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

type Props = { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' };

export function Modal({ title, onClose, children, footer, size = 'md' }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
