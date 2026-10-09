# Modelo Científico — Fractal

## 1. ¿Por qué este modelo?

Fractal es un **simulador educativo**, no un software profesional de mecánica celeste. Por eso elegimos la **ley de gravitación universal de Newton** en lugar de relatividad general:

| Criterio | Newton | Relatividad General |
|----------|--------|---------------------|
| Precisión para Sistema Solar | ~1e-8 (suficiente) | ~1e-14 (excesivo) |
| Coste computacional | O(N²) simple | O(N²) + tensors complejos |
| Comprensión estudiantil | Fácil de enseñar | Requiere geometría diferencial |
| Validación en clase | Sí (órbitas elípticas) | No (requiere datos observacionales) |

**Decisión:** Newton es la herramienta pedagógicamente correcta. La relatividad general se deja fuera del alcance inicial (ver sección 13 del plan).

## 2. Ley de Gravitación Universal

La fuerza que ejerce el cuerpo `j` sobre el cuerpo `i` es:

```
F_ij = G * (m_i * m_j) / |r_ij|³ * r_ij
```

donde:
- `r_ij = r_j - r_i` (vector que apunta de `i` hacia `j`)
- `G = 6.67430e-11 m³/(kg·s²)` (constante gravitacional CODATA 2018)

### ¿Por qué esta forma vectorial?

La forma `r_ij / |r_ij|³` equivale a `r̂_ij / |r_ij|²` (dirección unitaria sobre distancia al cuadrado). Escribirlo con el cubo en el denominario **evita calcular una raíz cuadrada adicional** para normalizar, lo que mejora el rendimiento en el loop O(N²).

## 3. Aceleración de cada cuerpo

La aceleración del cuerpo `i` es la **suma vectorial** de las fuerzas de todos los demás:

```
a_i = Σ_{j≠i} G * m_j / |r_ij|³ * r_ij
```

**Nota importante:** no dividimos entre `m_i` porque la aceleración es fuerza sobre masa, y la ley de Newton ya incluye `m_i` en el numerador. Al cancelar, la aceleración **no depende de la masa del cuerpo que la recibe** — esto es el principio de equivalencia débil.

## 4. Convención de Coordenadas

| Aspecto | Decisión | Justificación |
|---------|----------|---------------|
| Origen | Baricentro del sistema | Simplifica conservación de momento |
| Ejes | Eclíptica J2000 | Estándar astronómico |
| Unidades | SI (m, kg, s) | Evita errores de conversión |
| Precisión | `f64` (64 bits) | ~15 dígitos significativos |

### ¿Por qué baricéntrico?

En un sistema aislado, el centro de masa se mueve a velocidad constante (conservación de momento). Si ponemos el origen en el baricentro, **el momento total es siempre cero**, lo que facilita verificar numéricamente que el simulador no tiene "deriva fantasma".

## 5. Constantes Físicas

| Nombre | Valor | Unidad | Fuente |
|--------|-------|--------|--------|
| G | 6.67430e-11 | m³/(kg·s²) | CODATA 2018 |
| UA | 1.495978707e11 | m | IAU 2012 |
| M☉ | 1.98892e30 | kg | IERS 2009 |
| Día | 86400 | s | Definición |
| Año juliano | 365.25 | días | Convención astronómica |

**¿Por qué no usar unidades astronómicas internamente?**

Porque mezclar unidades (masa en M☉, distancia en UA, tiempo en días) requiere un sistema de unidades consistente (como el de `astropy`). En un motor educativo, el SI es más transparente: si un estudiante ve `masa: 5.972e24`, sabe que son kg.

## 6. Datos Iniciales del Sistema Solar

Los elementos orbitales provienen de aproximaciones J2000 (época estándar). Para un simulador educativo, la precisión de 3-4 cifras significativas es suficiente.

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

**Velocidades iniciales:** se calculan como `v = sqrt(G * M☉ / a)` (aproximación circular) para que las órbitas sean estables desde el inicio.

## 7. Limitaciones del Modelo (por qué esto importa)

| Limitación | Qué significa | Cuándo importa |
|------------|----------------|----------------|
| Puntuales | Los cuerpos no tienen estructura interna | Nunca en v1 (solo órbitas) |
| Newtoniano | Sin relatividad general | Mercurio: precesión 43"/siglo |
| Aislado | Sin perturbaciones externas | Cerca de otros sistemas estelares |
| Rígido | Sin deformación mareal | Sistemas binarios muy cercanos |
| O(N²) | Coste cuadrático | N > 10 000 cuerpos |

**Regla pedagógica:** estas limitaciones deben ser **visibles en la interfaz educativa**. Cuando un estudiante modifique un parámetro y vea un resultado "raro", debe poder consultar si es efecto físico real o limitación del modelo.

## 8. Validación del Modelo

El modelo se valida comparando con soluciones analíticas conocidas:

1. **Dos cuerpos:** la órbita debe ser una elipse con período `T = 2π sqrt(a³ / G(M+m))`
2. **Conservación de energía:** `|E(t) - E(0)| / E(0) < 1e-8` en 10 000 pasos
3. **Conservación de momento:** `|P(t) - P(0)| < 1e-12` (debe ser exacto)
4. **Convergencia:** reducir `dt` a la mitad debe reducir el error ~4x (orden 2)

Estas validaciones son **tests automatizados** que corren en CI. Si alguien rompe el modelo, CI lo detecta.
