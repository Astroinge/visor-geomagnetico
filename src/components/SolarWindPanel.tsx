import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SolarWindPoint } from '../api/noaa';
import { fmtHm } from '../lib/format';

interface Props {
  data: SolarWindPoint[] | null;
  error: string | null;
  loading: boolean;
}

type Level = 'ok' | 'mid' | 'high';
const LEVEL_COLOR: Record<Level, string> = { ok: '#3fb27f', mid: '#f0a53a', high: '#e0412f' };

const bzLevel = (bz: number): Level => (bz <= -10 ? 'high' : bz <= -5 ? 'mid' : 'ok');
const speedLevel = (v: number): Level => (v >= 600 ? 'high' : v >= 500 ? 'mid' : 'ok');

function mean(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function SolarWindPanel({ data, error, loading }: Props) {
  const stats = useMemo(() => {
    if (!data || data.length === 0) return null;
    const last6 = data.slice(-6); // ~30 min
    return {
      time: data[data.length - 1].time,
      bz: mean(last6.map((d) => d.bz)),
      bt: mean(last6.map((d) => d.bt)),
      speed: mean(last6.map((d) => d.speed)),
      density: mean(last6.map((d) => d.density)),
    };
  }, [data]);

  const verdict = useMemo(() => {
    if (!stats || stats.bz === null || stats.speed === null) return null;
    const favorable = stats.bz <= -5 && stats.speed >= 450;
    return favorable
      ? { text: 'Bz sur sostenido con viento rápido: condiciones favorables a un aumento de la actividad en las próximas horas.', cls: 'warn' }
      : { text: 'Sin acoplamiento fuerte entre el viento solar y la magnetosfera en los últimos 30 min.', cls: 'ok' };
  }, [stats]);

  const chart = useMemo(
    () => (data ?? []).map((d) => ({ t: d.time.getTime(), bz: d.bz, speed: d.speed })),
    [data],
  );

  return (
    <section className="panel">
      <h2>Viento solar en tiempo real</h2>
      {error && <p className="warn">Viento solar: {error}</p>}
      {!data && loading && <p className="muted">Cargando…</p>}
      {stats && (
        <>
          <div className="sw-grid">
            <Metric label="Bz (GSM)" value={stats.bz} unit="nT" digits={1} color={stats.bz !== null ? LEVEL_COLOR[bzLevel(stats.bz)] : undefined} />
            <Metric label="Bt" value={stats.bt} unit="nT" digits={1} />
            <Metric label="Velocidad" value={stats.speed} unit="km/s" digits={0} color={stats.speed !== null ? LEVEL_COLOR[speedLevel(stats.speed)] : undefined} />
            <Metric label="Densidad" value={stats.density} unit="p/cm³" digits={1} />
          </div>
          {verdict && <p className={verdict.cls}>{verdict.text}</p>}
          <p className="muted small">Media de los últimos ~30 min. Dato más reciente: {fmtHm(stats.time)}. Indicador orientativo, no es un aviso oficial.</p>

          <h3>Bz (nT), últimas 24 h · línea naranja: −5 nT</h3>
          <div className="chart" style={{ height: 110 }}>
            <MiniLine data={chart} dataKey="bz" color="#6fb1ff" unit="nT" title="Bz" zero />
          </div>
          <h3>Velocidad (km/s), últimas 24 h</h3>
          <div className="chart" style={{ height: 110 }}>
            <MiniLine data={chart} dataKey="speed" color="#c7a6ff" unit="km/s" title="Velocidad" />
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, unit, digits, color }: { label: string; value: number | null; unit: string; digits: number; color?: string }) {
  return (
    <div className="metric">
      <span className="label">{label}</span>
      <span className="val" style={{ color }}>
        {value === null ? '—' : value.toFixed(digits)}
      </span>
      <span className="muted small">{unit}</span>
    </div>
  );
}

function MiniLine({ data, dataKey, color, unit, title, zero }: { data: { t: number; [k: string]: number | null }[]; dataKey: string; color: string; unit: string; title: string; zero?: boolean }) {
  return (
    <ResponsiveContainer>
      <LineChart data={data} margin={{ top: 14, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="#2a3441" vertical={false} />
        <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => fmtHm(new Date(t)).replace(' UTC', '')} tick={{ fill: '#9fb0c3', fontSize: 10 }} minTickGap={40} />
        <YAxis tick={{ fill: '#9fb0c3', fontSize: 10 }} domain={['auto', 'auto']} />
        {zero && <ReferenceLine y={0} stroke="#556" />}
        {zero && <ReferenceLine y={-5} stroke="#f0a53a" strokeDasharray="4 3" />}
        <Tooltip
          labelFormatter={(t) => fmtHm(new Date(Number(t)))}
          formatter={(v) => [`${Number(v).toFixed(1)} ${unit}`, title]}
          contentStyle={{ background: '#161d27', border: '1px solid #2a3441' }}
        />
        <Line dataKey={dataKey} stroke={color} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
