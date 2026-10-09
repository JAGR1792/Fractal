import { elegirPerfil, type PerfilRender } from './detector'
import { cargarEscenario, aVisual } from './escenario'

/**
 * Entrada web Fractal ULTRA/LITE.
 * Monta canvas 3D + barra de controles + tabla accesible (RF01, RF02, RF08).
 */
async function arrancar(forzar?: PerfilRender): Promise<void> {
  const perfil = await elegirPerfil(forzar)
  const etiqueta = document.getElementById('perfil')
  if (etiqueta) etiqueta.textContent = `perfil: ${perfil}`
  const lienzo = document.getElementById('escena') as HTMLCanvasElement | null
  if (!lienzo) throw new Error('falta <canvas id="escena">')

  let control: { alternarPausa: () => void; fijarVelocidad: (v: number) => void; destruir?: () => void }

  if (perfil === 'ultra') {
    const { montarUltra } = await import('./ultra/gpu')
    control = await montarUltra(lienzo)
  } else {
    const { montarLite } = await import('./lite/webgl2_minimo')
    control = montarLite(lienzo)
  }

  const btn = document.getElementById('btnPausa') as HTMLButtonElement | null
  btn?.addEventListener('click', () => {
    control.alternarPausa()
    if (btn) btn.textContent = btn.textContent === 'Pausar' ? 'Reanudar' : 'Pausar'
  })
  const vel = document.getElementById('vel') as HTMLInputElement | null
  vel?.addEventListener('input', () => control.fijarVelocidad(Number(vel.value)))

  // Tabla accesible con escenario local (alternativa a 3D)
  try {
    const esc = await cargarEscenario('/datos/dos_cuerpos.json')
    const vis = aVisual(esc)
    const tabla = document.getElementById('tabla')
    if (tabla) {
      tabla.innerHTML =
        '<tr><th>Cuerpo</th><th>Masa (kg)</th><th>Posición (m)</th></tr>' +
        vis.map((c) => `<tr><td>${c.nombre}</td><td>${c.masa.toExponential(2)}</td><td>${c.posicion.map((v) => v.toExponential(1)).join(', ')}</td></tr>`).join('')
    }
  } catch {
    /* sin tabla si no hay datos locales */
  }
  console.info(`[fractal] perfil activo: ${perfil}`)
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search)
  const pedido = params.get('perfil')
  const forzar = pedido === 'ultra' || pedido === 'lite' ? pedido : undefined
  arrancar(forzar).catch((e) => {
    console.error('[fractal] fallo arranque:', e)
    const aviso = document.getElementById('aviso')
    if (aviso) aviso.textContent = 'No se pudo iniciar 3D. Usa la tabla de datos como alternativa.'
  })
})
