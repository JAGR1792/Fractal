# Plan: Paralelismo y Computación Distribuida en Fractal

> **Guía de trabajo para el equipo.** Estado: plan aprobado, listo para implementar.
> Prioridad máxima: **paralelismo (CPU) + distribuido (múltiples nodos)**.
> Fecha: 2026-11-06. Rama base: `experimento_nuevo_render`.

---

## 1. Objetivo

Convertir Fractal en un caso de estudio completo de **computación paralela y distribuida**,
manteniendo la física correcta y los tests científicos. El plan debe:

1. Acelerar el motor físico con **paralelismo de datos** (rayon).
2. Exponer ese paralelismo en el API (Tokio + pool de hilos).
3. Distribuir trabajo entre **varios nodos/procesos** por red (HTTP/TCP).
4. Medir speedup, tolerancia a fallos y overhead de comunicación.
5. Estabilizar los saltos de órbita en el frontend (problema de scheduling, no de física).

**No bloqueantes (opcionales):** MPI real y CUDA real (ver §9).

---

## 2. Principios de diseño

- **ADR-0001 se mantiene por defecto**: `codigo/fisica/` no depende de nada.
  El paralelismo entra como **feature flag** `paralelo = ["dep:rayon"]`.
- El modo serial sigue existiendo siempre (tests, reproducibilidad, WASM).
- Toda salida paralela/distribuida se valida contra la serial (tolerancia `1e-12`).
- El API hace **fallback local** si no hay workers disponibles (nunca pantalla negra / nunca error duro).
- Español en código, docs y mensajes de error.

---

## 3. Arquitectura propuesta

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (TS)  — render + buffering (Fase 0)               │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTP
┌──────────────▼──────────────────────────────────────────────┐
│  Coordinador (fractal-api)                                  │
│   - Sesiones vivas (Tokio)                                  │
│   - Pool de hilos (FRACTAL_HILOS)                           │
│   - Cliente distribuido (round-robin + fallback)            │
└──────┬──────────────────────┬───────────────────────────────┘
       │ rayon (local)         │ HTTP/TCP (red)
┌──────▼──────┐        ┌──────▼──────┐  ┌─────────────┐
│ Motor físico│        │  Worker 1   │  │  Worker N   │
│ (serial/    │        │ (fractal-   │  │             │
│  paralelo)  │        │  worker)    │  │             │
└─────────────┘        └─────────────┘  └─────────────┘
```

---

## 4. Fases de implementación

### Fase 0 — Estabilizar render (frontend)

**Problema:** saltos de órbita por ventana de bloques/cursor (no es física).

Archivos: `aplicaciones/web/src/frontera.ts`, `nucleo-reproduccion.ts`, `estelas.ts`.

Tareas:
1. Sobrepredir ~1.3× bloques por tramo y recortar al `k` detectado.
2. Fundido ~1 s en empalmes.
3. Prefetch adaptativo según último tiempo de cálculo.
4. Test puro `saltoDeBucle()` + E2E largo de discontinuidad.

**Sin dependencias nuevas.**

### Fase 1 — Paralelismo de datos en el motor (PRIORIDAD MÁXIMA)

Archivos: `codigo/fisica/Cargo.toml`, `gravedad.rs`, `integrador.rs`, `estado.rs`, `lib.rs`, `benches/rendimiento.rs`.

Tareas:
1. Agregar feature flag:
   ```toml
   [dependencies]
   rayon = { version = "1.12", optional = true }
   [features]
   paralelo = ["dep:rayon"]
   ```
2. Renombrar actual a `calcular_aceleraciones_serial`.
3. Implementar `calcular_aceleraciones_paralelo` con `rayon::par_iter` sobre `i`.
4. `paso_velocity_verlet_con` acepta `Estrategia { Serial, Paralelo { hilos } }`.
5. `simular_con_paralelo(...)` manteniendo `simular_con` serial.
6. Tests de equivalencia serial vs paralelo (tolerancia `1e-12`).
7. Benchmarks Criterion: speedup vs N y vs hilos.

**Entregable:** tabla de speedup en `documentacion/`.

### Fase 2 — Paralelismo de tareas en el API

Archivos: `codigo/api/src/{almacen,sesion,rutas,main}.rs`.

Tareas:
1. Pool de Tokio configurable con `FRACTAL_HILOS`.
2. `spawn_blocking` + `Semaphore` para limitar concurrencia.
3. Sesiones usan modo paralelo si feature activo.
4. Endpoint `GET /salud/paralelo` → `{ hilos, modo }`.

### Fase 3 — Distribuido (múltiples nodos) (PRIORIDAD MÁXIMA)

Nuevo crate: `codigo/distribuido` (o módulo en `api`).

Dependencias disponibles offline: `fractal-fisica`, `axum`, `tokio`, `hyper`, `http-body-util`, `serde`, `uuid`.

#### 3.1 Worker (`fractal-worker` binario)
Endpoints:
- `GET /salud` → `{ estado, version, hilos }`
- `POST /tarea/fuerzas` → aceleraciones para índices asignados.
- `POST /tarea/simulacion` → job en background.
- `GET /tarea/:id` y `/tarea/:id/estados`.

#### 3.2 Coordinador (en el API)
- Env `NODOS_TRABAJADORES=http://host1:port,...`
- `POST /api/v1/simulaciones/distribuida` con fallback local.
- **Modo A (fuerzas distribuidas):** particionado por filas, scatter de posiciones, gather de aceleraciones.
- **Modo B (lotes):** `POST /api/v1/lotes` con array de simulaciones, round-robin.

