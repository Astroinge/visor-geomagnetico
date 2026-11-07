export async function getJson<T = unknown>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} al consultar ${new URL(url).host}`);
  return (await res.json()) as T;
}

/** Fechas de NOAA ("2026-11-07 03:00:00" o "2026-11-07T03:00:00") en UTC. */
export function parseUtc(s: string): Date {
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(s);
  const iso = s.trim().replace(' ', 'T');
  return new Date(hasZone ? iso : `${iso}Z`);
}

/**
 * NOAA publica tablas como [[cabeceras...], [fila...], ...] o como [{...}, ...].
 * Las normalizo siempre a objetos con claves en minúsculas.
 */
export function tableToRecords(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  if (Array.isArray(data[0])) {
    const header = (data[0] as unknown[]).map((h) => String(h).toLowerCase());
    return (data as unknown[][]).slice(1).map((row) => {
      const rec: Record<string, unknown> = {};
      header.forEach((h, i) => (rec[h] = row[i]));
      return rec;
    });
  }
  return (data as Record<string, unknown>[]).map((o) => {
    const rec: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) rec[k.toLowerCase()] = v;
    return rec;
  });
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
