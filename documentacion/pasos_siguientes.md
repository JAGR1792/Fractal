# Pasos siguientes — Fractal

Mapa vivo del proyecto: dónde vamos y qué falta. Actualizar en cada etapa.

## Estado por etapa (2026-10-09)

| Etapa | Estado |
|-------|--------|
| 0 — Especificación científica | Terminada |
| 1 — Motor físico (Verlet, SI, tests) | Terminada |
| 2 — Render ULTRA/LITE local | Casi: presenta en Chromium con `?perfil`, falta pulido |
| 3 — API Axum + jobs en background | En curso (rama `agent/alya/etapa3-api`) |
| 4 — Sandbox online + binario + constructor | No empezada |
| 5 — Arte ULTRA + educativo cuantitativo | No empezada |

## Etapa 2 — resto

1. Luz: subir ambiente `0.12 → 0.35`, luz desde la cámara, fresnel con dirección de vista real (hoy usa `vec3(0,0,1)` fijo).
2. Planetas procedurales por tipo en `centros.w` (`0=sol emissivo, 1=tierra, 2=luna`): continentes/nubes/casquetes para tierra, cráteres para luna. Igual en WGSL y GLSL. Sin texturas descargadas.
3. Binding WASM de `codigo/renderizado` (interpolador + culling) hacia `aplicaciones/web`.
4. Medir fps en GPU real vs integrada y fijar umbrales de perfiles (`renderizador.md §6`).
5. Mensaje claro de "sin WebGPU" para Linux: indicar `chrome://gpu`, `navigator.gpu` y flags (`--enable-unsafe-webgpu`), que el fallback a LITE es por diseño (ADR-0005).

## Etapa 3 — resto

1. Verificación en CI (bloqueo local: sin DNS a `crates.io`, caché vacía).
2. Endpoint binario `Float32Array` según `binario.ts` (`[t, x,y,z,vx,vy,vz × N]`), sin romper el JSON.
3. Cliente del API en el frontend: `POST` simulación, paginación de `estados`, `writeBuffer` al GPU (hoy `gpu.ts` es demo local).
4. Constructor de escenarios en Vue + compartir por URL o id del servidor.
5. Persistencia y anti-abuso (hoy jobs en memoria, `MAX_CUERPOS=128`, `MAX_PASOS=200_000`).

## Etapa 4/5 — sandbox y arte

1. Sandbox online: escenarios propios, sliders que lanzan simulaciones reales, links compartibles.
2. Rejilla de gravedad opcional en ULTRA calculada en shader (desplazamiento desde el storage de centros, cero CPU), no en JS.
3. Pasada de arte ULTRA: sol emissivo, bloom por compute, estrellas, trails con fading, tone mapping, HUD con paleta propia (marino + cian/naranja).
4. Educativo cuantitativo en `documentacion/educativo/`: experimentos medibles (Kepler `T² ∝ r³`, conservación de energía con la tabla), no quizzes triviales.

## Notas

- Referencia analizada: bundle externo estilo misiones (objetivo/pista/descubrimiento/quiz) solo como inspiración pedagógica; sin Three.js (prohibido por ADR-0005) y sin sus valores arcade (masas `80`, `fixed: true`): aquí todo es SI real.
- Regla: ULTRA = GPU capaz con WebGPU; LITE + tabla = resto. Nunca pantalla negra.
