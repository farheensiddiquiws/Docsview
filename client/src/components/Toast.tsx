import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';

type Kind = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; kind: Kind };
const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {});

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return <div key={t.id} className={`toast toast-${t.kind}`}><Icon size={18} /> <span>{t.message}</span></div>;
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
