# Plan de simulación continua — Fractal

> ## Filosofía del proyecto (importante)
>
> **No queremos lo fácil de hacer. Queremos lo más eficiente: lo que funciona.**
> Nada de arreglos simples. Los problemas se resuelven con matemática
> profunda que los elimine de raíz, aunque cueste más trabajo. Un parche que
> suma código para esconder un defecto es un defecto nuevo. El plan que sigue
> se juzga con esta regla: **si al terminar hay más mecanismos que antes,
> el plan está mal.**

## 1. Estado y evidencia

Rama `dev` al merge `1488eb3`. Servidores verificados en local (`:5173` web
200, `:3000/salud` bien) y E2E con servidor: `tramo 1 · listo` + `ULTRA OK`
sin errores de GPU.

### 1.1 Logs del workflow de GitHub (CI, rama `dev`)

| Run | Merge verificado | Conclusión | Causa del fallo |
|-----|------------------|------------|-----------------|
| `38108617410` (2026-10-11) | flujo infinito, continuo, suavizado y explosiones | **failure** | `Formato (rustfmt)`: diffs en `codigo/api/src/modelos.rs:147`, `codigo/api/tests/flujo_minimo.rs:81`, `codigo/fisica/src/gravedad.rs:102,202` |
| `38080394396` (2026-10-10) | fix formato CI | success | — |
| `37985571222` (2026-10-09) | panel inferior, reloj, seguimiento y bucle orbital | failure | `Formato (rustfmt)` en `codigo/api/src/binario.rs` (línea larga de test) |
| `37983737909` (2026-10-09) | puente binario + sandbox + texturas | failure | `Formato (rustfmt)` (mismo patrón) |
| `37975960809` (2026-10-09) | fix clippy unused-mut | success | — |
| `37975839646` (2026-10-09) | texturas NASA + luz | failure | `Linter (clippy)`: `unused_mut` en test |

Patrón: todos los rojos son **formato/lint de Rust**, nunca física ni web
(`tsc` + vitest siempre verdes en local). Este commit incluye el `cargo fmt`
que deja el CI en verde.

## 2. Diagnóstico raíz del reinicio visible

La ventana por defecto cubre **0.985 órbitas lunares** (`dt=600 × pasos=3900`
= 2.337e6 s frente al período real 2.372e6 s). El detector de bucle exige
`≥ 2π − 0.05` (99.2%) y por tanto **falla siempre**, cayendo al último bloque:
salto de ~5° por ciclo. El encadenado siembra desde el estado actual (bien),
pero hereda el mismo defecto en cada tramo, y si el cálculo tarda, el wrap
le gana a la precarga.

La pila actual (ventanas + detector + módulo + fundidos + prefetch) es
exactamente lo que la filosofía prohíbe: mecanismos para fingir continuidad.

## 3. Plan de arreglo aprobado

### Fase 1 — Cortar lo falso (solo web, sin física nueva)
1. Muere el botón Lanzar: cualquier cambio de slider relanza solo con
   debounce desde el vuelo actual. Sin excepciones.
2. Condiciones iniciales baricéntricas exactas en `dos_cuerpos.json`:
   `v = √(G(M+m)/r)` y contravelocidad terrestre para momento total cero.
3. Etiqueta honesta de escala en la UI ("tamaños exagerados") hasta la Fase 3.
4. Criterio: quitar código, no poner. Todo lo que huela a esconder el salto
   en vez de eliminarlo se rechaza.

### Fase 2 — Sesión viva (la cirugía)
1. ADR-0007: el API integra sin fin por sesión con cursor temporal; el
   frontend consume por cursor (polling primero).
2. Al aterrizar se **borra**: `detectarBucle`, wrap por módulo, fundidos de
   empalme, prefetch adaptativo y sobrepedido. Si el diff neto no es negativo,
   está mal.
3. Criterio: reloj monótono por construcción (no hay fin que reiniciar) y
   E2E largo sin discontinuidades medibles (`saltoDeBucle` ≈ 0 siempre).

### Fase 3 — Escala y transporte (solo si hace falta)
1. Modo escala real opcional + etiqueta del factor de exageración.
2. WebSocket solo si el polling limita. Suavizado ε ya existe (Fase 2
   anterior): slider, validación y tests.

## 4. Deuda registrada

Ver `documentacion/comportamientos_mejorables.md`: reinicio del loop,
Verlet sin suavizado con muchos cuerpos (en curso), estelas con huecos y
transición demo→servidor. Este plan los cubre o los declara obsoletos.
