import type { KpPoint } from '../api/noaa';
import { kpToG, type GLevel } from './kp';

/** Cada valor Kp representa un bloque de 3 horas que empieza en `time`. */
export const KP_BLOCK_MS = 3 * 3_600_000;

export interface StormWindow {
  start: Date;
  end: Date;
  maxKp: number;
  level: GLevel;
  /** Verdadero si todos los bloques son previstos (aún no observados). */
  upcoming: boolean;
}

/** Último Kp observado o estimado. */
export function currentKp(points: KpPoint[]): KpPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].kind !== 'predicted') return points[i];
  }
  return null;
}

/** Agrupa bloques consecutivos con Kp ≥ 5- (G1) que aún no han terminado. */
export function stormWindows(points: KpPoint[], now: Date): StormWindow[] {
  const out: StormWindow[] = [];
  let cur: { pts: KpPoint[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const maxKp = Math.max(...cur.pts.map((p) => p.kp));
    out.push({
      start: cur.pts[0].time,
      end: new Date(cur.pts[cur.pts.length - 1].time.getTime() + KP_BLOCK_MS),
      maxKp,
      level: kpToG(maxKp),
      upcoming: cur.pts.every((p) => p.kind === 'predicted'),
    });
    cur = null;
  };
  for (const p of points) {
    const active = p.kp >= 4.67 && p.time.getTime() + KP_BLOCK_MS > now.getTime();
    if (!active) {
      flush();
      continue;
    }
    const last: KpPoint | undefined = cur?.pts[cur.pts.length - 1];
    if (cur && last && p.time.getTime() - last.time.getTime() === KP_BLOCK_MS) cur.pts.push(p);
    else {
      flush();
      cur = { pts: [p] };
    }
  }
  flush();
  return out;
}

/** Máximo Kp previsto (bloques que no han terminado). */
export function maxUpcoming(points: KpPoint[], now: Date): KpPoint | null {
  let best: KpPoint | null = null;
  for (const p of points) {
    if (p.time.getTime() + KP_BLOCK_MS <= now.getTime()) continue;
    if (!best || p.kp > best.kp) best = p;
  }
  return best;
}
