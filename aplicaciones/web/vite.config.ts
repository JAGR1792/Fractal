import { defineConfig } from 'vite'

// Fractal Web es TypeScript puro (DOM + WebGPU/WebGL2): no hay SFC ni runtime de
// framework, así que no se registra ningún plugin de framework de escena.
export default defineConfig({
  server: { port: 5173 },
  build: {
    target: 'es2022',
    // Terser en vez del minificador esbuild: esbuild pasa entradas >1MB por
    // un temporal y en máquinas con antivirus estricto borrarlo falla
    // ("Acceso denegado"). Terser es puro JS y no usa temporales.
    minify: 'terser',
    rollupOptions: {
      // Three.js va EXTERNO y vendorizado (`npm run prebuild` lo copia a
      // `public/vendor/`, servido tal cual sin transpilar): ningún módulo
      // >1MB pasa por esbuild y el importmap de index.html lo resuelve en el
      // navegador (offline OK, colegios sin internet).
      external: ['three'],
    },
  },
})
