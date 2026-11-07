import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Observatory, ObsElement, ObsSeries } from '../api/usgs';
import { fmtHm, fmtUtc } from '../lib/format';

interface Props {
  observatory: Observatory | null;
  series: ObsSeries | null;
  error: string | null;
  loading: boolean;
}

const COLORS: Record<ObsElement, string> = { H: '#6fb1ff', Z: '#ffb35c', F: '#8be28b' };

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

export function ObservatoryPanel({ observatory, series, error, loading }: Props) {
  const { rows, elements, ranges } = useMemo(() => {
    if (!series) return { rows: [], elements: [] as ObsElement[], ranges: {} as Partial<Record<ObsElement, number>> };
    const elements = (Object.keys(series.values) as ObsElement[]).filter((e) =>
      series.values[e]!.some((v) => v !== null),
    );
    const base: Partial<Record<ObsElement, number>> = {};
    const ranges: Partial<Record<ObsElement, number>> = {};
    for (const e of elements) {
      const valid = series.values[e]!.filter((v): v is number => v !== null);
      base[e] = median(valid);
      ranges[e] = Math.max(...valid) - Math.min(...valid);
    }
    // Reduzco a un punto cada 5 min para el gráfico.
    const rows = series.times
      .map((t, i) => {
        const row: Record<string, number | null> = { t: t.getTime() };
        for (const e of elements) {
          const v = series.values[e]![i];
          row[e] = v === null ? null : v - base[e]!;
        }
        return row;
      })
      .filter((_, i) => i % 5 === 0);
    return { rows, elements, ranges };
  }, [series]);

  if (!observatory) {
    return (
      <section className="panel">
        <h2>Observatorio</h2>
        <p className="muted">Pulsa un observatorio en el mapa para ver su variación del campo en las últimas 24 h.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>
        {observatory.id} · {observatory.name}
      </h2>
      <p className="muted small">
        {observatory.agency} · {observatory.lat.toFixed(2)}°, {observatory.lon.toFixed(2)}°
      </p>
      {loading && !series && <p className="muted">Cargando serie de 24 h…</p>}
      {error && <p className="warn">No se pudo cargar la serie: {error}</p>}
      {series && elements.length === 0 && <p className="warn">El observatorio no devolvió datos en las últimas 24 h.</p>}
      {series && elements.length > 0 && (
        <>
          <div className="sw-grid">
            {elements.map((e) => (
              <div className="metric" key={e}>
                <span className="label">Δ{e} rango 24 h</span>
                <span className="val" style={{ color: COLORS[e] }}>
                  {ranges[e]!.toFixed(0)}
                </span>
                <span className="muted small">nT</span>
              </div>
            ))}
          </div>
          <div className="chart" style={{ height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid stroke="#2a3441" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => fmtHm(new Date(t)).replace(' UTC', '')} tick={{ fill: '#9fb0c3', fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fill: '#9fb0c3', fontSize: 10 }} unit=" nT" />
                <Tooltip labelFormatter={(t) => fmtUtc(new Date(Number(t)))} formatter={(v, n) => [`${Number(v).toFixed(1)} nT`, `Δ${String(n)}`]} contentStyle={{ background: '#161d27', border: '1px solid #2a3441' }} />
                <Legend formatter={(v) => `Δ${String(v)}`} />
                {elements.map((e) => (
                  <Line key={e} dataKey={e} stroke={COLORS[e]} dot={false} strokeWidth={1.4} isAnimationActive={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="muted small">Variación respecto a la mediana de las últimas 24 h (datos de variación, sin calibrar de forma definitiva). Horas en UTC.</p>
        </>
      )}
    </section>
  );
}
