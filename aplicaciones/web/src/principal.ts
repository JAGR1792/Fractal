import { elegirPerfil, type PerfilRender } from './detector'
import { cargarEscenario, aVisual, escalaMundo, type CuerpoVisual, type Escenario } from './escenario'
import {
  actualizarSesion,
  baseApi,
  crearSesion,
  leerSesion,
  visualesDesdeBloque,
  type FuenteEstados,
} from './api'
import { montarSandbox, aplicarEdicion, pintarTelemetria, type EdicionSandbox } from './sandbox'
import { elementosDeCuerpo, formatearDistancia } from './mecanica'

/**
 * Entrada web Fractal ULTRA/LITE con sesiones vivas (ADR-0007).
 *
 * El servidor integra sin fin; el frontend avanza un cursor temporal por
 * polling y poda lo viejo. Sin ventanas, sin resembrados, sin empalmes:
 * editar masa/dt/suavizado hace PATCH en caliente; editar velocidades
 * bifurca una sesión nueva desde el vuelo actual.
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
    anexarBloques?: (nuevos: Float32Array[]) => void
    podar?: (mantenerDesde: number) => void
    leerTiempo?: () => number
    leerBloqueActual?: () => Float32Array | null
    leerPosicionesActuales?: () => number[] | null
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
  const dt0 = esc?.parametros?.dt ?? 600

  // Sesión viva: el buffer local crece por polling; el render lee por cursor.
  const baseApiUrl = baseApi()
  let sesionId: string | null = null
  let buf: Float32Array[] = []
  let hasta = 0
  let escala = 1
  let sondeando = false
  let base = vis
  let ultimoEnviado = { cuerpoId: '', masa: 0, vx: 0, vy: 0, dt: dt0, suavizado: 0 }

  if (perfil === 'ultra') {
    const { montarUltra } = await import('./ultra/gpu')
    control = await montarUltra(lienzo, '/datos/dos_cuerpos.json', null)
  } else {
    const { montarLite } = await import('./lite/webgl2_minimo')
    control = montarLite(lienzo, '/datos/dos_cuerpos.json', null)
  }

  const btn = document.getElementById('btnPausa') as HTMLButtonElement | null
  btn?.addEventListener('click', () => {
    control.alternarPausa()
    if (btn) btn.textContent = btn.textContent === 'Pausar' ? 'Reanudar' : 'Pausar'
  })
  const vel = document.getElementById('vel') as HTMLInputElement | null
  vel?.addEventListener('input', () => control.fijarVelocidad(Number(vel.value)))

  const reloj = document.getElementById('tiempo')
  const cajaSandbox = document.getElementById('sandbox')
  const btnSandbox = document.getElementById('btnSandbox') as HTMLButtonElement | null
  btnSandbox?.addEventListener('click', () => cajaSandbox?.classList.toggle('cerrado'))

  async function conectar(): Promise<boolean> {
    if (vis.length === 0 || sesionId) return sesionId !== null
    const creada = await crearSesion(baseApiUrl, vis, dt0, 0)
    if (!creada) return false
    sesionId = creada.id
    const escalaM = escalaMundo(vis)
    escala = escalaM
    const primera = await leerSesion(baseApiUrl, sesionId, 0, 300)
    if (!primera || primera.bloques.length < 2) {
      sesionId = null
      return false
    }
    buf = primera.bloques
    hasta = primera.hasta
    ultimoEnviado = {
      cuerpoId: '',
      masa: 0,
      vx: 0,
      vy: 0,
      dt: dt0,
      suavizado: 0,
    }
    control.fijarFuente?.({ bloques: buf, escala, tCalculoMs: 0 })
    const panel0 = panel
    panel0?.fijarEstado('sesión viva · flujo continuo')
    return true
  }

  // Tabla accesible (alternativa a 3D): se redibuja al bifurcar.
  const renderizarTabla = (lista: CuerpoVisual[]): void => {
    const tabla = document.getElementById('tabla')
    if (tabla && lista.length > 0) {
      tabla.innerHTML =
        '<tr><th>Cuerpo</th><th>Masa (kg)</th><th>Posición (m)</th></tr>' +
        lista.map((c) => `<tr><td>${c.nombre}</td><td>${c.masa.toExponential(2)}</td><td>${c.posicion.map((v) => v.toExponential(1)).join(', ')}</td></tr>`).join('')
    }
  }
  renderizarTabla(vis)

  // Panel sandbox: PATCH en caliente (masa/dt/suavizado) o bifurcación
  // (velocidades) desde el vuelo actual. Todo con debounce, sin botones.
  let panel: ReturnType<typeof montarSandbox> | null = null
  if (cajaSandbox && vis.length > 0) {
    panel = montarSandbox(cajaSandbox, vis, dt0, async (ed: EdicionSandbox) => {
      if (!sesionId) {
        if (await conectar()) panel?.fijarEstado('sesión viva · flujo continuo')
        else panel?.fijarEstado('sin servidor (demo local)')
        return
      }
      const u = ultimoEnviado
      const cambioVuelo = ed.vx !== u.vx || ed.vy !== u.vy
      const cambioSuave =
        ed.masa !== u.masa || ed.dt !== u.dt || ed.suavizado !== u.suavizado
      if (ed.cuerpoId !== u.cuerpoId && !cambioVuelo && !cambioSuave) {
        ultimoEnviado = { ...ed }
        return
      }
      if (cambioVuelo) {
        // Bifurca: las velocidades son condiciones iniciales nuevas.
        // Bloquea el sondeo mientras tanto: sus respuestas serían rancias.
        if (sondeando) return
        sondeando = true
        panel?.fijarEstado('bifurcando…')
        try {
          const ahora = control.leerBloqueActual?.() ?? buf[buf.length - 1] ?? null
          if (!ahora) return
          const puntoDePartida = visualesDesdeBloque(base, ahora)
          const editados = aplicarEdicion(puntoDePartida, ed)
          const nueva = await crearSesion(baseApiUrl, editados, ed.dt, ed.suavizado)
          if (!nueva) {
            panel?.fijarEstado('sin servidor (demo local)')
            return
          }
          await fetch(`${baseApiUrl}/api/v1/sesiones/${sesionId}`, { method: 'DELETE' }).catch(() => null)
          sesionId = nueva.id
          buf = []
          hasta = 0
          base = editados
          ultimoEnviado = { ...ed }
          const primera = await leerSesion(baseApiUrl, sesionId, 0, 300)
          if (primera && primera.bloques.length >= 2) {
            buf = primera.bloques
            hasta = primera.hasta
            control.fijarFuente?.({ bloques: buf, escala, tCalculoMs: 0 }, false)
            renderizarTabla(editados)
            panel?.fijarEstado('sesión viva · flujo continuo')
          }
        } finally {
          sondeando = false
        }
        return
      }
      if (cambioSuave) {
        // PATCH en caliente: la verdad del servidor continúa exacta.
        const ok = await actualizarSesion(baseApiUrl, sesionId, {
          masas: { [ed.cuerpoId]: ed.masa },
          dt: ed.dt,
          suavizado: ed.suavizado,
        })
        if (ok) {
          ultimoEnviado = { ...ed }
          base = base.map((c) => (c.id === ed.cuerpoId ? { ...c, masa: ed.masa } : c))
          renderizarTabla(base)
          panel?.fijarEstado('en vivo · parámetros aplicados')
        }
      }
    })
    panel?.fijarEstado('conectando…')
    // Base del diff: lo que el panel muestra al abrir (Luna preseleccionada).
    {
      const selIni = (document.getElementById('sbCuerpo') as HTMLSelectElement | null)?.value ?? ''
      const cIni = base.find((c) => c.id === selIni)
      if (cIni) {
        ultimoEnviado = {
          cuerpoId: selIni,
          masa: cIni.masa,
          vx: cIni.velocidad[0],
          vy: cIni.velocidad[1],
          dt: dt0,
          suavizado: 0,
        }
      }
    }

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

  // Sondeo: reloj + telemetría + cursor de la sesión (polling ~1 s).
  setInterval(async () => {
    if (reloj) {
      const t = control.leerTiempo?.()
      reloj.textContent = t === undefined ? '—' : `T+ ${formatearTiempo(t)}`
    }
    if (cajaSandbox) {
      const selId = (document.getElementById('sbCuerpo') as HTMLSelectElement | null)?.value ?? ''
      const blk = control.leerBloqueActual?.() ?? null
      const idx = base.findIndex((c) => c.id === selId)
      if (blk && idx >= 0 && base.length > 0) {
        // El central lo decide la gravedad sobre el estado VIVO del bloque, no
        // la masa del primero de la lista: con la Luna elegida, su central es
        // la Tierra (si no, sma/período salían referidos al Sol).
        const estado = visualesDesdeBloque(base, blk)
        const el = elementosDeCuerpo(estado, idx)
        pintarTelemetria(cajaSandbox, el ? {
          dist: formatearDistancia(el.distancia),
          vel: `${(el.velocidad / 1000).toFixed(2)} km/s`,
          sma: el.sma !== null ? formatearDistancia(el.sma) : 'abierta',
          ecc: el.excentricidad.toFixed(3),
          periodo: el.periodo !== null ? formatearTiempo(el.periodo) : '—',
        } : null)
      } else {
        pintarTelemetria(cajaSandbox, null)
      }
    }
    if (sondeando) return
    if (!sesionId) {
      await conectar()
      return
    }
    sondeando = true
    try {
      // Fijada al pedir: si bifurcó mientras tanto, la respuesta es de otra
      // sesión y se descarta (no contamina el buffer ni el cursor).
      const idAhora = sesionId
      if (!idAhora) return
      const resp = await leerSesion(baseApiUrl, idAhora, hasta, 200)
      if (!resp || idAhora !== sesionId) return
      if (resp.bloques.length > 0) {
        for (const b of resp.bloques) buf.push(b)
        control.anexarBloques?.(resp.bloques)
        hasta = resp.hasta
      }
      // Poda: conserva ~últimos 2500 bloques (memoria acotada).
      if (buf.length > 3000) {
        const corte = buf[buf.length - 2000][0]
        buf.splice(0, buf.length - 2000)
        control.podar?.(corte)
      }
    } finally {
      sondeando = false
    }
  }, 1000)
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
