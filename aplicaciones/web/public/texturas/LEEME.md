# Texturas vendorizadas — Fractal

Imágenes servidas en local (`/texturas/*.jpg`) para que el render funcione
**sin internet** (colegios offline). Nada de hotlinks en runtime.

| Archivo | Fuente | Licencia |
|---------|--------|----------|
| `tierra.jpg` | `three.js` examples `planets/earth_atmos_2048.jpg` (mosaico NASA Blue Marble) | Imágenes NASA: dominio público (verificado: sin aviso de copyright en el repo fuente) |
| `luna.jpg` | `three.js` examples `planets/moon_1024.jpg` (mosaico LRO/LROC) | Igual que arriba |

## Para el sandbox: agregar planetas

1. Suelta el JPG equirectangular (2:1, ej. `marte.jpg`) en esta carpeta.
2. Registra `id → archivo` en `TEXTURAS_POR_ID` (`aplicaciones/web/src/escenario.ts`).
3. Si el cuerpo usa `tipoPlaneta` genérico (3), se sombrea procedural; con
   textura registrada y slot en el shader, usa la imagen.

Límite actual: ULTRA/LITE traen 2 slots fijos (tierra, luna). Un atlas o
arreglo de texturas para N planetas queda como trabajo futuro
(ver `documentacion/pasos_siguientes.md`).
