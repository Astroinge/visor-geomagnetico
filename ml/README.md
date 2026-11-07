# Modelo de Kp a corto plazo

Experimento para comprobar si un modelo (LightGBM) predice el Kp de las próximas horas mejor que repetir el último Kp conocido ("persistencia").

- **Datos:** OMNI2 horario (NASA SPDF): viento solar (Bz, velocidad, densidad, |B|) y Kp, desde 1995.
- **Variables:** estadísticos del viento solar en ventanas de 1, 3, 6, 12 y 24 h, los 8 últimos Kp, hora del día y estación.
- **Objetivos:** Kp del bloque de 3 h que empieza en T (0-3 h por delante) y del siguiente (3-6 h).
- **Evaluación:** por años, sin mezclar fechas (entrenamiento ≤ 2016, validación 2017-2019, prueba ≥ 2020). El umbral de alarma se fija en validación. Los intervalos de confianza se calculan por remuestreo de tramos de 7 días.
- **Salida (`ml/out/`):** `report.md`, `metrics.json`, gráficas `.png` y los modelos entrenados (`.txt`).

## Ejecutar en GitHub Actions (recomendado)

1. Pestaña **Actions** → **Entrenar y evaluar modelo de Kp** → **Run workflow**.
2. Al terminar, el informe aparece en el resumen del trabajo y los archivos en *Artifacts*.

## Ejecutar en Google Colab

En una celda nueva:

```python
!git clone https://github.com/Astroinge/visor-geomagnetico
%cd visor-geomagnetico
!pip -q install -r ml/requirements.txt
!python ml/train.py
```

Después, `ml/out/report.md` y las imágenes están en el panel de archivos de Colab.

## Ejecutar en local

```bash
pip install -r ml/requirements.txt scipy
python ml/train.py            # descarga ~170 MB la primera vez
python ml/train.py --synthetic --quick   # prueba de código con datos inventados
```

## Limitaciones conocidas

- OMNI2 está propagado hasta la Tierra; los datos en tiempo real de L1 no. Para usar el modelo en el visor habría que corregir ese desfase.
- Los datos históricos vienen de ACE, Wind y DSCOVR; NOAA ahora usa SOLAR-1.
- No se compara con la previsión de NOAA porque no hay un histórico accesible de ella.
- `--synthetic` solo comprueba que el código corre: sus resultados no significan nada.
