const utc = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  hour12: false,
});

const hm = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  hour12: false,
});

const local = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** "vie, 07 nov, 12:00 UTC" */
export const fmtUtc = (d: Date) => `${utc.format(d)} UTC`;
/** "07 · 12h" (día UTC y hora UTC) para ejes. */
export const fmtAxis = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')} · ${String(d.getUTCHours()).padStart(2, '0')}h`;
export const fmtHm = (d: Date) => `${hm.format(d)} UTC`;
export const fmtLocalTime = (d: Date) => local.format(d);
