# Integrador Numérico — Velocity Verlet

## 1. ¿Por qué Velocity Verlet?

Para sistemas gravitacionales, el integrador debe conservar energía a **largo plazo** (no solo ser preciso por paso). Comparación de métodos comunes:

| Método | Orden | ¿Conserva energía? | ¿Simétrico? | ¿Coste/paso |
|--------|-------|-------------------|-------------|-------------|
| Euler explícito | 1 | No (deriva lineal) | No | 1 eval |
| Euler semi-implícito | 1 | Aproximado | No | 1 eval |
| Runge-Kutta 4 | 4 | No (deriva lenta) | No | 4 evals |
| **Velocity Verlet** | **2** | **Sí (oscilación acotada)** | **Sí** | **1 eval** |
| Dormand-Prince | 5-4 adaptativo | No | No | 6 evals |

**Decisión:** Velocity Verlet es el estándar en dinámica molecular y simulaciones N-cuerpos educativas porque:
1. Es **simple de implementar** (~10 líneas)
2. **Conserva energía** sin deriva secular (la energía oscila pero no crece)
3. Es **reversible en tiempo** (propiedad de simetría que Euler y RK4 no tienen)
4. Tiene **coste mínimo** por paso (1 evaluación de fuerzas)

## 2. Algoritmo

Dado estado actual: posiciones `r(t)`, velocidades `v(t)`, paso `dt`:

```
1. a(t) = compute_acceleraciones(r(t))
2. r(t + dt) = r(t) + v(t) * dt + 0.5 * a(t) * dt²
3. a(t + dt) = compute_acceleraciones(r(t + dt))
4. v(t + dt) = v(t) + 0.5 * (a(t) + a(t + dt)) * dt
```

### ¿Por qué funciona?

El método viene de expandir Taylor en `t + dt` y `t - dt`:

```
r(t + dt) = r(t) + v(t) dt + 0.5 a(t) dt² + O(dt³)
r(t - dt) = r(t) - v(t) dt + 0.5 a(t) dt² + O(dt³)
```

Sumando: `r(t + dt) + r(t - dt) = 2 r(t) + a(t) dt²` → **leapfrog**.

La velocidad se actualiza con el promedio de aceleraciones antes y después, lo que mejora la conservación.

## 3. Propiedades Demostrables

| Propiedad | Demostración |
|-----------|--------------|
| Orden 2 | Error local O(dt³), global O(dt²) |
| Conservación de momento | Σ a_i = 0 por tercera ley de Newton |
| Conservación de energía | La energía total oscila con amplitud O(dt²) pero no deriva |
| Reversibilidad | Sustituir dt → -dt deja el algoritmo invariante |

## 4. Pseudocódigo en Rust

```rust
/// Un paso de Velocity Verlet para un sistema de N cuerpos.
///
/// # Argumentos
/// * `cuerpos` — slice mutable de cuerpos (se actualiza in-place)
/// * `dt` — paso temporal en segundos
///
/// # Complejidad
/// * Tiempo: O(N²) por paso
/// * Memoria: O(N) adicional para aceleraciones
pub fn paso_velocity_verlet(cuerpos: &mut [Cuerpo], dt: f64) {
    let n = cuerpos.len();
    let mut aceleraciones = calcular_aceleraciones(cuerpos);  // paso 1

    // paso 2: actualizar posiciones
    for i in 0..n {
        cuerpos[i].posicion = cuerpos[i].posicion
            + cuerpos[i].velocidad * dt
            + aceleraciones[i] * (0.5 * dt * dt);
    }

    let nuevas_aceleraciones = calcular_aceleraciones(cuerpos);   // paso 3

    // paso 4: actualizar velocidades
    for i in 0..n {
        cuerpos[i].velocidad = cuerpos[i].velocidad
            + (aceleraciones[i] + nuevas_aceleraciones[i]) * (0.5 * dt);
    }
}
```

## 5. Selección del Paso Temporal

El paso `dt` es el **parámetro más crítico** del simulador. Un `dt` grande rompe la órbita; un `dt` pequeño es lento.

### Regla general

```
dt < T_min / 200
```

donde `T_min` es el período orbital más corto del sistema.

| Escenario | T_min | dt recomendado | Pasos/órbita |
|-----------|-------|----------------|--------------|
| Tierra-Luna | 27.3 días | 600 s (10 min) | 390 |
| Sistema Solar | 88 días (Mercurio) | 3600 s (1 hora) | 2112 |
| Binaria cercana | 1 hora | 60 s | 60 |
| Tres cuerpos caótico | — | 300 s | — |

### ¿Por qué no paso adaptativo?

El paso adaptativo (Dormand-Prince, por ejemplo) es útil para encuentros cercanos, pero:
1. Es **más complejo** de implementar y debuggear
2. **Rompe la reversibilidad** (cada paso tiene distinto dt)
3. Para educación, un `dt` fijo y bien elegido es **más pedagógico**

Se deja como mejora futura (Etapa 7).

## 6. Criterios de Convergencia

Para validar que el integrador está bien implementado:

### Test 1: Órbita circular analítica

Sistema de dos cuerpos con:
- `m1 >> m2` (ej: Sol y Tierra)
- `r = 1 UA`, `v = sqrt(G * M☉ / r)`

**Resultado esperado:** la distancia `|r(t)|` debe permanecer constante con oscilación `< 0.1%`.

### Test 2: Conservación de energía

La energía mecánica total `E = K + U` debe conservarse:

```
K = Σ 0.5 * m_i * |v_i|²
U = -Σ_{i<j} G * m_i * m_j / |r_ij|
```

**Resultado esperado:** `|E(t) - E(0)| / |E(0)| < 1e-8` tras 10 000 pasos.

### Test 3: Conservación de momento

El momento total `P = Σ m_i * v_i` debe ser constante:

**Resultado esperado:** `|P(t) - P(0)| < 1e-12 * |P(0)|`.

### Test 4: Convergencia de orden 2

Si simulamos con `dt` y `dt/2`, el error de posición debe reducirse ~4x:

```
error(dt) / error(dt/2) ≈ 4
```

## 7. Errores Comunes y Cómo Evitarlos

| Error | Síntoma | Solución |
|-------|---------|----------|
| Olvidar `0.5` en aceleración | La órbita se infla | Verificar fórmula de Verlet |
| Usar aceleración vieja en velocidad | Energía deriva | Promediar `a(t)` y `a(t+dt)` |
| `dt` demasiado grande | Órbita se vuelve hiperbólica | Reducir `dt` y verificar |
| No excluir `j == i` | Fuerza infinita | `if i != j` en el loop |
| Mezclar unidades | Resultados absurdos | SI interno, conversión en bordes |

## 8. Futuro: Dormand-Prince (RK45)

Para la Etapa 7 (escalabilidad), se evaluará un integrador adaptativo:

- **Ventaja:** paso variable según误差 estimado
- **Desventaja:** 6 evaluaciones de fuerzas por paso (más caro)
- **Cuándo usarlo:** encuentros cercanos, colisiones, sistemas con escalas temporales muy distintas

No se implementa en v1 para mantener el código simple y educativo.
