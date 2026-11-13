import { t } from '../i18n/id';
import { ambilStatusApi } from '../lib/status-api';

export const dynamic = 'force-dynamic';

function Pil({ sehat, label }: { sehat: boolean; label: string }) {
  return (
    <span
      data-testid="status-pil"
      style={{
        borderRadius: 999,
        padding: '4px 12px',
        fontSize: 13,
        fontWeight: 600,
        background: sehat ? 'var(--ok-soft)' : 'var(--danger-soft)',
        color: sehat ? 'var(--ok)' : 'var(--danger)',
      }}
    >
      {label}
    </span>
  );
}

export default async function Beranda() {
  const k = t();
  const status = await ambilStatusApi();
  const apiSehat = status.terhubung && status.status === 'ok';
  const dbSehat = status.terhubung && status.database === 'ok';

  return (
    <main style={{ maxWidth: 480, margin: '48px auto', padding: '0 16px' }}>
      <section
        style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 24 }}
      >
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{k.aplikasi.nama}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 4 }}>{k.status.judul}</p>
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, margin: '16px 0 0' }}>
          <dt>{k.status.api}</dt>
          <dd style={{ margin: 0 }}>
            <Pil sehat={apiSehat} label={status.terhubung ? (apiSehat ? k.status.sehat : k.status.gagal) : k.status.tidakTerhubung} />
          </dd>
          <dt>{k.status.database}</dt>
          <dd style={{ margin: 0 }}>
            <Pil sehat={dbSehat} label={dbSehat ? k.status.sehat : k.status.gagal} />
          </dd>
        </dl>
      </section>
    </main>
  );
}
