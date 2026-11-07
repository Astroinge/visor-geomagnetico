# Visor geomagnético

Visor web (React + TypeScript + Vite) centrado en **alertas y predicción de tormentas geomagnéticas**, con mapa de **isolíneas** y **observatorios**. Es una aplicación estática: el navegador consulta directamente las APIs públicas.

## Qué muestra

- **Estado y ventanas de tormenta:** Kp actual, máximo previsto a 3 días y tramos con Kp ≥ 5- (G1 o superior), derivados de la previsión de NOAA SWPC.
- **Gráfico Kp** observado, estimado y previsto.
- **Avisos del SWPC** relacionados con actividad geomagnética (texto original en inglés, con resumen en español).
- **Viento solar en tiempo real** (Bz, velocidad, densidad) con un indicador orientativo a corto plazo.
- **Mapa:**
  - isolíneas de probabilidad de aurora (modelo OVATION: 10, 25, 50 y 75 %),
  - isolíneas del campo principal (declinación, inclinación o intensidad total) calculadas en el navegador con el modelo WMM-2025,
  - observatorios USGS; al pulsar uno se muestra la variación de H, Z y F en las últimas 24 h.

## Fuentes de datos

| Dato | Fuente |
| --- | --- |
| Kp observado y previsto, avisos, viento solar, OVATION | `services.swpc.noaa.gov` (NOAA SWPC) |
| Observatorios y series de variación | `geomag.usgs.gov/ws` (USGS Geomagnetism) |
| Campo principal | Modelo WMM, paquete npm `geomagnetism` |

## Desarrollo

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # comprueba tipos y genera dist/
npm run preview  # sirve dist/
```

## Publicar en GitHub Pages

1. Sube este proyecto a un repositorio de GitHub (rama `main`).
2. En **Settings → Pages**, elige **Source: GitHub Actions**.
3. Cada `push` a `main` ejecuta `.github/workflows/deploy.yml` y publica en `https://<usuario>.github.io/<repositorio>/`.

`vite.config.ts` usa `base: './'`, así que no hace falta configurar el nombre del repositorio. Para un dominio propio, añade el dominio en **Settings → Pages → Custom domain**.

## Aviso

Información orientativa. Para decisiones operativas consulta los productos oficiales de NOAA SWPC.
