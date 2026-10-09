# ADR-0006: API Axum + Tokio para simulaciones en background (Etapa 3)

## Estado
Aceptado.

## Contexto

Etapa 2 dejó ULTRA/LITE presentando con datos locales (`public/datos/*.json`, demo sin servidor en `gpu.ts`). Para física real hay que exponer `codigo/fisica` (Velocity Verlet, ADR-0001/0002, SI en ADR-0003) por HTTP sin bloquear el frame del navegador. Alternativas: cálculo en frontend (bloquea UI, duplica física en TS), WebSocket puro (más complejo), o API async con jobs.

## Decisión

- **Axum 0.7 + Tokio full** en `codigo/api` (crate `fractal-api` + binario `fractal-api`, puerto `3000`, `PUERTO` lo cambia).
- **Jobs en memoria:** `POST /api/v1/simulaciones` valida y devuelve `202 {id, estado: pendiente}`; `tokio::spawn` + `spawn_blocking(simular)` corre Velocity Verlet; `GET /:id` da `{estado, progreso, total_estados}`; `GET /:id/estados?desde=&limite=` pagina el historial.
- **Contrato:** entrada `PeticionSimulacion {cuerpos, dt, pasos, cada_n}` con validación en español (`MAX_CUERPOS=128`, `MAX_PASOS=200_000`); salida `Estado` de `fractal-fisica` en JSON en esta etapa. El binario `Float32Array` (`binario.ts`, `renderizador.md §4.2`) llega después sin romper rutas.
- **CORS permissive** para que Vite `:5173` llame en desarrollo; `GET /salud` para CI/frontend.
- Español, sin `unwrap` en handlers, errores siempre `{error: mensaje}`.

## Consecuencias

### Ganamos
- Frontend desacoplado del motor; ULTRA/LITE solo renderizan.
- UI nunca bloquea; simulaciones largas sobreviven al frame.
- Testeable sin navegador (`axum-test` en `tests/flujo_minimo.rs`).

### Perdemos
- Sin persistencia: al reiniciar se pierden los jobs (aceptable en Etapa 3).
- JSON más grande que binario (5-10x); se mitiga con paginación y luego binario.
- Falta streaming/progreso fino (progreso 0/0.5/1 por ahora).

## Relacionado
`documentacion/arquitectura/renderizador.md §4`, `aplicaciones/web/src/binario.ts`, `CONTRIBUTING.md` (ejemplo de tests de API).
