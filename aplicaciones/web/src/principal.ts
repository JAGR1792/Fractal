import { elegirPerfil, type PerfilRender } from './detector'
import { cargarEscenario, aVisual, type CuerpoVisual, type Escenario } from './escenario'
import { probarFuente, visualesConPosiciones, visualesDesdeBloque, type FuenteEstados } from './api'
import { montarSandbox, aplicarEdicion, pasosParaDuracion, type EdicionSandbox } from './sandbox'

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
    fijarFuente?: (f: FuenteEstados | null, limpiar?: boolean) => void
    leerTiempo?: () => number
    leerProgreso?: () => number
    leerPosicionesActuales?: () => number[] | null
    leerBloqueActual?: () => Float32Array | null
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

  // Fuente del servidor (ULTRA y LITE): no bloquea si el API cae.
  let fuente: FuenteEstados | null = null
  if (vis.length > 0) {
    fuente = await probarFuente(vis, dt, pasos)
    if (fuente) console.info(`[fractal] física del servidor: ${fuente.bloques.length} fotogramas`)
  }

  if (perfil === 'ultra') {
    const { montarUltra } = await import('./ultra/gpu')
    control = await montarUltra(lienzo, '/datos/dos_cuerpos.json', fuente)
  } else {
    const { montarLite } = await import('./lite/webgl2_minimo')
    control = montarLite(lienzo, '/datos/dos_cuerpos.json', fuente)
  }

  const btn = document.getElementById('btnPausa') as HTMLButtonElement | null
  btn?.addEventListener('click', () => {
    control.alternarPausa()
    if (btn) btn.textContent = btn.textContent === 'Pausar' ? 'Reanudar' : 'Pausar'
  })
  const vel = document.getElementById('vel') as HTMLInputElement | null
  vel?.addEventListener('input', () => control.fijarVelocidad(Number(vel.value)))

  // Reloj de tiempo simulado + toggle del panel + flujo infinito.
  // Cuando el tramo roza el 80%, se encadena la siguiente simulación desde
  // el último estado: el tiempo nunca se reinicia.
  const reloj = document.getElementById('tiempo')
  let encadenando = false
  let base = vis
  let params = { dt, pasos, suavizado: 0 }
  let panel: ReturnType<typeof montarSandbox> | null = null
  // Generación: cada Lanzar/encadenado la sube; las respuestas viejas que
  // lleguen tarde se descartan en vez de devolverte a otra trayectoria.
  let generacion = 0
  setInterval(async () => {
    if (reloj) {
      const t = control.leerTiempo?.()
      reloj.textContent = t === undefined ? '—' : `T+ ${formatearTiempo(t)}`
    }
    if (encadenando || !fuente || !control.fijarFuente || !control.leerProgreso) return
    // Prefetch adaptativo: dispara con margen para 3× el último cálculo.
    // A 1x el tramo dura ~20 s de pared; más velocidad = menos margen.
    const vel = Number((document.getElementById('vel') as HTMLInputElement | null)?.value ?? '1') || 1
    const margen = Math.min(Math.max(((fuente.tCalculoMs || 800) * 3 * vel) / 20000, 0.1), 0.5)
    if ((control.leerProgreso() ?? 0) < 1 - margen) return
    // Semilla = estado ACTUAL interpolado (no el último bloque): así el
    // empalme cae exactamente donde estás mirando, sin saltos.
    const ahora = control.leerBloqueActual?.() ?? fuente.bloques[fuente.bloques.length - 1]
    if (!ahora) return
    encadenando = true
    const miGen = ++generacion
    panel?.fijarEstado('continuando…')
    const siguientes = visualesDesdeBloque(base, ahora)
    const nueva = await probarFuente(siguientes, params.dt, params.pasos, params.suavizado)
    // Si mientras tanto el usuario lanzó otra cosa, esta respuesta ya es
    // vieja: se descarta, no se aplica.
    if (miGen !== generacion) {
      encadenando = false
      return
    }
    if (nueva) {
      fuente = nueva
      base = siguientes
      // Sin limpiar estelas: la trayectoria continúa, no reinicia.
      control.fijarFuente(nueva, false)
      panel?.fijarEstado('listo (flujo continuo)')
    }
    encadenando = false
  }, 1000)
  const cajaSandbox = document.getElementById('sandbox')
  const btnSandbox = document.getElementById('btnSandbox') as HTMLButtonElement | null
  btnSandbox?.addEventListener('click', () => cajaSandbox?.classList.toggle('cerrado'))

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
  if (cajaSandbox && vis.length > 0) {
    panel = montarSandbox(cajaSandbox, vis, dt, Math.round((pasos * dt) / 86400), async (ed: EdicionSandbox) => {
      // Invalida encadenados en vuelo: manda lo que el usuario pidió ahora.
      const miGen = ++generacion
      panel?.fijarEstado('calculando…')
      // Bifurca desde el vuelo actual (no desde el inicio): sin teletransporte.
      const vuelo = control.leerPosicionesActuales?.() ?? null
      const puntoDePartida = vuelo ? visualesConPosiciones(vis, vuelo) : vis
      const editados = aplicarEdicion(puntoDePartida, ed)
      const pasosEd = pasosParaDuracion(ed.duracionDias, ed.dt)
      const nueva = await probarFuente(editados, ed.dt, pasosEd, ed.suavizado)
      if (miGen !== generacion) return
      if (nueva && control.fijarFuente) {
        fuente = nueva
        base = editados
        params = { dt: ed.dt, pasos: pasosEd, suavizado: ed.suavizado }
        control.fijarFuente(nueva)
        panel?.fijarEstado(`listo: ${nueva.bloques.length} fotogramas`)
      } else {
        panel?.fijarEstado('sin servidor (demo local)')
      }
    })
    if (fuente) panel?.fijarEstado(`listo: ${fuente.bloques.length} fotogramas`)
    else panel?.fijarEstado('sin servidor (demo local)')

    // Picking 3D → sandbox: clic en un planeta lo selecciona en el panel.
    window.addEventListener('fractal-seleccion', ((e: CustomEvent<{ id: string | null }>) => {
      const id = e.detail.id
      if (id) {
        panel?.fijarCuerpo(id)
        const cuerpo = vis.find((c) => c.id === id)
        if (cuerpo) panel?.fijarEstado(`${cuerpo.nombre} seleccionado`)
      }
    }) as EventListener)
  }
  console.info(`[fractal] perfil activo: ${perfil}`)
}

/** Reloj estilo sandbox: minutos, horas o días según la magnitud. */
function formatearTiempo(s: number): string {
  if (s < 120) return `${s.toFixed(0)} s`
  if (s < 7200) return `${(s / 60).toFixed(1)} min`
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`
  return `${(s / 86400).toFixed(2)} días`
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
