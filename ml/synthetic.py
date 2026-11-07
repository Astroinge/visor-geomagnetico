"""Datos SINTÉTICOS en formato OMNI2, solo para comprobar que el código corre de principio a fin.

Los resultados obtenidos con estos datos NO tienen ningún valor científico.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from scipy.signal import lfilter

N_COLS = 55


def write_synthetic_omni2(path: Path, start: int = 1995, end: int = 2025, seed: int = 0) -> Path:
    rng = np.random.default_rng(seed)
    times = pd.date_range(f"{start}-01-01", f"{end}-12-31 23:00", freq="h")
    n = len(times)

    def ar1(phi: float, sigma: float) -> np.ndarray:
        return lfilter([1.0], [1.0, -phi], rng.normal(0, sigma, n))

    bz = ar1(0.97, 0.9)
    speed = np.clip(420 + ar1(0.995, 8), 250, 900)
    density = np.exp(1.6 + ar1(0.95, 0.25))
    b = np.sqrt(bz**2 + 25 + np.abs(ar1(0.9, 1.0)))
    ey = speed * np.clip(-bz, 0, None) * 1e-3

    s_ey = pd.Series(ey, index=times).resample("3h").mean()
    s_sp = pd.Series(speed, index=times).resample("3h").mean()
    persist = lfilter([1.0], [1.0, -0.6], rng.normal(0, 0.45, len(s_ey)))
    kp = np.clip(1.0 + 0.7 * s_ey.to_numpy() + 0.004 * (s_sp.to_numpy() - 420) + persist, 0, 9)
    kp = pd.Series(np.round(kp * 3) / 3, index=s_ey.index).reindex(times, method="ffill")
    dst = -15 - 6 * pd.Series(ey, index=times).rolling(6, min_periods=1).mean().to_numpy() + ar1(0.9, 3)

    bz_o, sp_o = bz.copy(), speed.copy()
    gap = rng.random(n) < 0.03
    bz_o[gap] = 999.9
    sp_o[gap] = 9999.0

    doy = times.dayofyear.to_numpy()
    lines = []
    for i in range(n):
        row = ["999"] * N_COLS
        row[0] = str(times[i].year)
        row[1] = str(doy[i])
        row[2] = str(times[i].hour)
        row[8] = f"{b[i]:.1f}"
        row[16] = f"{bz_o[i]:.1f}"
        row[23] = f"{density[i]:.1f}"
        row[24] = f"{sp_o[i]:.0f}."
        row[38] = str(int(round(kp.iloc[i] * 10)))
        row[40] = str(int(round(dst[i])))
        lines.append(" ".join(row))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n")
    return path
