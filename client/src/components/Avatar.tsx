const PALETTE = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#059669', '#0891b2', '#4f46e5', '#b45309'];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  const parts = name.trim().split(/[\s._@-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({ name, email, size = 32 }: { name: string; email?: string; size?: number }) {
  const bg = PALETTE[hash(email ?? name) % PALETTE.length];
  return (
    <span className="avatar" title={email ? `${name} (${email})` : name} aria-hidden="true"
      style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.38) }}>
      {initials(name)}
    </span>
  );
}
