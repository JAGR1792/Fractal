import { defineConfig } from 'vite'

// Fractal Web es TypeScript puro (DOM + WebGPU/WebGL2): no hay SFC ni runtime de
// framework, así que no se registra ningún plugin de framework de escena.
export default defineConfig({
  server: { port: 5173 },
  build: { target: 'es2022' },
})
