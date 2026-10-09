# Renderizador ULTRA / LITE — Fractal

## 1. Objetivo

Máximo rendimiento en navegador sin instalaciones, sin motores de escena
(Three.js, Babylon, PlayCanvas: **no se usan**). Dos renderers con el mismo
contrato de datos:

- **ULTRA:** WebGPU nativo + WGSL + WASM (`codigo/renderizado`). Para GPU capaz.
- **LITE:** WebGL2 mínimo handwritten. Para PC escolar/móvil sin WebGPU.

## 2. Por qué no un motor de escena

| Criterio | Motor (Three/Babylon) | Handwritten ULTRA/LITE |
|----------|----------------------|------------------------|
| Draw calls 100 cuerpos | ~100 (un mesh por cuerpo) | <10 (instancing + merging) |
| Allocs por frame | Sí (Vector3, Matrix4, GC) | Cero (buffers reutilizados) |
| Compute (culling/interpolación GPU) | No (WebGL2) / parcial | Sí (compute shader) |
| Tamaño bundle 3D | ~600KB-2MB | ~50-150KB + WASM |
| Control de memoria GPU | Parcial | Total (`GPUBuffer` + pools) |
| Curva de aprendizaje | Baja | Alta (WGSL + wgpu + WASM) |

Elegimos control total porque el usuario exigió **lo mejor sin importar
la dificultad** (ADR-0005).

## 3. Arquitectura

```
aplicaciones/web/
├── src/
│   ├── principal.ts         ← entrada: detecta y monta ULTRA o LITE
│   ├── detector.ts          ← hasWebGPU(): navigator.gpu.requestAdapter()
│   ├── binario.ts           ← protocolo Float32Array <-> GPUBuffer
│   ├── ultra/
│   │   ├── gpu.ts           ← init device, canvas, formato, MSAA
│   │   ├── buferes.ts       ← pools de uniform/storage buffers
│   │   ├── instanciado.ts   ← 1 draw instanciado para planetas + asteroides
│   │   ├── computo.ts       ← culling + interpolación en GPU (compute)
│   │   └── sombreadores/
│   │       ├── planeta.wgsl ← vertex/fragment con fresnel + terminator
│   │       ├── orbita.wgsl  ← líneas con degradado
│   │       └── computo.wgsl ← interpolación + frustum culling
│   ├── lite/
│   │   └── webgl2.ts        ← fallback mínimo: esferas + líneas
│   └── interfaz/            ← Vue: paneles, tablas (no toca GPU)
└── index.html

codigo/renderizado/          ← Rust puro, compila a nativo (tests) y a WASM (ULTRA)
├── src/
│   ├── lib.rs
│   ├── interpolador.rs      ← lerp entre snapshots (sin allocs si se reutiliza buffer)
│   └── culling.rs           ← esfera vs frustum en CPU (fallback si no hay compute)
```

Render en `OffscreenCanvas` + Worker: Vue manda escenarios y comandos por
`postMessage`, nunca bloquea el frame.

## 4. Contrato de datos

### 4.1 Configuración (JSON, legible)

`datos/escenarios/*.json` — id, nombre, masa kg, radio m, posición m,
velocidad m/s. Solo al inicio.

### 4.2 Estados (binario, rápido)

El servidor (Etapa 3) manda bloques:

```
[t: f32, por cada cuerpo: x,y,z,vx,vy,vz: f32]  // 1 + N*6 floats
```

En TS: `new Float32Array(buffer)` → `device.queue.writeBuffer(storageBuffer)`.
Sin `JSON.parse`, sin GC. JSON es 5-10x más grande.

`binario.ts` documenta layout, versión y endianness (little-endian).

## 5. Técnicas de rendimiento (ULTRA)

1. **Instancing:** 1 `drawIndexedIndirect` para todos los planetas/rocas.
   LOD: esfera 48x32 cerca, 12x8 lejos, billboard más lejos.
2. **Órbitas merged:** un solo `BufferGeometry`/`GPUBuffer` con todas las
   órbitas + color por vértice, no N objetos línea.
3. **Estrellas/asteroides como Points:** no meshes.
4. **Uniforms reutilizados:** viewProj, tiempo, selección: se escriben, no se recrean.
5. **Frustum culling en compute:** `computo.wgsl` marca visibles; CPU no itera.
6. **Interpolación en WASM o compute:** entre `Estado(t0)` y `Estado(t1)` con
   `t` fraccional, sin pedir más frames al servidor.
7. **MSAA 4x + bloom por compute** solo en perfil `ultra`, apagable.

Con 8 planetas: <10 draws, <2M tris, <200MB VRAM. Con 50k asteroides: 60fps
en RTX 3050 Mobile.

## 6. Perfiles de calidad

| Perfil | pixelRatio | Texturas | Bloom | Asteroides | Uso |
|--------|-----------|----------|-------|------------|-----|
| bajo | 1 | 512px / plano | off | 0 | PC 2012, móvil |
| medio | min(dpr,1.5) | 1K | off | 5k | UHD 620, 780M |
| ultra | min(dpr,2) | 2K | on | 20k-50k | RTX 3050+, M1+ |

Auto: medir fps 2s; si <45fps bajar un perfil. Manual en UI.

## 7. LITE: qué hace y qué no

Hace: esferas `MeshBasic/Lambert`, líneas simples, OrbitControls propio
mínimo, picking por rayo-esfera, etiquetas para seleccionado.
No hace: bloom, sombras, PBR, post. Texturas planas o vertex color.

Si `!WebGL2`: mostrar tabla de posiciones/velocidades/energía (accesibilidad)
+ mensaje comprensible. Nunca pantalla negra.

## 8. Mínimos

- **LITE:** PC 2012+, Intel HD 4000, 2-4GB RAM, Chrome/Firefox 3 años,
  Android 8+ / iPhone 8+. 5 Mbps.
- **ULTRA:** GPU Vulkan/DX12/Metal (UHD 620+, M1+, Adreno 600+), 8GB RAM,
  Chrome/Edge 113+, Safari 18+. En móvil arrancar en LITE por batería.

## 9. Qué sigue (Etapa 2)

1. `detector.ts` + `principal.ts` funcionales (este scaffold).
2. `codigo/renderizado` con interpolador + culling testeados (este scaffold).
3. Shaders `planeta.wgsl` / `orbita.wgsl` mínimos que compilan en `naga`.
4. Conectar a `datos/escenarios/dos_cuerpos.json` local (sin backend aún).
5. Medir fps en RTX 3050 vs UHD y fijar umbrales.

Three.js no vuelve: cualquier PR que lo reintroduzca debe pasar por ADR nuevo.
