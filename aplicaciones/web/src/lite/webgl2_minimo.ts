/**
 * LITE: fallback WebGL2 mínimo handwritten (sin motores).
 * Esferas low-poly + líneas simples. Si !WebGL2: la app muestra tabla (ver principal.ts).
 */
export function montarLite(lienzo: HTMLCanvasElement): void {
  const gl = lienzo.getContext('webgl2')
  if (!gl) throw new Error('sin WebGL2')
  gl.clearColor(0.02, 0.02, 0.08, 1.0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  // TODO Etapa 2: esferas + órbitas + OrbitControls propio mínimo + picking.
  console.info('[fractal/lite] WebGL2 listo (modo compatibilidad)')
}
