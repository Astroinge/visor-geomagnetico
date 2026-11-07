import { useEffect, useMemo, useState } from 'react';
import { useAsync } from './hooks/useAsync';
import { fetchAurora, fetchGeomagAlerts, fetchKpForecast, fetchSolarWind } from './api/noaa';
import { fetchObservatories, fetchObservatorySeries } from './api/usgs';
import { MapView } from './components/MapView';
import { StatusPanel } from './components/StatusPanel';
import { KpChart } from './components/KpChart';
import { AlertsPanel } from './components/AlertsPanel';
import { SolarWindPanel } from './components/SolarWindPanel';
import { ObservatoryPanel } from './components/ObservatoryPanel';
import { fmtLocalTime } from './lib/format';

const REFRESH_MS = 5 * 60_000;

export default function App() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const kp = useAsync(fetchKpForecast, [], REFRESH_MS);
  const alerts = useAsync(fetchGeomagAlerts, [], REFRESH_MS);
  const wind = useAsync(fetchSolarWind, [], REFRESH_MS);
  const aurora = useAsync(fetchAurora, [], 15 * 60_000);
  const observatories = useAsync(fetchObservatories, []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => observatories.data?.find((o) => o.id === selectedId) ?? null,
    [observatories.data, selectedId],
  );
  const series = useAsync(
    (signal) => (selectedId ? fetchObservatorySeries(selectedId, 24, signal) : Promise.resolve(null)),
    [selectedId],
    selectedId ? REFRESH_MS : undefined,
  );

  const refreshAll = () => {
    kp.reload();
    alerts.reload();
    wind.reload();
    aurora.reload();
    if (selectedId) series.reload();
  };

  const lastUpdate = kp.updated;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Visor geomagnético</h1>
          <p className="muted small">Alertas y predicción de tormentas geomagnéticas · datos NOAA SWPC y USGS</p>
        </div>
        <div className="topbar-right">
          <span className="muted small">
            {lastUpdate ? `Actualizado ${fmtLocalTime(lastUpdate)} (hora local)` : 'Sin datos aún'}
          </span>
          <button onClick={refreshAll}>Actualizar</button>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <StatusPanel kp={kp.data} error={kp.error} loading={kp.loading} now={now} />
          {kp.data && <KpChart points={kp.data} now={now} />}
          <AlertsPanel alerts={alerts.data} error={alerts.error} loading={alerts.loading} />
          <SolarWindPanel data={wind.data} error={wind.error} loading={wind.loading} />
          <ObservatoryPanel
            observatory={selected}
            series={selectedId ? series.data : null}
            error={selectedId ? series.error : null}
            loading={series.loading}
          />
          <footer className="muted small">
            Fuentes: <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noreferrer">NOAA SWPC</a>,{' '}
            <a href="https://www.usgs.gov/programs/geomagnetism" target="_blank" rel="noreferrer">USGS Geomagnetism</a>, modelo WMM
            (NOAA/NCEI y BGS). Información orientativa: para decisiones operativas consulta los productos oficiales.
          </footer>
        </aside>

        <section className="map-area" aria-label="Mapa de isolíneas y observatorios">
          <MapView
            aurora={aurora.data}
            auroraError={aurora.error}
            observatories={observatories.data}
            observatoriesError={observatories.error}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </section>
      </main>
    </div>
  );
}
