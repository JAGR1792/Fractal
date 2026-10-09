import { elegirPerfil, type PerfilRender } from './detector'
import { cargarEscenario, aVisual, type CuerpoVisual, type Escenario } from './escenario'
import { probarFuente, type FuenteEstados } from './api'
import { montarSandbox, aplicarEdicion, type EdicionSandbox } from './sandbox'

/**
 * Entrada web Fractal ULTRA/LITE.
 * Monta canvas 3D + barra de controles + panel sandbox + tabla accesible.
 * Si el API responde, ULTRA anima física real del servidor; si no, demo local.
 */
async function arrancar(forzar?: PerfilRender): Promise<void> {
  const perfil = await elegirPerfil(forzar)
  const etiqueta = document.getElementById('perfil')
  if (etiqueta) etiqueta.textContent = `perfil: ${perfil}`
  const lienzo = document.getElementById('escena') as HTMLCanvasElement | null
  if (!lienzo) throw new Error('falta <canvas id="escena">')

  let control: {
    alternarPausa: () => void
    fijarVelocidad: (v: number) => void
    fijarFuente?: (f: FuenteEstados | null) => void
    destruir?: () => void
  }

  // Escenario local una sola vez (config + tabla + base del sandbox).
  let esc: Escenario | null = null
  let vis: CuerpoVisual[] = []
  try {
    esc = await cargarEscenario('/datos/dos_cuerpos.json')
    vis = aVisual(esc)
  } catch {
    /* sin escenario: el render usa su demo interna */
  }
  const dt = esc?.parametros?.dt ?? 600
  const pasos = esc?.parametros?.pasos ?? 3900

  // Fuente del servidor (solo ULTRA por ahora): no bloquea si el API cae.
  let fuente: FuenteEstados | null = null
  if (perfil === 'ultra' && vis.length > 0) {
    fuente = await probarFuente(vis, dt, pasos)
    if (fuente) console.info(`[fractal] física del servidor: ${fuente.bloques.length} fotogramas`)
  }

  if (perfil === 'ultra') {
    const { montarUltra } = await import('./ultra/gpu')
    control = await montarUltra(lienzo, '/datos/dos_cuerpos.json', fuente)
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
  if (vis.length > 0) {
    const tabla = document.getElementById('tabla')
    if (tabla) {
      tabla.innerHTML =
        '<tr><th>Cuerpo</th><th>Masa (kg)</th><th>Posición (m)</th></tr>' +
        vis.map((c) => `<tr><td>${c.nombre}</td><td>${c.masa.toExponential(2)}</td><td>${c.posicion.map((v) => v.toExponential(1)).join(', ')}</td></tr>`).join('')
    }
  }

  // Panel sandbox: edita en vivo y relanza contra el API (ULTRA con fuente viva).
  const cajaSandbox = document.getElementById('sandbox')
  if (cajaSandbox && vis.length > 0) {
    const panel = montarSandbox(cajaSandbox, vis, dt, pasos, async (ed: EdicionSandbox) => {
      panel.fijarEstado('calculando…')
      const editados = aplicarEdicion(vis, ed)
      const nueva = await probarFuente(editados, ed.dt, ed.pasos)
      if (nueva && control.fijarFuente) {
        control.fijarFuente(nueva)
        panel.fijarEstado(`listo: ${nueva.bloques.length} fotogramas`)
      } else {
        panel.fijarEstado('sin servidor (demo local)')
      }
    })
    if (perfil !== 'ultra') panel.fijarEstado('LITE: demo local')
    else if (fuente) panel.fijarEstado(`listo: ${fuente.bloques.length} fotogramas`)
    else panel.fijarEstado('sin servidor (demo local)')

    // Picking 3D → sandbox: clic en un planeta lo selecciona en el panel.
    window.addEventListener('fractal-seleccion', ((e: CustomEvent<{ id: string | null }>) => {
      const id = e.detail.id
      if (id) {
        panel.fijarCuerpo(id)
        const cuerpo = vis.find((c) => c.id === id)
        if (cuerpo) panel.fijarEstado(`${cuerpo.nombre} seleccionado`)
      }
    }) as EventListener)
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
