export type StatusApi =
  | { terhubung: true; status: string; database: string }
  | { terhubung: false; galat: string };

/** URL API dari sisi server Next.js (di Docker: http://api:3001). */
export function urlApiInternal(): string {
  return process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
}

export async function ambilStatusApi(): Promise<StatusApi> {
  try {
    const res = await fetch(`${urlApiInternal()}/v1/health`, { cache: 'no-store', signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return { terhubung: false, galat: `HTTP ${res.status}` };
    const body = (await res.json()) as { status: string; database: string };
    return { terhubung: true, status: body.status, database: body.database };
  } catch (err) {
    return { terhubung: false, galat: (err as Error).message };
  }
}
