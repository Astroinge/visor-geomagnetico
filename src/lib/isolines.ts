/**
 * Isolíneas por marching squares sobre una malla regular lon/lat.
 * Devuelve polilíneas abiertas o cerradas ([lat, lon]) ya encadenadas, sin
 * cierres artificiales en los bordes de la malla.
 */

export interface Grid {
  /** Valores en orden de filas: values[j * width + i], j = índice de latitud, i = longitud. */
  values: ArrayLike<number>;
  width: number;
  height: number;
  lon0: number;
  lat0: number;
  dLon: number;
  dLat: number;
}

export type LatLon = [number, number];

export interface IsolineLevel {
  level: number;
  lines: LatLon[][];
}

export function isolines(grid: Grid, levels: number[]): IsolineLevel[] {
  return levels.map((level) => ({ level, lines: traceLevel(grid, level) }));
}

function traceLevel(grid: Grid, t: number): LatLon[][] {
  const { values: v, width: w, height: h, lon0, lat0, dLon, dLat } = grid;

  // Clave de punto de borde: horizontal (i,j)-(i+1,j) => 2*(j*w+i); vertical (i,j)-(i,j+1) => 2*(j*w+i)+1.
  const hKey = (i: number, j: number) => 2 * (j * w + i);
  const vKey = (i: number, j: number) => 2 * (j * w + i) + 1;

  const coords = new Map<number, LatLon>();
  const adj = new Map<number, number[]>();

  const interp = (a: number, b: number) => (t - a) / (b - a);

  const pointH = (i: number, j: number, a: number, b: number): number => {
    const k = hKey(i, j);
    if (!coords.has(k)) {
      const x = i + interp(a, b);
      coords.set(k, [lat0 + j * dLat, lon0 + x * dLon]);
    }
    return k;
  };
  const pointV = (i: number, j: number, a: number, b: number): number => {
    const k = vKey(i, j);
    if (!coords.has(k)) {
      const y = j + interp(a, b);
      coords.set(k, [lat0 + y * dLat, lon0 + i * dLon]);
    }
    return k;
  };
  const link = (p: number, q: number) => {
    let ap = adj.get(p);
    if (!ap) adj.set(p, (ap = []));
    ap.push(q);
    let aq = adj.get(q);
    if (!aq) adj.set(q, (aq = []));
    aq.push(p);
  };

  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const a = v[j * w + i]; // arriba-izquierda
      const b = v[j * w + i + 1]; // arriba-derecha
      const c = v[(j + 1) * w + i + 1]; // abajo-derecha
      const d = v[(j + 1) * w + i]; // abajo-izquierda
      if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) continue;

      const idx = (a >= t ? 8 : 0) | (b >= t ? 4 : 0) | (c >= t ? 2 : 0) | (d >= t ? 1 : 0);
      if (idx === 0 || idx === 15) continue;

      const top = () => pointH(i, j, a, b);
      const bottom = () => pointH(i, j + 1, d, c);
      const left = () => pointV(i, j, a, d);
      const right = () => pointV(i + 1, j, b, c);

      switch (idx) {
        case 1:
        case 14:
          link(left(), bottom());
          break;
        case 2:
        case 13:
          link(bottom(), right());
          break;
        case 3:
        case 12:
          link(left(), right());
          break;
        case 4:
        case 11:
          link(top(), right());
          break;
        case 6:
        case 9:
          link(top(), bottom());
          break;
        case 7:
        case 8:
          link(top(), left());
          break;
        case 5: {
          // Silla: b y d altos.
          const centerHigh = (a + b + c + d) / 4 >= t;
          if (centerHigh) {
            link(top(), left());
            link(bottom(), right());
          } else {
            link(top(), right());
            link(left(), bottom());
          }
          break;
        }
        case 10: {
          // Silla: a y c altos.
          const centerHigh = (a + b + c + d) / 4 >= t;
          if (centerHigh) {
            link(top(), right());
            link(left(), bottom());
          } else {
            link(top(), left());
            link(bottom(), right());
          }
          break;
        }
      }
    }
  }

  // Encadenado de segmentos en polilíneas.
  const visited = new Set<number>();
  const lines: LatLon[][] = [];

  const walk = (start: number): LatLon[] => {
    const line: LatLon[] = [];
    let cur: number | undefined = start;
    while (cur !== undefined) {
      visited.add(cur);
      line.push(coords.get(cur)!);
      const next: number | undefined = adj.get(cur)!.find((n) => !visited.has(n));
      if (next === undefined) {
        // Cierra anillos.
        const first = adj.get(cur)!.find((n) => n === start);
        if (first !== undefined && line.length > 2) line.push(coords.get(start)!);
      }
      cur = next;
    }
    return line;
  };

  for (const [k, nb] of adj) {
    if (nb.length === 1 && !visited.has(k)) lines.push(walk(k));
  }
  for (const k of adj.keys()) {
    if (!visited.has(k)) lines.push(walk(k));
  }
  return lines;
}

/** Punto medio (por número de vértices) de la polilínea, útil para colocar etiquetas. */
export function midPoint(line: LatLon[]): LatLon {
  return line[Math.floor(line.length / 2)];
}
