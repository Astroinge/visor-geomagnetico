"""Descarga y lectura de OMNI2 (promedios horarios de viento solar e índices geomagnéticos).

Fuente: NASA SPDF, https://spdf.gsfc.nasa.gov/pub/data/omni/low_res_omni/
Descripción de columnas: omni2.text en el mismo directorio.

OMNI2 ya viene propagado en el tiempo hasta el frente de choque terrestre, es decir,
una hora OMNI corresponde a la llegada a la Tierra, unos 30-60 min después de la
medición en L1. Hay que tenerlo en cuenta si el modelo se usa con datos en tiempo real.
"""

from __future__ import annotations

import shutil
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

URL = "https://spdf.gsfc.nasa.gov/pub/data/omni/low_res_omni/omni2_all_years.dat"
DATA_DIR = Path(__file__).parent / "data"

# Posiciones (base 0) en las 55 columnas de omni2_all_years.dat.
# Si la validación falla, compara con omni2.text y corrige aquí.
COLS = {
    "year": 0,
    "doy": 1,
    "hour": 2,
    "b": 8,  # campo magnético medio |B| (nT)
    "bz": 16,  # Bz GSM (nT)
    "density": 23,  # densidad de protones (n/cc)
    "speed": 24,  # velocidad del plasma (km/s)
    "kp": 38,  # Kp x 10
    "dst": 40,  # Dst (nT)
}
# Valores de relleno (dato ausente).
FILL = {"b": 999.9, "bz": 999.9, "density": 999.9, "speed": 9999.0, "kp": 99.0, "dst": 99999.0}


def download(dest: Path, url: str = URL, retries: int = 3) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1_000_000:
        print(f"Usando archivo existente: {dest} ({dest.stat().st_size / 1e6:.0f} MB)")
        return dest
    for attempt in range(1, retries + 1):
        try:
            print(f"Descargando {url} (intento {attempt}/{retries})...", flush=True)
            req = urllib.request.Request(url, headers={"User-Agent": "visor-geomagnetico-ml/0.1"})
            tmp = dest.with_suffix(".tmp")
            with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
                shutil.copyfileobj(r, f)
            tmp.replace(dest)
            print(f"OK: {dest.stat().st_size / 1e6:.0f} MB")
            return dest
        except Exception as e:  # noqa: BLE001 - se informa y se reintenta
            print(f"  fallo: {e}", file=sys.stderr)
            time.sleep(3 * attempt)
    raise SystemExit(f"No se pudo descargar {url}")


def read_omni(path: Path) -> pd.DataFrame:
    names = [n for n, _ in sorted(COLS.items(), key=lambda kv: kv[1])]
    raw = pd.read_csv(path, sep=r"\s+", header=None, usecols=sorted(COLS.values()), dtype=np.float64)
    raw.columns = names

    for col, fill in FILL.items():
        raw.loc[raw[col] >= fill - 0.5, col] = np.nan

    t = (
        pd.to_datetime(raw["year"].astype(int).astype(str), format="%Y")
        + pd.to_timedelta(raw["doy"] - 1, unit="D")
        + pd.to_timedelta(raw["hour"], unit="h")
    )
    df = raw.drop(columns=["year", "doy", "hour"])
    df.index = pd.DatetimeIndex(t, name="time")
    df = df[~df.index.duplicated()].sort_index()
    # Kp viene como entero x10 (0, 3, 7, 10...). Lo paso al tercio más cercano (0, 0.33, 0.67, 1...).
    df["kp"] = np.round(df["kp"] / 10.0 * 3.0) / 3.0
    return df


def validate(df: pd.DataFrame) -> None:
    """Comprueba que las columnas leídas tienen valores físicamente plausibles."""
    recent = df.loc["1995":]
    if len(recent) == 0:
        raise ValueError("El archivo no tiene datos posteriores a 1995.")
    med = recent.median(numeric_only=True)
    cover = recent[["bz", "speed", "density", "kp"]].notna().mean()
    print("\nComprobación de columnas (datos desde 1995):")
    print(pd.DataFrame({"mediana": med, "mínimo": recent.min(), "máximo": recent.max()}).round(2).to_string())
    print("Cobertura (fracción con dato):", cover.round(3).to_dict())

    problems = []
    if not (0 <= recent["kp"].min() and recent["kp"].max() <= 9.01):
        problems.append("Kp fuera de 0-9")
    if not (250 <= med["speed"] <= 600):
        problems.append(f"velocidad mediana {med['speed']:.0f} km/s fuera de 250-600")
    if not abs(med["bz"]) < 1.5:
        problems.append(f"Bz mediana {med['bz']:.2f} nT demasiado lejos de 0")
    if not (1 <= med["density"] <= 15):
        problems.append(f"densidad mediana {med['density']:.1f} fuera de 1-15")
    if not (2 <= med["b"] <= 10):
        problems.append(f"|B| mediana {med['b']:.1f} nT fuera de 2-10")
    if cover.min() < 0.4:
        problems.append(f"cobertura baja: {cover.idxmin()} = {cover.min():.2f}")
    if problems:
        raise ValueError(
            "Las columnas no parecen corresponder a lo esperado: "
            + "; ".join(problems)
            + ". Compara con omni2.text y ajusta COLS/FILL en ml/omni.py."
        )
    print("Comprobación superada.\n")
