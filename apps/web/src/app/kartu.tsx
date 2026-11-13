import type { CSSProperties, ReactNode } from 'react';

export const gayaInput: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--line-strong)',
  background: 'var(--surface-2)',
  color: 'var(--fg)',
  font: 'inherit',
  boxSizing: 'border-box',
};

export const gayaTombol: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 999,
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  fontWeight: 700,
  font: 'inherit',
  cursor: 'pointer',
};

export const gayaTombolSekunder: CSSProperties = {
  ...gayaTombol,
  background: 'var(--surface-2)',
  color: 'var(--fg)',
  border: '1px solid var(--line-strong)',
  padding: '6px 12px',
  fontWeight: 600,
};

/** Kartu tengah sederhana untuk halaman daftar/masuk. */
export function KartuTengah({ judul, sub, children }: { judul: string; sub?: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>
      <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{judul}</h1>
        {sub ? <p style={{ color: 'var(--muted)', marginTop: 4 }}>{sub}</p> : null}
        <div style={{ marginTop: 16 }}>{children}</div>
      </section>
    </main>
  );
}

export function Pesan({ jenis, children }: { jenis: 'galat' | 'info'; children: ReactNode }) {
  return (
    <p
      role={jenis === 'galat' ? 'alert' : 'status'}
      style={{
        padding: '8px 12px',
        borderRadius: 'var(--radius-sm)',
        background: jenis === 'galat' ? 'var(--danger-soft)' : 'var(--accent-soft)',
        color: jenis === 'galat' ? 'var(--danger)' : 'var(--accent-strong)',
      }}
    >
      {children}
    </p>
  );
}

export function Kolom({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4, marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}
