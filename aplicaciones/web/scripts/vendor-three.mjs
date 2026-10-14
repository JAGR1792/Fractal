/**
 * Vendoriza Three.js para producción (ver ADR-0009 y vite.config.ts).
 *
 * `npm run build` deja `three` como EXTERNO de rollup y el navegador lo
 * resuelve con el importmap de index.html. Este script copia el build ESM
 * instalado por npm a `public/vendor/` (que Vite copia a `dist/` tal cual,
 * sin transpilar). Así ningún módulo >1MB pasa por el transpile de esbuild
 * (en máquinas con antivirus estricto su temporal falla) y los colegios sin
 * internet siguen funcionando (cero hotlinks).
 *
 * Se ejecuta solo con `npm run prebuild` (hook automático antes de `build`).
 * En `dev` no hace falta: Vite pre-empaqueta three desde node_modules.
 */
import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const origen = join(raiz, 'node_modules', 'three', 'build', 'three.module.js')
const destinoDir = join(raiz, 'public', 'vendor')
const destino = join(destinoDir, 'three.module.js')

mkdirSync(destinoDir, { recursive: true })
const { size } = statSync(origen)
copyFileSync(origen, destino)
console.log(`[vendor-three] three.module.js vendorizado (${(size / 1024).toFixed(0)} KB)`)
