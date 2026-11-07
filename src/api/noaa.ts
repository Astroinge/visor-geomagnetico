import { getJson, num, parseUtc, tableToRecords } from './http';
import type { Grid } from '../lib/isolines';

const SWPC = 'https://services.swpc.noaa.gov';

/* ---------- Kp: observado, estimado y previsto ---------- */

export type KpKind = 'observed' | 'estimated' | 'predicted';

export interface KpPoint {
  time: Date;
  kp: number;
  kind: KpKind;
}

export async function fetchKpForecast(signal?: AbortSignal): Promise<KpPoint[]> {
  const raw = await getJson(`${SWPC}/products/noaa-planetary-k-index-forecast.json`, signal);
  const out: KpPoint[] = [];
  for (const r of tableToRecords(raw)) {
    const kp = num(r.kp);
    const t = typeof r.time_tag === 'string' ? parseUtc(r.time_tag) : null;
    if (kp === null || !t || Number.isNaN(t.getTime())) continue;
    const kind = String(r.observed ?? '').toLowerCase();
    out.push({
      time: t,
      kp,
      kind: kind === 'observed' || kind === 'estimated' ? kind : 'predicted',
    });
  }
  return out.sort((a, b) => a.time.getTime() - b.time.getTime());
}

/* ---------- Avisos del SWPC (alertas, avisos, vigilancias) ---------- */

export type AlertType = 'ALERT' | 'WARNING' | 'WATCH' | 'SUMMARY' | 'OTHER';

export interface SwpcAlert {
  id: string;
  issued: Date;
  type: AlertType;
  headline: string;
  message: string;
}

const ALERT_HEAD = /^(EXTENDED WARNING|CONTINUED ALERT|CANCEL WATCH|WATCH|WARNING|ALERT|SUMMARY):\s*(.*)$/m;

export async function fetchGeomagAlerts(signal?: AbortSignal): Promise<SwpcAlert[]> {
  const raw = await getJson<unknown>(`${SWPC}/products/alerts.json`, signal);
  const out: SwpcAlert[] = [];
  for (const r of tableToRecords(raw)) {
    const message = typeof r.message === 'string' ? r.message.replace(/\r/g, '') : '';
    if (!/geomagnetic|k-index/i.test(message)) continue;
    const m = message.match(ALERT_HEAD);
    const label = m?.[1] ?? '';
    const type: AlertType = label.includes('WATCH')
      ? 'WATCH'
      : label.includes('WARNING')
        ? 'WARNING'
        : label.includes('ALERT')
          ? 'ALERT'
          : label === 'SUMMARY'
            ? 'SUMMARY'
            : 'OTHER';
    const issued = typeof r.issue_datetime === 'string' ? parseUtc(r.issue_datetime) : new Date(NaN);
    out.push({
      id: String(r.product_id ?? `${issued.getTime()}`) + String(issued.getTime()),
      issued,
      type,
      headline: m ? `${label}: ${m[2]}`.trim() : (message.split('\n').find((l) => l.trim()) ?? ''),
      message,
    });
  }
  return out
    .filter((a) => !Number.isNaN(a.issued.getTime()))
    .sort((a, b) => b.issued.getTime() - a.issued.getTime())
    .slice(0, 12);
}

/* ---------- Viento solar en L1 ---------- */

export interface SolarWindPoint {
  time: Date;
  bz: number | null;
  bt: number | null;
  speed: number | null;
  density: number | null;
}

/**
 * NOAA dejó de procesar DSCOVR y pasó a SOLAR-1, así que los archivos
 * `products/solar-wind/*-1-day.json` ya no se actualizan. Los datos vigentes
 * están en `json/rtsw/`. Mantengo el formato antiguo como respaldo.
 */
const SOLAR_WIND_SOURCES = [
  { mag: `${SWPC}/json/rtsw/rtsw_mag_1m.json`, plasma: `${SWPC}/json/rtsw/rtsw_wind_1m.json` },
  { mag: `${SWPC}/products/solar-wind/mag-1-day.json`, plasma: `${SWPC}/products/solar-wind/plasma-1-day.json` },
];

