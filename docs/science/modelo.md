# Modelo Científico — Fractal

## 1. Ley de Gravitación Universal de Newton

La fuerza que ejerce el cuerpo `j` sobre el cuerpo `i` es:

```
F_ij = G * (m_i * m_j) / |r_ij|^3 * r_ij
```

donde:
- `r_ij = r_j - r_i` (vector de i a j)
- `G = 6.67430e-11 m³/(kg·s²)` (constante gravitacional CODATA 2018)

La aceleración del cuerpo `i` es la suma de fuerzas de todos los demás:

```
a_i = Σ_{j≠i} G * m_j / |r_ij|^3 * r_ij
```

## 2. Convención de Coordenadas

- **Sistema de referencia:** baricéntrico (centro de masa del sistema)
- **Eje X:** plano de la eclíptica, dirección equinoccio vernal J2000
- **Eje Y:** plano de la eclíptica, perpendicular a X
- **Eje Z:** perpendicular al plano de la eclíptica (norte)
- **Época de referencia:** J2000 (2000-01-01T12:00:00 TT)

## 3. Unidades

| Magnitud | Unidad SI | Unidad astronómica |
|----------|-----------|---------------------|
| Masa | kg | M☉ = 1.989e30 kg |
| Distancia | m | UA = 1.496e11 m |
| Tiempo | s | día = 86400 s |
| Velocidad | m/s | km/s |
| Fuerza | N | — |

**Convención interna del motor:** SI (metros, kg, segundos).
**Conversión:** solo en los límites de entrada (API) y salida (visualización).

## 4. Constantes Físicas

| Nombre | Valor | Unidad |
|--------|-------|--------|
| G | 6.67430e-11 | m³/(kg·s²) |
| UA | 1.495978707e11 | m |
| M☉ | 1.98892e30 | kg |
| Día | 86400 | s |
| Año juliano | 365.25 | días |

## 5. Cuerpos del Sistema Solar (J2000, valores aproximados)

| Cuerpo | Masa (kg) | Radio (m) | a (UA) | e | i (°) |
|--------|-----------|-----------|--------|---|------|
| Sol | 1.989e30 | 6.957e8 | — | — | — |
| Mercurio | 3.285e23 | 2.4397e6 | 0.387 | 0.206 | 7.00 |
| Venus | 4.867e24 | 6.0518e6 | 0.723 | 0.007 | 3.39 |
| Tierra | 5.972e24 | 6.371e6 | 1.000 | 0.017 | 0.00 |
| Marte | 6.39e23 | 3.3895e6 | 1.524 | 0.093 | 1.85 |
| Júpiter | 1.898e27 | 6.9911e7 | 5.203 | 0.049 | 1.30 |
| Saturno | 5.683e26 | 5.8232e7 | 9.537 | 0.054 | 2.49 |
| Urano | 8.681e25 | 2.5362e7 | 19.19 | 0.047 | 0.77 |
| Neptuno | 1.024e26 | 2.4622e7 | 30.07 | 0.009 | 1.77 |

## 6. Limitaciones del Modelo

1. **Puntuales:** los cuerpos son masas puntuales; su radio solo se usa para colisiones y visualización
2. **Newtoniano:** sin relatividad general; no captura precesión de Mercurio
3. **Aislado:** sin fuerzas de marea, arrastre de radiación, o perturbaciones externas
4. **Rígido:** sin deformación ni rotación interna acoplada a la órbita
5. **N limitado:** O(N²) directo; ineficiente para N > 10 000

Estas limitaciones deben documentarse en la interfaz educativa.
