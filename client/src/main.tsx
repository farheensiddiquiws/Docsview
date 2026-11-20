import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider } from './components/Toast';
import { LoginPage } from './pages/LoginPage';
import { DocListPage } from './pages/DocListPage';
import { EditorPage } from './pages/EditorPage';
import './styles.css';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="center"><span className="spinner" aria-label="Loading" /></div>;
  const next = location.pathname === '/' ? '' : `?next=${encodeURIComponent(location.pathname)}`;
  return user ? children : <Navigate to={`/login${next}`} replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Protected><DocListPage /></Protected>} />
          <Route path="/d/:id" element={<Protected><EditorPage /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
);
