import { redirect } from 'next/navigation';
import { t } from '../../i18n/id';
import { panggilApi } from '../../lib/api';
import { gayaTombol, KartuTengah } from '../kartu';

export const dynamic = 'force-dynamic';

async function pilih(form: FormData) {
  'use server';
  const res = await panggilApi('/v1/sesi/tenant', { method: 'POST', body: { tenantId: String(form.get('tenantId') ?? '') } });
  redirect(res.ok ? '/dashboard' : '/pilih-tenant');
}

export default async function HalamanPilihTenant() {
  const k = t().pilihTenant;
  const res = await panggilApi<{ tenant: { id: string; nama: string }[] }>('/v1/sesi');
  if (res.status === 401) redirect('/masuk');
  return (
    <KartuTengah judul={k.judul} sub={k.sub}>
      <div style={{ display: 'grid', gap: 8 }}>
        {res.body.tenant.map((tn) => (
          <form key={tn.id} action={pilih}>
            <input type="hidden" name="tenantId" value={tn.id} />
            <button type="submit" style={{ ...gayaTombol, width: '100%' }}>
              {tn.nama}
            </button>
          </form>
        ))}
      </div>
    </KartuTengah>
  );
}
