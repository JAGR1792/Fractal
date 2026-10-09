# ADR-0005: Renderizador ULTRA (WebGPU nativo + WASM) sin motores de escena

## Estado
Aceptado — supersede cualquier mención previa a Three.js como base del proyecto.

## Contexto

Fractal necesita visualización 3D en navegador sin instalaciones (Objetivo 1),
que funcione en PC escolar viejo y a la vez exprima GPU moderna (RTX 3050 y
superiores). Se evaluaron:

1. **Three.js + WebGL2** — estándar, simple, compatible. Pero: state machine
   vieja, overhead por draw call, sin compute shaders, sin storage buffers.
   Techo ~5k-10k objetos a 60fps.
2. **Three.js WebGPURenderer / Babylon.js WebGPU** — 2-3x mejor que WebGL2,
   pero mantienen impuesto de scene graph, materiales genéricos y GC por frame.
3. **Raw WebGPU + WGSL en TypeScript** — sin impuesto de motor, ~10-20% más
   que opción 2 si se escribe bien.
4. **Rust + wgpu compilado a WASM + WebGPU nativo** — lo máximo en web:
   loop e interpolación en WASM sin GC, buffers mapeados directo a GPU,
   cero allocs por frame.

El usuario exigió explícitamente **lo mejor sin importar la dificultad**,
no lo más fácil.

## Decisión

- **ULTRA (default en GPU capaz):** WebGPU nativo + WGSL handwritten +
  `codigo/renderizado` en Rust compilado a WASM (interpolación + culling) +
  protocolo binario `Float32Array`. Render en `OffscreenCanvas` + Worker.
  Cero dependencias de motores de escena (nada de Three.js, Babylon, PlayCanvas).
- **LITE (fallback):** WebGL2 mínimo handwritten (sin motor), esferas low-poly,
  órbitas como líneas simples, texturas 512px, `pixelRatio<=1`. Solo para
  compatibilidad escolar/móvil sin WebGPU.
- **Detección:** `aplicaciones/web/src/detector.ts` — si `navigator.gpu`
  existe y pide adapter con éxito → ULTRA, si no → LITE. En móvil se arranca
  en LITE aunque haya WebGPU, con botón "probar ULTRA".
- **Mismo contrato:** ambos renderers consumen `datos/escenarios/*.json`
  (configuración) y bloques binarios del servidor (estados). Ver
  `documentacion/arquitectura/renderizador.md`.

## Consecuencias

### Ganamos
- 60fps con 20k-100k cuerpos instanciados donde WebGL2 cae a 15fps.
- Binario 5-10x más compacto que JSON por frame, sin parseo ni GC.
- UI nunca bloquea: 3D en Worker, Vue solo para paneles.
- Sin lock-in de motor: control total de draw calls, buffers y shaders.

### Perdemos
- 3x más código que con Three.js: hay que escribir OrbitControls propio
  (rotar/acercar/pan + táctil), picking por rayo, etiquetas y LOD a mano.
- WGSL es nuevo, pocos ejemplos, debug de shaders a las 2am.
- Se necesita toolchain Rust + wasm-pack + navegador con WebGPU para
  desarrollar ULTRA.

### Riesgos y mitigaciones
- **Colegios sin WebGPU:** mitigado con LITE obligatorio + tabla de datos
  como alternativa accesible (requisito no funcional).
- **Móviles que se calientan:** mitigado con arranque en LITE + perfiles
  `bajo/medio/ultra` (pixelRatio, texturas, bloom on/off).
- **Mantenimiento:** mitigado con `codigo/renderizado` puro y testeable
  sin navegador (igual que `codigo/fisica`), y shaders WGSL versionados.

---

**Fecha:** 2026-10-09
**Decisores:** Equipo Fractal
**Relacionado:** `documentacion/arquitectura/renderizador.md`, RF01, RF02
