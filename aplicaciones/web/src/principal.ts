import { elegirPerfil, type PerfilRender } from './detector'

/**
 * Entrada web. Detecta GPU y monta ULTRA (WebGPU+WASM) o LITE (WebGL2 mínimo).
 * Vue solo para paneles; el 3D corre en canvas aparte (futuro: Worker + OffscreenCanvas).
 */
async function arrancar(forzar?: PerfilRender): Promise<void> {
  const perfil = await elegirPerfil(forzar)
  const lienzo = document.getElementById('escena') as HTMLCanvasElement | null
  if (!lienzo) throw new Error('falta <canvas id="escena">')

  if (perfil === 'ultra') {
    const { montarUltra } = await import('./ultra/gpu')
    await montarUltra(lienzo)
  } else {
    const { montarLite } = await import('./lite/webgl2_minimo')
    montarLite(lienzo)
  }
  console.info(`[fractal] perfil activo: ${perfil}`)
}

document.addEventListener('DOMContentLoaded', () => {
  arrancar().catch((e) => {
    console.error('[fractal] fallo arranque:', e)
    const aviso = document.getElementById('aviso')
    if (aviso) aviso.textContent = 'No se pudo iniciar 3D. Usa la tabla de datos como alternativa.'
  })
})