#### 3.3 Tolerancia a fallos
- Timeout por nodo, reintento o ejecución local.
- Métricas: tiempo por nodo, bytes enviados, speedup.

### Fase 4 — Medición y documentación

1. Criterion + script de benchmark (tabla speedup).
2. Nuevo ADR `0010-paralelismo-y-distribuido.md`.
3. Actualizar `pasos_siguientes.md`.

---

## 5. Orden sugerido

1. **Fase 1** (base medible).
2. **Fase 0** (UX).
3. **Fase 2** (exponer paralelismo).
4. **Fase 3** (distribuido).
5. **Fase 4** (docs).

---

## 6. Tests requeridos

- Unit: serial vs paralelo (tolerancia `1e-12`).
- Conservación de energía en ambos modos.
- Integración: registro de worker, envío de tarea, igualdad de resultados con local.
- Fallo de worker → fallback local sin error.
- Frontend: `saltoDeBucle()` y E2E de discontinuidad.

---

## 7. Métricas de éxito

- Speedup medido ≥ 2× en N=100 con 4 hilos.
- 0 diferencias numéricas > `1e-12` entre serial y paralelo.
- Distribuido funcional con 2+ nodos locales.
- Fallback local verificado.

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Orden de suma en float | Tolerancias, no `assert_eq!` |
| Overhead de red en N pequeño | Solo distribuir si N > umbral o lotes |
| Saturación de CPU | Semaphore en API |
| Worker caído | Timeout + fallback local |

---

## 9. Opcionales (requieren instalación/internet)

- **MPI real:** instalar MS-MPI + crate `mpi`. La lógica de particionado es idéntica; solo cambia el transporte. Implementar solo si el profesor lo exige.
- **CUDA real:** instalar CUDA Toolkit + `cudarc`. Mover `calcular_aceleraciones` a compute shader. Opcional y posterior.

---

## 10. Decisiones pendientes

1. ¿El profesor exige MPI explícitamente o basta con procesos HTTP?
2. ¿Modo paralelo default en el API o opt-in?
3. ¿La nota exige gráfica de speedup? (Si sí, priorizar Fase 1 + benchmarks.)

---

**Responsable de arranque:** Fase 1 (`gravedad.rs` + feature flag). El resto del equipo puede tomar Fase 0 y Fase 3 en paralelo.

---

## 11. Estado de implementación (2026-11-06)

- [x] Fase 1 — Paralelismo de datos en el motor (`rayon`, feature `paralelo`).
  - `calcular_aceleraciones_paralelo`, `paso_velocity_verlet_*_paralelo`, `simular_*_paralelo`.
  - Tests de equivalencia serial vs paralelo.
- [x] Fase 2 — Paralelismo de tareas en el API.
  - Pool rayon configurable con `FRACTAL_HILOS`.
  - Sesiones usan modo paralelo por defecto.
- [x] Fase 3 — Distribuido.
  - Worker: `cargo run -p fractal-api --bin fractal-worker` (puerto `PUERTO`, default 3001).
  - Coordinador: `POST /api/v1/fuerzas/distribuida` con `NODOS_TRABAJADORES`.
  - Fallback local si no hay workers o fallan.
- [ ] Fase 0 — Saltos de órbita en frontend.
- [ ] Fase 4 — Benchmarks publicados + ADR-0010.

### Cómo probar distribuido

```powershell
# terminal 1
$env:PUERTO="3001"; cargo run -p fractal-api --bin fractal-worker

# terminal 2
$env:PUERTO="3000"; $env:NODOS_TRABAJADORES="http://127.0.0.1:3001"; cargo run -p fractal-api --bin fractal-api
```
