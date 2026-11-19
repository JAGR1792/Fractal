#!/usr/bin/env python3
"""Regenera *.trayectoria.json (un período, G=m=1) vía Cash–Karp.

Fuente de CI: catálogo IPB / Observable @rreusser
(periodic-planar-three-body-orbits). Las familias no-figure-8 son inestables;
Fractal Local reproduce estas trayectorias en bucle (como el notebook).
"""

from __future__ import annotations

import json
import math
from pathlib import Path

# Cash–Karp
B = [
    [0],
    [1 / 5],
    [3 / 40, 9 / 40],
    [3 / 10, -9 / 10, 6 / 5],
    [-11 / 54, 5 / 2, -70 / 27, 35 / 27],
    [1631 / 55296, 175 / 512, 575 / 13824, 44275 / 110592, 253 / 4096],
]
C5 = [37 / 378, 0, 250 / 621, 125 / 594, 0, 512 / 1771]
C4 = [2825 / 27648, 0, 18575 / 48384, 13525 / 55296, 277 / 14336, 1 / 4]

ORBITS = {
    "orbit_butterfly": {
        "T": 6.234671,
        "x": [[-1, 0], [1, 0], [0, 0]],
        "v": [[0.306893, 0.125507], [0.306893, 0.125507], [-0.613786, -0.251014]],
    },
    "orbit_dragonfly": {
        "T": 21.272338,
        "x": [[-1, 0], [1, 0], [0, 0]],
        "v": [[0.080584, 0.588836], [0.080584, 0.588836], [-0.161168, -1.177672]],
    },
    "orbit_yin_yang": {
        "T": 17.32881,
        "x": [[-1, 0], [1, 0], [0, 0]],
        "v": [[0.513938, 0.304736], [0.513938, 0.304736], [-1.027876, -0.609472]],
    },
    "orbit_yarn": {
        "T": 14.894306,
        "x": [[-1, 0], [1, 0], [0, 0]],
        "v": [[0.464445, 0.39606], [0.464445, 0.39606], [-0.92889, -0.79212]],
    },
    "orbit_moth": {
        "T": 28.669273,
        "x": [[-1, 0], [1, 0], [0, 0]],
        "v": [[0.439166, 0.452968], [0.439166, 0.452968], [-0.878332, -0.905936]],
    },
    "orbit_figure8_ipb": {
        "T": 6.325897,
        "x": [[-1, 0], [1, 0], [0, 0]],
        "v": [[0.347113, 0.532727], [0.347113, 0.532727], [-0.694226, -1.065454]],
    },
    "orbit_broucke": {
        "T": 6.283213,
        "x": [[-0.9892620043, 0], [2.2096177241, 0], [-1.2203557197, 0]],
        "v": [[0, 1.9169244185], [0, 0.1910268738], [0, -2.1079512924]],
    },
}


def deriv(y: list[float], m: list[float]) -> list[float]:
    yp = [0.0] * 12
    yp[0], yp[1], yp[4], yp[5], yp[8], yp[9] = y[2], y[3], y[6], y[7], y[10], y[11]
    acc = [[0.0, 0.0] for _ in range(3)]
    for i, j in ((0, 1), (0, 2), (1, 2)):
        dx = y[4 * j] - y[4 * i]
        dy = y[4 * j + 1] - y[4 * i + 1]
        r2 = dx * dx + dy * dy
        r3 = r2 * math.sqrt(r2)
        fx, fy = dx / r3, dy / r3
        acc[i][0] += fx * m[j]
        acc[i][1] += fy * m[j]
        acc[j][0] -= fx * m[i]
        acc[j][1] -= fy * m[i]
    yp[2], yp[3] = acc[0]
    yp[6], yp[7] = acc[1]
    yp[10], yp[11] = acc[2]
    return yp


def ode45(y0: list[float], m: list[float], t_end: float, tol: float = 1e-10, h0: float = 1e-4):
    t = 0.0
    y = list(y0)
    h = h0
    traj = [[y[0], y[1], y[4], y[5], y[8], y[9]]]
    times = [0.0]
    steps = 0
    while t < t_end and steps < 2_000_000:
        if t + h > t_end:
            h = t_end - t
        k = []
        for s in range(6):
            ys = list(y)
            for prev in range(s):
                for i in range(12):
                    ys[i] += h * B[s][prev] * k[prev][i]
            k.append(deriv(ys, m))
        y5 = [y[i] + h * sum(C5[s] * k[s][i] for s in range(6)) for i in range(12)]
        y4 = [y[i] + h * sum(C4[s] * k[s][i] for s in range(6)) for i in range(12)]
        err = max(abs(y5[i] - y4[i]) for i in range(12)) + 1e-30
        if err <= tol:
            t += h
            y = y5
            steps += 1
            if t - times[-1] >= t_end / 600 or t >= t_end:
                traj.append([y[0], y[1], y[4], y[5], y[8], y[9]])
                times.append(t)
            h *= min(2.0, max(0.2, 0.9 * (tol / err) ** 0.2))
        else:
            h *= max(0.2, 0.9 * (tol / err) ** 0.25)
            if h < 1e-14:
                raise RuntimeError("step underflow")
    return times, traj, steps


def main() -> None:
    out = Path(__file__).resolve().parent
    for oid, o in ORBITS.items():
        y0: list[float] = []
        for i in range(3):
            y0 += [o["x"][i][0], o["x"][i][1], o["v"][i][0], o["v"][i][1]]
        times, traj, steps = ode45(y0, [1.0, 1.0, 1.0], o["T"])
        err = math.hypot(traj[-1][0] - traj[0][0], traj[-1][1] - traj[0][1])
        if len(traj) > 480:
            step = max(1, len(traj) // 400)
            idx = list(range(0, len(traj) - 1, step)) + [len(traj) - 1]
            traj = [traj[i] for i in idx]
            times = [times[i] for i in idx]
        path = out / f"{oid}.trayectoria.json"
        path.write_text(
            json.dumps(
                {
                    "id": oid,
                    "periodo_natural": o["T"],
                    "unidades": "G=m=1",
                    "muestras": len(traj),
                    "t": times,
                    "xy": traj,
                },
                separators=(",", ":"),
            )
        )
        print(f"{oid}: n={len(traj)} steps={steps} close_err={err:.2e} -> {path.name}")


if __name__ == "__main__":
    main()
