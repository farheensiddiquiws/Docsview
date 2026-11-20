export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M10 8h8l5 5v11a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="#fff" />
      <path d="M12 16h8M12 19h8M12 22h5" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
