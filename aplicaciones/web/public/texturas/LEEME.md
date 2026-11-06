# Texturas vendorizadas — Fractal

Imágenes servidas en local (`/texturas/*.jpg`) para que el render funcione
**sin internet** (colegios offline). Nada de hotlinks en runtime.

| Archivo | Fuente | Licencia |
|---------|--------|----------|
| `tierra.jpg` | `three.js` examples `planets/earth_atmos_2048.jpg` (mosaico NASA Blue Marble) | Imágenes NASA: dominio público (verificado: sin aviso de copyright en el repo fuente) |
| `luna.jpg` | `three.js` examples `planets/moon_1024.jpg` (mosaico LRO/LROC) | Igual que arriba |
| `sol.jpg`, `mercurio.jpg`, `venus.jpg`, `marte.jpg`, `jupiter.jpg`, `saturno.jpg`, `urano.jpg`, `neptuno.jpg` | `threex.planets` `images/*map*.jpg` (mosaicos NASA) | Imágenes NASA: dominio público |

## Para el sandbox: agregar planetas

1. Suelta el JPG equirectangular (2:1, ej. `marte.jpg`) en esta carpeta.
2. Registra `id → { url, slot }` en `TEXTURAS_POR_ID` (`aplicaciones/web/src/escenario.ts`).
3. Agrega el binding/sampler del slot en `planeta.wgsl` (ULTRA) y en
   `webgl2_minimo.ts` (LITE). Sin slot, el cuerpo usa procedural.

Pendiente conocido: anillos de Saturno/Urano (geometría extra, sin hacer).
