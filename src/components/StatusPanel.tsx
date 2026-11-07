import type { KpPoint } from '../api/noaa';
import { currentKp, maxUpcoming, stormWindows } from '../lib/forecast';
import { G_COLORS, G_DESCRIPTIONS, G_LABELS, kpToG } from '../lib/kp';
import { fmtUtc } from '../lib/format';

interface Props {
  kp: KpPoint[] | null;
  error: string | null;
  loading: boolean;
  now: Date;
}

export function StatusPanel({ kp, error, loading, now }: Props) {
  if (!kp) {
    return (
      <section className="panel">
        <h2>Estado geomagnético</h2>
        {error ? <p className="warn">No se pudo cargar el Kp: {error}</p> : loading && <p className="muted">Cargando…</p>}
      </section>
    );
  }

  const cur = currentKp(kp);
  const curG = cur ? kpToG(cur.kp) : 0;
  const peak = maxUpcoming(kp, now);
  const peakG = peak ? kpToG(peak.kp) : 0;
  const windows = stormWindows(kp, now);

  return (
    <section className="panel" aria-live="polite">
      <h2>Estado geomagnético</h2>
      {error && <p className="warn">Datos posiblemente desactualizados: {error}</p>}
      <div className="status-grid">
        <div className="status-box" style={{ borderColor: G_COLORS[curG] }}>
          <span className="label">Ahora (Kp {cur?.kind === 'estimated' ? 'estimado' : 'observado'})</span>
          <span className="big" style={{ color: G_COLORS[curG] }}>
            {cur ? cur.kp.toFixed(2) : '—'}
          </span>
          <span>{G_LABELS[curG]}</span>
        </div>
        <div className="status-box" style={{ borderColor: G_COLORS[peakG] }}>
          <span className="label">Máximo previsto (3 días)</span>
          <span className="big" style={{ color: G_COLORS[peakG] }}>
            {peak ? peak.kp.toFixed(2) : '—'}
          </span>
          <span>{G_LABELS[peakG]}</span>
          {peak && <span className="muted small">{fmtUtc(peak.time)}</span>}
        </div>
      </div>
      <p className="muted small">{G_DESCRIPTIONS[Math.max(curG, peakG) as 0 | 1 | 2 | 3 | 4 | 5]}</p>

      <h3>Ventanas de tormenta (Kp 5- o superior)</h3>
      {windows.length === 0 ? (
        <p className="ok">No se prevén tormentas geomagnéticas en el horizonte de la previsión.</p>
      ) : (
        <ul className="windows">
          {windows.map((w) => (
            <li key={w.start.getTime()}>
              <span className="chip" style={{ background: G_COLORS[w.level] }}>
                G{w.level}
              </span>
              <span>
                Del {fmtUtc(w.start)}
                <br />
                al {fmtUtc(w.end)}
                <br />
                <span className="muted small">
                  Kp máx. {w.maxKp.toFixed(2)} · {w.upcoming ? 'prevista' : 'en curso o reciente'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
