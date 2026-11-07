/** Escala NOAA de tormentas geomagnéticas (G1–G5) a partir del índice Kp. */

export type GLevel = 0 | 1 | 2 | 3 | 4 | 5;

export function kpToG(kp: number): GLevel {
  if (kp >= 8.99) return 5;
  if (kp >= 7.67) return 4;
  if (kp >= 6.67) return 3;
  if (kp >= 5.67) return 2;
  if (kp >= 4.67) return 1;
  return 0;
}

export const G_LABELS: Record<GLevel, string> = {
  0: 'Sin tormenta',
  1: 'G1 · Menor',
  2: 'G2 · Moderada',
  3: 'G3 · Fuerte',
  4: 'G4 · Severa',
  5: 'G5 · Extrema',
};

export const G_COLORS: Record<GLevel, string> = {
  0: '#3fb27f',
  1: '#e3d34a',
  2: '#f0a53a',
  3: '#ee7a2f',
  4: '#e0412f',
  5: '#b3187a',
};

/** Color de una barra Kp (con los mismos umbrales que la escala G, más "agitado" en Kp 4). */
export function kpColor(kp: number): string {
  if (kp >= 4.67) return G_COLORS[kpToG(kp)];
  if (kp >= 3.67) return '#9fcf5a';
  return G_COLORS[0];
}

export const G_DESCRIPTIONS: Record<GLevel, string> = {
  0: 'Condiciones geomagnéticas tranquilas o agitadas, sin impactos esperados.',
  1: 'Fluctuaciones débiles en redes eléctricas; auroras visibles en latitudes altas.',
  2: 'Posibles alarmas de voltaje en redes de alta latitud; auroras hasta ~55° de latitud geomagnética.',
  3: 'Correcciones de voltaje necesarias; posibles falsas alarmas en protecciones; deriva de satélites; auroras hasta ~50°.',
  4: 'Posibles problemas generalizados de control de voltaje; navegación por satélite degradada; auroras hasta ~45°.',
  5: 'Posibles apagones y daños en transformadores; HF casi inutilizable; auroras hasta ~40° o menos.',
};
