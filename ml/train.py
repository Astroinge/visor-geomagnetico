#!/usr/bin/env python
"""Entrena y evalúa modelos de Kp a corto plazo frente a la referencia de persistencia.

Uso:
    python ml/train.py                 # descarga OMNI2 y entrena con datos reales
    python ml/train.py --synthetic     # prueba rápida con datos inventados (sin valor científico)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import lightgbm as lgb
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.metrics import average_precision_score  # noqa: E402

import warnings  # noqa: E402

# LightGBM 4.7 marca `eval_set` como obsoleto, pero es el nombre que funciona en todas las 4.x.
warnings.filterwarnings("ignore", message=".*eval_set.*deprecated.*")

sys.path.insert(0, str(Path(__file__).parent))
from dataset import EVENT_KP, build_dataset, split_masks  # noqa: E402
from omni import DATA_DIR, download, read_omni, validate  # noqa: E402

HORIZONS = {1: ("y1", "0-3 h"), 2: ("y2", "3-6 h")}


# ----------------------------- métricas -----------------------------

def mae(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean(np.abs(y - p)))


def rmse(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.sqrt(np.mean((y - p) ** 2)))


def contingency(obs: np.ndarray, pred: np.ndarray) -> dict[str, float]:
    tp = int(np.sum(obs & pred))
    fp = int(np.sum(~obs & pred))
    fn = int(np.sum(obs & ~pred))
    tn = int(np.sum(~obs & ~pred))
    div = lambda a, b: float(a / b) if b > 0 else float("nan")  # noqa: E731
    return {
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "pod": div(tp, tp + fn),  # tasa de detección (recall)
        "far": div(fp, tp + fp),  # proporción de falsas alarmas
        "csi": div(tp, tp + fp + fn),  # índice de éxito crítico
    }


def csi(obs: np.ndarray, pred: np.ndarray) -> float:
    return contingency(obs, pred)["csi"]


def block_bootstrap_ci(n: int, stat, block: int = 56, n_boot: int = 400, seed: int = 0):
    """IC 95 % remuestreando tramos de 7 días (56 bloques) para respetar la autocorrelación."""
    rng = np.random.default_rng(seed)
    nb = int(np.ceil(n / block))
    vals = []
    for _ in range(n_boot):
        ids = rng.integers(0, nb, nb)
        idx = np.concatenate([np.arange(b * block, min((b + 1) * block, n)) for b in ids])
        vals.append(stat(idx))
    lo, hi = np.nanpercentile(vals, [2.5, 97.5])
    return float(lo), float(hi)


def verdict(lo: float, hi: float, lower_is_better: bool) -> str:
    if np.isnan(lo) or np.isnan(hi):
        return "sin datos suficientes"
    if lo > 0:
        return "empeora" if lower_is_better else "mejora"
    if hi < 0:
        return "mejora" if lower_is_better else "empeora"
    return "sin diferencia clara"


# ----------------------------- entrenamiento -----------------------------

def run_horizon(h: int, data: pd.DataFrame, feats: list[str], args, out: Path) -> dict:
    ycol, label = HORIZONS[h]
    d = data.dropna(subset=[ycol])
    tr, va, te = split_masks(d.index, args.train_end, args.val_end)
    Xtr, Xva, Xte = d.loc[tr, feats], d.loc[va, feats], d.loc[te, feats]
    ytr, yva, yte = d.loc[tr, ycol].to_numpy(), d.loc[va, ycol].to_numpy(), d.loc[te, ycol].to_numpy()
    base_te = d.loc[te, "kp_lag1"].to_numpy()

    n_est = 300 if args.quick else 2000
    common = dict(n_estimators=n_est, learning_rate=0.03, num_leaves=31, min_child_samples=50,
                  subsample=0.8, subsample_freq=1, colsample_bytree=0.8, random_state=0, verbose=-1)
    stop = [lgb.early_stopping(50, verbose=False)]

    reg = lgb.LGBMRegressor(**common)
    reg.fit(Xtr, ytr, eval_set=[(Xva, yva)], eval_metric="l1", callbacks=stop)
    pred_te = np.clip(reg.predict(Xte), 0, 9)

    obs_tr, obs_va, obs_te = ytr >= EVENT_KP, yva >= EVENT_KP, yte >= EVENT_KP
    if obs_tr.sum() < 20:
        raise SystemExit(f"Muy pocos eventos de entrenamiento ({obs_tr.sum()}). Amplía el rango de años.")
    clf = lgb.LGBMClassifier(**common)
    clf.fit(Xtr, obs_tr.astype(int), eval_set=[(Xva, obs_va.astype(int))], eval_metric="average_precision",
            callbacks=stop)
    p_va, p_te = clf.predict_proba(Xva)[:, 1], clf.predict_proba(Xte)[:, 1]

    # Umbral de probabilidad elegido en validación (maximiza CSI); nunca se toca con test.
    if obs_va.sum() >= 5:
        grid = np.linspace(0.05, 0.95, 91)
        thr = float(grid[int(np.nanargmax([csi(obs_va, p_va >= g) for g in grid]))])
        thr_note = "elegido en validación"
    else:
        thr, thr_note = 0.5, "por defecto (validación con pocos eventos)"
    ev_model = p_te >= thr
    ev_base = base_te >= EVENT_KP

    # ---- métricas
    ev = obs_te
    res: dict = {
        "horizonte": label, "n_train": int(tr.sum()), "n_val": int(va.sum()), "n_test": int(te.sum()),
        "eventos_train": int(obs_tr.sum()), "eventos_val": int(obs_va.sum()), "eventos_test": int(obs_te.sum()),
        "tasa_base_test": float(obs_te.mean()), "umbral_prob": thr, "umbral_nota": thr_note,
        "iter_reg": int(reg.best_iteration_ or n_est), "iter_clf": int(clf.best_iteration_ or n_est),
        "regresion": {
            "mae_modelo": mae(yte, pred_te), "mae_persistencia": mae(yte, base_te),
            "rmse_modelo": rmse(yte, pred_te), "rmse_persistencia": rmse(yte, base_te),
            "mae_modelo_en_eventos": mae(yte[ev], pred_te[ev]) if ev.any() else float("nan"),
            "mae_persistencia_en_eventos": mae(yte[ev], base_te[ev]) if ev.any() else float("nan"),
        },
        "eventos": {
            "modelo": contingency(obs_te, ev_model), "persistencia": contingency(obs_te, ev_base),
            "pr_auc_modelo": float(average_precision_score(obs_te, p_te)) if ev.any() else float("nan"),
        },
    }
    d_mae = lambda i: mae(yte[i], pred_te[i]) - mae(yte[i], base_te[i])  # noqa: E731
    d_csi = lambda i: csi(obs_te[i], ev_model[i]) - csi(obs_te[i], ev_base[i])  # noqa: E731
    lo, hi = block_bootstrap_ci(len(yte), d_mae)
    res["regresion"]["delta_mae_ic95"] = [lo, hi]
    res["regresion"]["veredicto"] = verdict(lo, hi, lower_is_better=True)
    lo, hi = block_bootstrap_ci(len(yte), d_csi)
    res["eventos"]["delta_csi_ic95"] = [lo, hi]
    res["eventos"]["veredicto"] = verdict(lo, hi, lower_is_better=False)

    # ---- guardar modelos y datos para gráficas
    reg.booster_.save_model(str(out / f"modelo_kp_h{h}_regresion.txt"))
    clf.booster_.save_model(str(out / f"modelo_kp_h{h}_evento.txt"))
    imp = pd.Series(reg.booster_.feature_importance("gain"), index=feats).sort_values(ascending=False)
    return {"res": res, "index": d.index[te], "y": yte, "pred": pred_te, "base": base_te, "imp": imp}


# ----------------------------- gráficas -----------------------------

def plot_all(runs: dict[int, dict], out: Path) -> None:
    # 1) Comparación de métricas
    fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
    labels = [f"Horizonte {r['res']['horizonte']}" for r in runs.values()]
    x = np.arange(len(labels))
    w = 0.38
    ax[0].bar(x - w / 2, [r["res"]["regresion"]["mae_persistencia"] for r in runs.values()], w, label="Persistencia", color="#999")
    ax[0].bar(x + w / 2, [r["res"]["regresion"]["mae_modelo"] for r in runs.values()], w, label="Modelo", color="#2a7de1")
    ax[0].set_title("Error absoluto medio del Kp (menor es mejor)")
    ax[1].bar(x - w / 2, [r["res"]["eventos"]["persistencia"]["csi"] for r in runs.values()], w, label="Persistencia", color="#999")
    ax[1].bar(x + w / 2, [r["res"]["eventos"]["modelo"]["csi"] for r in runs.values()], w, label="Modelo", color="#2a7de1")
    ax[1].set_title(f"Detección de Kp ≥ 5- (CSI, mayor es mejor)")
    for a in ax:
        a.set_xticks(x, labels)
        a.legend()
    fig.tight_layout()
    fig.savefig(out / "comparacion.png", dpi=130)
    plt.close(fig)

    # 2) Ventana alrededor de la mayor tormenta del periodo de prueba (horizonte 1)
    r = runs[1]
    i = int(np.argmax(r["y"]))
    lo, hi = max(0, i - 32), min(len(r["y"]), i + 33)
    t = r["index"][lo:hi]
    fig, a = plt.subplots(figsize=(10, 3.8))
    a.step(t, r["y"][lo:hi], where="post", color="black", label="Kp observado", lw=2)
    a.step(t, r["pred"][lo:hi], where="post", color="#2a7de1", label="Modelo", lw=1.6)
    a.step(t, r["base"][lo:hi], where="post", color="#999", label="Persistencia", lw=1.4, ls="--")
    a.axhline(EVENT_KP, color="#e3a400", ls=":", label="Umbral G1")
    a.set_ylim(0, 9.3)
    a.set_title(f"Mayor Kp del periodo de prueba ({t[min(i - lo, len(t) - 1)]:%Y-%m-%d}), horizonte 0-3 h")
    a.legend(ncol=4, loc="upper left")
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(out / "ventana_tormenta.png", dpi=130)
    plt.close(fig)

    # 3) Importancia de variables
    imp = runs[1]["imp"].head(15)[::-1]
    fig, a = plt.subplots(figsize=(7, 5))
    a.barh(imp.index, imp.values / imp.values.sum(), color="#2a7de1")
    a.set_title("Variables más usadas (horizonte 0-3 h, ganancia relativa)")
    fig.tight_layout()
    fig.savefig(out / "importancia.png", dpi=130)
    plt.close(fig)


# ----------------------------- informe -----------------------------

def f(x: float, nd: int = 3) -> str:
    return "—" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{nd}f}"


def write_report(runs: dict[int, dict], args, out: Path, synthetic: bool, data: pd.DataFrame) -> str:
    L: list[str] = []
    if synthetic:
        L += ["> ⚠️ **DATOS SINTÉTICOS.** Esta ejecución solo prueba que el código funciona. "
              "Los números no tienen ningún valor científico.", ""]
    L += ["# Informe: predicción de Kp a corto plazo", "",
          f"- Datos: OMNI2 horario, {data.index.min():%Y-%m-%d} a {data.index.max():%Y-%m-%d}",
          f"- Entrenamiento: hasta {args.train_end} · Validación: {args.train_end + 1}-{args.val_end} · "
          f"Prueba: {args.val_end + 1} en adelante",
          f"- Evento: Kp ≥ 5- (G1 o superior), es decir Kp ≥ {EVENT_KP:.2f}",
          "- Referencia (persistencia): se repite el último Kp conocido.",
          "- Los intervalos de confianza (IC 95 %) vienen de un remuestreo por tramos de 7 días.", ""]
    for h, r in runs.items():
        s, reg, ev = r["res"], r["res"]["regresion"], r["res"]["eventos"]
        m, b = ev["modelo"], ev["persistencia"]
        L += [f"## Horizonte {s['horizonte']} por delante", "",
              f"Muestras (bloques de 3 h): entrenamiento {s['n_train']:,}, validación {s['n_val']:,}, prueba {s['n_test']:,}. "
              f"Eventos en prueba: **{s['eventos_test']}** ({100 * s['tasa_base_test']:.1f} %).", "",
              "### Error del Kp (en prueba)", "",
              "| | Modelo | Persistencia |", "|---|---|---|",
              f"| MAE | {f(reg['mae_modelo'])} | {f(reg['mae_persistencia'])} |",
              f"| RMSE | {f(reg['rmse_modelo'])} | {f(reg['rmse_persistencia'])} |",
              f"| MAE solo en eventos | {f(reg['mae_modelo_en_eventos'])} | {f(reg['mae_persistencia_en_eventos'])} |", "",
              f"Diferencia de MAE (modelo − persistencia): IC 95 % [{f(reg['delta_mae_ic95'][0], 4)}, "
              f"{f(reg['delta_mae_ic95'][1], 4)}] → **{reg['veredicto']}**.", "",
              f"### Detección de tormentas (umbral de probabilidad {s['umbral_prob']:.2f}, {s['umbral_nota']})", "",
              "| | Modelo | Persistencia |", "|---|---|---|",
              f"| Detecciones (POD) | {f(m['pod'])} | {f(b['pod'])} |",
              f"| Falsas alarmas (FAR) | {f(m['far'])} | {f(b['far'])} |",
              f"| CSI | {f(m['csi'])} | {f(b['csi'])} |",
              f"| Aciertos / falsas alarmas / pérdidas | {m['tp']} / {m['fp']} / {m['fn']} | {b['tp']} / {b['fp']} / {b['fn']} |", "",
              f"PR-AUC del modelo: {f(ev['pr_auc_modelo'])} (un clasificador al azar daría ≈ {f(s['tasa_base_test'])}).", "",
              f"Diferencia de CSI (modelo − persistencia): IC 95 % [{f(ev['delta_csi_ic95'][0], 4)}, "
              f"{f(ev['delta_csi_ic95'][1], 4)}] → **{ev['veredicto']}**.", ""]
    L += ["## Cómo leer estos resultados", "",
          "- **MAE**: error medio en unidades de Kp. **POD**: de las tormentas reales, cuántas se detectaron. "
          "**FAR**: de las alarmas emitidas, cuántas fueron falsas. **CSI**: aciertos / (aciertos + falsas alarmas + pérdidas).",
          "- Si el veredicto es «sin diferencia clara», el modelo no se distingue de repetir el último Kp con estos datos.",
          "- La previsión de NOAA no se incluye como comparación porque no hay histórico accesible; es la referencia pendiente.",
          "- OMNI2 ya está desplazado en el tiempo hasta la Tierra. Con datos en tiempo real de L1 habría que aplicar un "
          "retraso de ~30-60 min o aceptar una pérdida de calidad.",
          "- Los datos de entrenamiento vienen de ACE/Wind/DSCOVR; NOAA ahora usa SOLAR-1. Puede haber diferencias.", ""]
    text = "\n".join(L)
    (out / "report.md").write_text(text)
    return text


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--synthetic", action="store_true", help="usar datos inventados (solo prueba de código)")
    ap.add_argument("--from-year", type=int, default=1995)
    ap.add_argument("--train-end", type=int, default=2016)
    ap.add_argument("--val-end", type=int, default=2019)
    ap.add_argument("--quick", action="store_true", help="menos árboles, para pruebas")
    ap.add_argument("--out", type=Path, default=Path(__file__).parent / "out")
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    if args.synthetic:
        from synthetic import write_synthetic_omni2

        print("*** DATOS SINTÉTICOS: los resultados no tienen valor científico ***\n")
        path = write_synthetic_omni2(DATA_DIR / "synthetic_omni2.dat", start=args.from_year)
    else:
        path = download(DATA_DIR / "omni2_all_years.dat")

    df = read_omni(path)
    validate(df)
    data, feats = build_dataset(df, args.from_year)
    print(f"Dataset: {len(data):,} bloques de 3 h, {len(feats)} variables.\n")

    runs = {h: run_horizon(h, data, feats, args, args.out) for h in HORIZONS}
    plot_all(runs, args.out)
    (args.out / "metrics.json").write_text(json.dumps({h: r["res"] for h, r in runs.items()}, indent=2))
    (args.out / "features.json").write_text(json.dumps({"features": feats, "evento_kp": EVENT_KP}, indent=2))
    print(write_report(runs, args, args.out, args.synthetic, data))


if __name__ == "__main__":
    main()
