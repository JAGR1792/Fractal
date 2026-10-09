# Integrador Numérico — Fractal

## 1. Velocity Verlet (Leapfrog)

Método de segundo orden con buenas propiedades de conservación para sistemas gravitacionales.

### Algoritmo

Dado estado actual: posiciones `r(t)`, velocidades `v(t)`, paso `dt`:

```
1. a(t) = compute_accelerations(r(t))
2. r(t + dt) = r(t) + v(t) * dt + 0.5 * a(t) * dt²
3. a(t + dt) = compute_accelerations(r(t + dt))
4. v(t + dt) = v(t) + 0.5 * (a(t) + a(t + dt)) * dt
```

### Propiedades

| Propiedad | Valor |
|-----------|-------|
| Orden | 2 (error local O(dt³)) |
| Simétrico | Sí (reversible en tiempo) |
| Conservación de energía | Buena a largo plazo (oscilación acotada) |
| Conservación de momento | Exacta (por construcción) |
| Coste por paso | 1 evaluación de fuerzas |

### Pseudocódigo

```rust
fn velocity_verlet_step(bodies: &mut [Body], dt: f64) {
    let n = bodies.len();
    let mut accel = compute_accelerations(&bodies);  // paso 1

    // paso 2: actualizar posiciones
    for i in 0..n {
        bodies[i].position = bodies[i].position
            + bodies[i].velocity * dt
            + accel[i] * (0.5 * dt * dt);
    }

    let new_accel = compute_accelerations(&bodies);   // paso 3

    // paso 4: actualizar velocidades
    for i in 0..n {
        bodies[i].velocity = bodies[i].velocity
            + (accel[i] + new_accel[i]) * (0.5 * dt);
    }
}
```

## 2. Criterios de Convergencia

Para un sistema de dos cuerpos con solución analítica conocida:

1. **Error de posición:** `|r_sim(t) - r_exact(t)| / |r_exact(t)| < tolerancia`
2. **Conservación de energía:** `|E(t) - E(0)| / |E(0)| < 1e-8` tras 10 000 pasos
3. **Conservación de momento:** `|P(t) - P(0)| < 1e-10 * |P(0)|`
4. **Convergencia con dt:** reducir `dt` a la mitad debe reducir error ~4x (orden 2)

## 3. Selección del Paso Temporal

| Escenario | dt recomendado | Justificación |
|-----------|----------------|---------------|
| Tierra-Luna | 600 s (10 min) | Período 27 días; 390 pasos por órbita |
| Sistema Solar | 3600 s (1 hora) | Mercurio período 88 días; 2112 pasos |
| Binaria cercana | 60 s | Encuentros cercanos requieren respuión |
| Tres cuerpos caótico | 300 s | Sensibilidad a condiciones iniciales |

**Regla general:** `dt < T_min / 200` donde `T_min` es el período orbital más corto.

## 4. Integrador Futuro: Dormand-Prince (RK45)

Para problemas que requieran:
- Estimación de error por paso
- Paso adaptativo
- Encuentros cercanos con colisiones

No se implementa en v1. Se documenta para la Etapa 7.

## 5. Validación del Integrador

Tests obligatorios (ver `crates/physics/tests/`):

1. `orbita_circular_dos_cuerpos` — radio y período coinciden con analítica
2. `conservacion_energia` — deriva < 1e-8 en 10 000 pasos
3. `conservacion_momento` — deriva < 1e-12
4. `convergencia_orden2` — error ∝ dt²
5. `colision_detectada` — distancia < suma de radios
