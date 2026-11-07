import { model } from 'geomagnetism';
import type { Grid } from './isolines';

export type FieldElement = 'f' | 'incl' | 'decl';

export interface FieldElementInfo {
  id: FieldElement;
  label: string;
  unit: string;
  /** Intervalo entre isolíneas. */
  step: number;
  /** Rango de latitudes en el que se calcula (la declinación es discontinua cerca de los polos magnéticos). */
  latMin: number;
  latMax: number;
}

export const FIELD_ELEMENTS: FieldElementInfo[] = [
  { id: 'f', label: 'Intensidad total (F)', unit: 'nT', step: 2500, latMin: -85, latMax: 85 },
  { id: 'incl', label: 'Inclinación (I)', unit: '°', step: 10, latMin: -85, latMax: 85 },
  { id: 'decl', label: 'Declinación (D)', unit: '°', step: 5, latMin: -60, latMax: 72 },
];

/** Resolución de la malla en grados. */
const STEP = 3;
/** Margen en longitud fuera de ±180° para que los bordes de la malla queden fuera de vista. */
const LON_PAD = 20;

export function fieldModelName(date: Date): string {
  return model(date, { allowOutOfBoundsModel: true }).name;
}

export function computeFieldGrid(element: FieldElementInfo, date: Date): Grid {
  const m = model(date, { allowOutOfBoundsModel: true });
  const lon0 = -180 - LON_PAD;
  const lon1 = 180 + LON_PAD;
  const width = Math.round((lon1 - lon0) / STEP) + 1;
  const height = Math.round((element.latMax - element.latMin) / STEP) + 1;
  const values = new Float64Array(width * height);
  for (let j = 0; j < height; j++) {
    const lat = element.latMin + j * STEP;
    for (let i = 0; i < width; i++) {
      const lon = lon0 + i * STEP;
      values[j * width + i] = m.point([lat, lon])[element.id];
    }
  }
  return { values, width, height, lon0, lat0: element.latMin, dLon: STEP, dLat: STEP };
}

/** Niveles múltiplos de `step` dentro del rango de la malla. */
export function levelsFor(grid: Grid, step: number): number[] {
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < grid.values.length; k++) {
    const x = grid.values[k];
    if (x < min) min = x;
    if (x > max) max = x;
  }
  const out: number[] = [];
  for (let l = Math.ceil(min / step) * step; l <= max; l += step) out.push(l);
  return out;
}
