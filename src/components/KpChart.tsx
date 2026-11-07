import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { KpPoint } from '../api/noaa';
import { KP_BLOCK_MS } from '../lib/forecast';
import { fmtAxis, fmtUtc } from '../lib/format';
import { G_LABELS, kpColor, kpToG } from '../lib/kp';

const KIND_LABEL = { observed: 'observado', estimated: 'estimado', predicted: 'previsto' } as const;

export function KpChart({ points, now }: { points: KpPoint[]; now: Date }) {
  const data = useMemo(
    () =>
      points.map((p) => ({
        t: p.time.getTime(),
        label: fmtAxis(p.time),
        kp: p.kp,
        kind: p.kind,
      })),
    [points],
  );
  const nowLabel = useMemo(() => {
    const cur = data.find((d) => d.t <= now.getTime() && now.getTime() < d.t + KP_BLOCK_MS);
    return cur?.label;
  }, [data, now]);

  return (
    <section className="panel">
      <h2>Índice Kp: observado y previsto</h2>
      <div className="chart" style={{ height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -18 }} barCategoryGap={1}>
            <CartesianGrid stroke="#2a3441" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#9fb0c3', fontSize: 10 }} interval={7} />
            <YAxis domain={[0, 9]} ticks={[0, 3, 5, 7, 9]} tick={{ fill: '#9fb0c3', fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.06)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <div className="tip">
                    <strong>{fmtUtc(new Date(d.t))}</strong>
                    <div>
                      Kp {d.kp.toFixed(2)} · {G_LABELS[kpToG(d.kp)]}
                    </div>
                    <div className="muted">{KIND_LABEL[d.kind]}</div>
                  </div>
                );
              }}
            />
            <ReferenceLine y={5} stroke="#e3d34a" strokeDasharray="4 3" label={{ value: 'G1', fill: '#e3d34a', fontSize: 10, position: 'insideTopRight' }} />
            {nowLabel && (
              <ReferenceLine x={nowLabel} stroke="#fff" strokeDasharray="2 2" label={{ value: 'ahora', fill: '#fff', fontSize: 10, position: 'top' }} />
            )}
            <Bar dataKey="kp" isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.t} fill={kpColor(d.kp)} fillOpacity={d.kind === 'predicted' ? 0.5 : 1} stroke={d.kind === 'predicted' ? kpColor(d.kp) : 'none'} strokeDasharray="3 2" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="muted small">Barras sólidas: observado/estimado. Barras traslúcidas: previsión de NOAA SWPC. Horas en UTC.</p>
    </section>
  );
}
