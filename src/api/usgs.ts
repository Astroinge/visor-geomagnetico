import { getJson, num, parseUtc } from './http';

const USGS = 'https://geomag.usgs.gov/ws';

export interface Observatory {
  id: string;
  name: string;
  agency: string;
  lat: number;
  lon: number;
}

interface ObservatoryFeature {
  id?: string;
  properties?: { name?: string; agency?: string; agency_name?: string };
  geometry?: { coordinates?: number[] };
}

export async function fetchObservatories(signal?: AbortSignal): Promise<Observatory[]> {
  const raw = await getJson<{ features?: ObservatoryFeature[] }>(`${USGS}/observatories/`, signal);
  const out: Observatory[] = [];
  for (const f of raw.features ?? []) {
    const c = f.geometry?.coordinates;
    if (!f.id || !c || c.length < 2) continue;
    const lon = num(c[0]);
    const lat = num(c[1]);
    if (lon === null || lat === null) continue;
    out.push({
      id: f.id,
      name: f.properties?.name ?? f.id,
      agency: f.properties?.agency_name ?? f.properties?.agency ?? 'USGS',
      lat,
      lon,
    });
  }
  return out;
}

export type ObsElement = 'H' | 'Z' | 'F';

export interface ObsSeries {
  times: Date[];
  /** Valores por elemento, mismos índices que `times` (null = hueco). */
  values: Partial<Record<ObsElement, (number | null)[]>>;
}

interface UsgsTimeseries {
  times?: string[];
  values?: { id?: string; values?: (number | null)[] }[];
}

async function request(id: string, elements: string, hours: number, signal?: AbortSignal) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3_600_000);
  const q = new URLSearchParams({
    id,
    format: 'json',
    type: 'variation',
    elements,
    sampling_period: '60',
    starttime: start.toISOString(),
    endtime: end.toISOString(),
  });
  return getJson<UsgsTimeseries>(`${USGS}/data/?${q}`, signal);
}

export async function fetchObservatorySeries(
  id: string,
  hours = 24,
  signal?: AbortSignal,
): Promise<ObsSeries> {
  let raw: UsgsTimeseries;
  try {
    raw = await request(id, 'H,Z,F', hours, signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    // Algunos observatorios no registran F: reintento solo con H y Z.
    raw = await request(id, 'H,Z', hours, signal);
  }
  const times = (raw.times ?? []).map((t) => parseUtc(t));
  const values: ObsSeries['values'] = {};
  for (const v of raw.values ?? []) {
    if (v.id === 'H' || v.id === 'Z' || v.id === 'F') {
      values[v.id] = (v.values ?? []).map((x) => num(x));
    }
  }
  return { times, values };
}
