"""Construcción de variables y objetivos a partir de OMNI2 horario.

Cada fila representa un instante T (múltiplo de 3 h, inicio de un bloque Kp).
Las variables usan solo información anterior a T:
  - estadísticos del viento solar en ventanas de 1, 3, 6, 12 y 24 h antes de T,
  - el Kp de los 8 bloques anteriores,
  - hora del día y estacionalidad.
Objetivos:
  - y1: Kp del bloque [T, T+3h)  (horizonte 1: entre 0 y 3 h por delante)
  - y2: Kp del bloque [T+3h, T+6h) (horizonte 2: entre 3 y 6 h por delante)
Referencia ("persistencia"): el último Kp conocido, el del bloque [T-3h, T).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

EVENT_KP = 4.66  # Kp >= 5- (G1 o superior)
WINDOWS = (1, 3, 6, 12, 24)
KP_LAGS = 8

_STATS = {
    "bz": ("mean", "min"),
    "ey": ("mean", "max"),  # campo eléctrico de convección: v * Bs
    "speed": ("mean", "max"),
    "density": ("mean",),
    "b": ("mean", "max"),
    "pdyn": ("max",),  # presión dinámica
}


def build_dataset(df: pd.DataFrame, from_year: int = 1995) -> tuple[pd.DataFrame, list[str]]:
    idx = pd.date_range(df.index.min().floor("D"), df.index.max(), freq="h")
    full = df.reindex(idx)

    bz = full["bz"]
    bs = (-bz).clip(lower=0)
    series = {
        "bz": bz,
        "ey": full["speed"] * bs * 1e-3,  # mV/m
        "speed": full["speed"],
        "density": full["density"],
        "b": full["b"],
        "pdyn": full["density"] * full["speed"] ** 2 * 1.6726e-6,  # nPa
    }

    feats: dict[str, pd.Series] = {}
    for name, stats in _STATS.items():
        for w in WINDOWS:
            roll = series[name].rolling(w, min_periods=max(1, (w + 1) // 2))
            for s in stats:
                if w == 1 and s != stats[0]:
                    continue  # con 1 h todos los estadísticos coinciden
                # shift(1): el valor en T resume las horas [T-w, T-1], todas anteriores a T.
                feats[f"{name}_{s}_{w}h"] = getattr(roll, s)().shift(1)

    blk = (full.index.hour % 3) == 0
    data = pd.DataFrame(feats)[blk]
    kp_block = full["kp"][blk]

    for k in range(1, KP_LAGS + 1):
        data[f"kp_lag{k}"] = kp_block.shift(k)

    hour = data.index.hour
    doy = data.index.dayofyear
    data["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    data["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    data["doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    data["doy_cos"] = np.cos(2 * np.pi * doy / 365.25)

    feature_cols = list(data.columns)
    data["y1"] = kp_block
    data["y2"] = kp_block.shift(-1)

    data = data[data.index.year >= from_year]
    data = data[data["kp_lag1"].notna()]  # sin la referencia no hay comparación justa
    return data, feature_cols


def split_masks(index: pd.DatetimeIndex, train_end: int, val_end: int):
    y = index.year
    return y <= train_end, (y > train_end) & (y <= val_end), y > val_end
