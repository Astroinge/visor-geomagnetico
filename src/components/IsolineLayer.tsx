import { memo, useMemo } from 'react';
import { Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import type { IsolineLevel, LatLon } from '../lib/isolines';

interface Props {
  levels: IsolineLevel[];
  color: (level: number) => string;
  format: (level: number) => string;
  weight?: number;
  /** Nº mínimo de vértices para etiquetar una línea. */
  minLabelPoints?: number;
  /** Máximo de etiquetas por nivel. */
  maxLabelsPerLevel?: number;
}

/** Latitudes extremas donde las etiquetas no se leen bien en Mercator. */
const LABEL_LAT_LIMIT = 80;

function pickLabelPoint(line: LatLon[]): LatLon | null {
  // Busco un vértice central dentro del rango visible de longitudes.
  const mid = Math.floor(line.length / 2);
  for (let d = 0; d < line.length / 2; d++) {
    for (const k of [mid + d, mid - d]) {
      const p = line[k];
      if (p && p[1] > -170 && p[1] < 170 && Math.abs(p[0]) < LABEL_LAT_LIMIT) return p;
    }
  }
  return null;
}

function IsolineLayerBase({
  levels,
  color,
  format,
  weight = 1.6,
  minLabelPoints = 14,
  maxLabelsPerLevel = 3,
}: Props) {
  const labels = useMemo(() => {
    const out: { key: string; pos: LatLon; text: string; color: string }[] = [];
    for (const { level, lines } of levels) {
      const longest = [...lines]
        .filter((l) => l.length >= minLabelPoints)
        .sort((a, b) => b.length - a.length)
        .slice(0, maxLabelsPerLevel);
      longest.forEach((l, n) => {
        const pos = pickLabelPoint(l);
        if (pos) out.push({ key: `${level}-${n}`, pos, text: format(level), color: color(level) });
      });
    }
    return out;
  }, [levels, color, format, minLabelPoints, maxLabelsPerLevel]);

  return (
    <>
      {levels.map(({ level, lines }) =>
        lines.map((line, n) => (
          <Polyline
            key={`${level}-${n}`}
            positions={line}
            pathOptions={{ color: color(level), weight, opacity: 0.9, interactive: false }}
            interactive={false}
          />
        )),
      )}
      {labels.map((l) => (
        <Marker
          key={l.key}
          position={l.pos}
          interactive={false}
          keyboard={false}
          icon={L.divIcon({
            className: 'iso-label',
            html: `<span style="color:${l.color}">${l.text}</span>`,
            iconSize: [0, 0],
          })}
        />
      ))}
    </>
  );
}

export const IsolineLayer = memo(IsolineLayerBase);
