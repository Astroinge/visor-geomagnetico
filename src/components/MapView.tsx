import { useCallback, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { IsolineLayer } from './IsolineLayer';
import { isolines } from '../lib/isolines';
import {
  FIELD_ELEMENTS,
  computeFieldGrid,
  fieldModelName,
  levelsFor,
  type FieldElement,
} from '../lib/fieldModel';
import type { AuroraData } from '../api/noaa';
import type { Observatory } from '../api/usgs';
import { fmtUtc } from '../lib/format';

interface Props {
  aurora: AuroraData | null;
  auroraError: string | null;
  observatories: Observatory[] | null;
  observatoriesError: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const AURORA_LEVELS = [10, 25, 50, 75];
const AURORA_COLORS: Record<number, string> = {
  10: '#7dffb2',
  25: '#3df08a',
  50: '#ffe14d',
  75: '#ff5a5a',
};
const auroraColor = (l: number) => AURORA_COLORS[l] ?? '#7dffb2';
const auroraFormat = (l: number) => `${l}%`;

const FIELD_COLOR = '#6fb1ff';

export function MapView({
  aurora,
  auroraError,
  observatories,
  observatoriesError,
  selectedId,
  onSelect,
}: Props) {
  const [showAurora, setShowAurora] = useState(true);
  const [showField, setShowField] = useState(true);
  const [showObs, setShowObs] = useState(true);
  const [fieldId, setFieldId] = useState<FieldElement>('decl');

  const fieldInfo = FIELD_ELEMENTS.find((e) => e.id === fieldId)!;
  const now = useMemo(() => new Date(), []);

  const auroraLines = useMemo(
    () => (aurora ? isolines(aurora.grid, AURORA_LEVELS) : []),
    [aurora],
  );

  const fieldLines = useMemo(() => {
    if (!showField) return [];
    const grid = computeFieldGrid(fieldInfo, now);
    return isolines(grid, levelsFor(grid, fieldInfo.step));
  }, [showField, fieldInfo, now]);

  const fieldFormat = useCallback(
    (l: number) => (fieldInfo.id === 'f' ? `${l / 1000}k` : `${l}°`),
    [fieldInfo],
  );
  const fieldColor = useCallback(
    (l: number) => (fieldInfo.id === 'decl' && l < 0 ? '#d58cff' : FIELD_COLOR),
    [fieldInfo],
  );

  return (
    <div className="map-wrap">
      <MapContainer
        center={[35, 0]}
        zoom={2}
        minZoom={2}
        maxZoom={8}
        worldCopyJump={false}
        maxBounds={[
          [-85, -180],
          [85, 180],
        ]}
        maxBoundsViscosity={1}
        preferCanvas
        className="map"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          noWrap
        />
        {showField && (
          <IsolineLayer
            levels={fieldLines}
            color={fieldColor}
            format={fieldFormat}
            weight={1.1}
            minLabelPoints={10}
            maxLabelsPerLevel={2}
          />
        )}
        {showAurora && aurora && (
          <IsolineLayer
            levels={auroraLines}
            color={auroraColor}
            format={auroraFormat}
            weight={2.2}
            minLabelPoints={20}
            maxLabelsPerLevel={2}
          />
        )}
        {showObs &&
          observatories?.map((o) => (
            <CircleMarker
              key={o.id}
              center={[o.lat, o.lon]}
              radius={o.id === selectedId ? 9 : 6}
              pathOptions={{
                color: '#fff',
                weight: o.id === selectedId ? 3 : 1.5,
                fillColor: o.id === selectedId ? '#ff9f43' : '#2ea8ff',
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onSelect(o.id) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <strong>{o.id}</strong> · {o.name}
                <br />
                {o.agency}
              </Tooltip>
            </CircleMarker>
          ))}
      </MapContainer>

      <div className="map-controls" role="group" aria-label="Capas del mapa">
        <label>
          <input type="checkbox" checked={showAurora} onChange={(e) => setShowAurora(e.target.checked)} />
          Probabilidad de aurora (OVATION)
        </label>
        {showAurora && (
          <div className="legend">
            {AURORA_LEVELS.map((l) => (
              <span key={l}>
                <i style={{ background: auroraColor(l) }} />
                {l}%
              </span>
            ))}
          </div>
        )}
        {showAurora && auroraError && <p className="warn">Aurora: {auroraError}</p>}
        {showAurora && aurora?.forecastTime && (
          <p className="muted small">Previsión válida: {fmtUtc(aurora.forecastTime)}</p>
        )}

        <label>
          <input type="checkbox" checked={showField} onChange={(e) => setShowField(e.target.checked)} />
          Campo principal (WMM)
        </label>
        {showField && (
          <>
            <select
              value={fieldId}
              onChange={(e) => setFieldId(e.target.value as FieldElement)}
              aria-label="Elemento del campo principal"
            >
              {FIELD_ELEMENTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            <p className="muted small">
              Cada {fieldInfo.step.toLocaleString('es-ES')} {fieldInfo.unit} · {fieldModelName(now)}
              {fieldInfo.id === 'decl' && ' · violeta: declinación oeste'}
            </p>
          </>
        )}

        <label>
          <input type="checkbox" checked={showObs} onChange={(e) => setShowObs(e.target.checked)} />
          Observatorios USGS {observatories ? `(${observatories.length})` : ''}
        </label>
        {showObs && observatoriesError && <p className="warn">Observatorios: {observatoriesError}</p>}
      </div>
    </div>
  );
}
