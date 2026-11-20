export type User = { id: number; email: string; name: string };
export type Role = 'owner' | 'editor' | 'viewer';
export type Doc = {
  id: string; title: string; content: string; version: number;
  createdAt: string; updatedAt: string; role: Role; owner: { name: string; email: string };
};
export type OwnedSummary = { id: string; title: string; updatedAt: string; shareCount: number };
export type SharedSummary = { id: string; title: string; updatedAt: string; role: Exclude<Role, 'owner'>; ownerName: string };
export type Share = { userId: number; email: string; name: string; role: 'viewer' | 'editor'; pending: number };

export type ShareResult = { shares: Share[]; email: 'sent' | 'failed' | 'not_configured' | 'not_applicable'; registered: boolean };

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: Record<string, unknown> = {}) { super(message); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined;
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin', headers, ...init });
  } catch {
    throw new ApiError(0, 'Network error. Check your connection.');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body);
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

export const api = {
  me: () => request<User>('/api/auth/me'),
  login: (email: string, password: string) => request<User>('/api/auth/login', json('POST', { email, password })),
  signup: (name: string, email: string, password: string) =>
    request<User>('/api/auth/signup', json('POST', { name, email, password })),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  users: () => request<User[]>('/api/users'),
  listDocs: () => request<{ owned: OwnedSummary[]; shared: SharedSummary[] }>('/api/documents'),
  createDoc: (title?: string) => request<Doc>('/api/documents', json('POST', title ? { title } : {})),
  importDoc: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<Doc>('/api/documents/import', { method: 'POST', body: form });
  },
  getDoc: (id: string) => request<Doc>(`/api/documents/${id}`),
  updateDoc: (id: string, patch: { title?: string; content?: string; version: number }) =>
    request<Doc>(`/api/documents/${id}`, json('PATCH', patch)),
  deleteDoc: (id: string) => request<void>(`/api/documents/${id}`, { method: 'DELETE' }),
  shares: (id: string) => request<Share[]>(`/api/documents/${id}/shares`),
  share: (id: string, email: string, role: Share['role']) => request<ShareResult>(`/api/documents/${id}/shares`, json('PUT', { email, role })),
  unshare: (id: string, userId: number) => request<Share[]>(`/api/documents/${id}/shares/${userId}`, { method: 'DELETE' }),
};

export const SUPPORTED_UPLOADS = '.txt,.md,.docx';

export function timeAgo(sqliteUtc: string) {
  const then = new Date(sqliteUtc.replace(' ', 'T') + 'Z').getTime();
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(then).toLocaleDateString();
}
