import type { AlertType, SwpcAlert } from '../api/noaa';
import { fmtUtc } from '../lib/format';

const TYPE_ES: Record<AlertType, string> = {
  WATCH: 'Vigilancia',
  WARNING: 'Aviso',
  ALERT: 'Alerta',
  SUMMARY: 'Resumen',
  OTHER: 'Boletín',
};

/** Resumen en español de los datos clave del texto original (en inglés) del SWPC. */
function summaryEs(a: SwpcAlert): string | null {
  const k = a.message.match(/K-index of (\d)/i);
  const scale = a.message.match(/NOAA Scale:\s*(G\d)/i);
  const valid = a.message.match(/Valid (?:From|Until|To):\s*(.+)/i);
  const parts: string[] = [];
  if (k) {
    const verb = a.type === 'WARNING' ? 'prevista' : a.type === 'WATCH' ? 'posible' : 'alcanzada';
    parts.push(`Índice K de ${k[1]} ${verb}`);
  }
  if (scale) parts.push(`escala ${scale[1]}`);
  if (valid) parts.push(`válido: ${valid[1].trim()}`);
  return parts.length ? parts.join(' · ') : null;
}

interface Props {
  alerts: SwpcAlert[] | null;
  error: string | null;
  loading: boolean;
}

export function AlertsPanel({ alerts, error, loading }: Props) {
  return (
    <section className="panel">
      <h2>Alertas y avisos del SWPC</h2>
      {error && <p className="warn">No se pudieron cargar los avisos: {error}</p>}
      {!alerts && loading && <p className="muted">Cargando…</p>}
      {alerts && alerts.length === 0 && <p className="ok">Sin avisos geomagnéticos recientes.</p>}
      {alerts && alerts.length > 0 && (
        <ul className="alerts">
          {alerts.map((a) => (
            <li key={a.id}>
              <details>
                <summary>
                  <span className={`tag tag-${a.type.toLowerCase()}`}>{TYPE_ES[a.type]}</span>
                  <span className="alert-title">{summaryEs(a) ?? a.headline}</span>
                  <span className="muted small">{fmtUtc(a.issued)}</span>
                </summary>
                <pre>{a.message}</pre>
                <p className="muted small">Texto original de NOAA SWPC (inglés).</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