export async function fetchSolarWind(signal?: AbortSignal): Promise<SolarWindPoint[]> {
  const failures: string[] = [];
  for (const src of SOLAR_WIND_SOURCES) {
    try {
      const [magRaw, plasmaRaw] = await Promise.all([getJson(src.mag, signal), getJson(src.plasma, signal)]);
      const out = aggregateSolarWind(tableToRecords(magRaw), tableToRecords(plasmaRaw));
      if (out.length > 0) return out;
      failures.push(`${new URL(src.mag).pathname}: sin datos de las últimas 24 h`);
    } catch (e) {
      if (signal?.aborted) throw e;
      failures.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(failures.join(' · '));
}

function aggregateSolarWind(
  mag: Record<string, unknown>[],
  plasma: Record<string, unknown>[],
): SolarWindPoint[] {
  // Agrupo por bloques de 5 minutos y promedio para aligerar el gráfico.
  const bucket = 5 * 60_000;
  const since = Date.now() - 24 * 3_600_000;
  const acc = new Map<number, { n: Record<string, number[]> }>();
  const push = (t: number, key: string, v: number | null) => {
    if (v === null || t < since) return;
    const k = Math.floor(t / bucket) * bucket;
    let e = acc.get(k);
    if (!e) acc.set(k, (e = { n: {} }));
    (e.n[key] ??= []).push(v);
  };
  // En json/rtsw cada fila indica si es la fuente activa; las inactivas se descartan.
  const usable = (r: Record<string, unknown>) => typeof r.time_tag === 'string' && r.active !== false;
  for (const r of mag) {
    if (!usable(r)) continue;
    const t = parseUtc(r.time_tag as string).getTime();
    push(t, 'bz', num(r.bz_gsm));
    push(t, 'bt', num(r.bt));
  }
  for (const r of plasma) {
    if (!usable(r)) continue;
    const t = parseUtc(r.time_tag as string).getTime();
    push(t, 'speed', num(r.proton_speed ?? r.speed));
    push(t, 'density', num(r.proton_density ?? r.density));
  }
  const avg = (a?: number[]) => (a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, e]) => ({
      time: new Date(t),
      bz: avg(e.n.bz),
      bt: avg(e.n.bt),
      speed: avg(e.n.speed),
      density: avg(e.n.density),
    }));
}

/* ---------- Óvalo auroral OVATION (probabilidad de aurora, %) ---------- */

export interface AuroraData {
  grid: Grid;
  observationTime: Date | null;
  forecastTime: Date | null;
}

/** Margen en longitud para que los bordes queden fuera de la vista (ver fieldModel.ts). */
const LON_PAD = 20;

export async function fetchAurora(signal?: AbortSignal): Promise<AuroraData> {
  const raw = await getJson<{
    'Observation Time'?: string;
    'Forecast Time'?: string;
    coordinates?: [number, number, number][];
  }>(`${SWPC}/json/ovation_aurora_latest.json`, signal);
  const coords = raw.coordinates ?? [];
  if (coords.length === 0) throw new Error('OVATION sin datos');

  // Malla 1°: lon 0..359 (se desplaza a -180..179 y se amplía con margen), lat -90..90.
  const lonSteps = 360;
  const latSteps = 181;
  const base = new Float64Array(lonSteps * latSteps);
  for (const [lon, lat, v] of coords) {
    const i = ((Math.round(lon) % 360) + 360) % 360;
    const j = Math.round(lat) + 90;
    if (j < 0 || j >= latSteps) continue;
    base[j * lonSteps + i] = v;
  }
  const lon0 = -180 - LON_PAD;
  const width = 360 + 2 * LON_PAD + 1;
  const values = new Float64Array(width * latSteps);
  for (let j = 0; j < latSteps; j++) {
    for (let i = 0; i < width; i++) {
      const lon = lon0 + i;
      const src = ((lon % 360) + 360) % 360;
      values[j * width + i] = base[j * lonSteps + src];
    }
  }
  const d = (s?: string) => (s ? parseUtc(s) : null);
  return {
    grid: { values, width, height: latSteps, lon0, lat0: -90, dLon: 1, dLat: 1 },
    observationTime: d(raw['Observation Time']),
    forecastTime: d(raw['Forecast Time']),
  };
}
