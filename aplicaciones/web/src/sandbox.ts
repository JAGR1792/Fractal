/**
 * Panel sandbox: edita parámetros en vivo y lanza simulaciones al API.
 * Vanilla DOM como el resto de la barra (sin framework).
 */
import type { CuerpoVisual } from './escenario'

/** Edición del usuario sobre un cuerpo del escenario. */
export interface EdicionSandbox {
  cuerpoId: string
  masa: number
  vx: number
  vy: number
  dt: number
  /** Duración simulada en días (se ignora si `infinito`). */
  duracionDias: number
  /** Sin fin: encadena tramos para siempre con trozos fijos. */
  infinito: boolean
  /** Suavizado gravitacional ε en metros (0 = Newton puro). */
  suavizado: number
}

/** Pasos necesarios para cubrir `dias` con paso `dt` (mínimo 50). */
export function pasosParaDuracion(dias: number, dt: number): number {
  if (!(dt > 0)) return 50
  return Math.max(50, Math.round((dias * 86400) / dt))
}

/**
 * Pasos por tramo en modo continuo: ~2.4e6 s de física (≈ un mes) con el
 * `dt` dado, acotado para no colgar el servidor ni encadenar a cada rato.
 */
export function pasosContinuos(dt: number): number {
  if (!(dt > 0)) return 4000
  return Math.min(20000, Math.max(500, Math.round(2.4e6 / dt)))
}

/** Textos de telemetría (`null` = guiones). */
export interface TextoTelemetria {
  dist: string | null
  vel: string | null
  sma: string | null
  ecc: string | null
  periodo: string | null
}

/** Pinta la telemetría del drawer (o guiones si no hay). */
export function pintarTelemetria(raiz: HTMLElement, t: TextoTelemetria | null): void {
  const poner = (id: string, v: string | null): void => {
    const el = raiz.querySelector(`#${id}`) as HTMLElement | null
    if (el) el.textContent = v ?? '—'
  }
  poner('sbTDist', t?.dist ?? null)
  poner('sbTVel', t?.vel ?? null)
  poner('sbTSma', t?.sma ?? null)
  poner('sbTEcc', t?.ecc ?? null)
  poner('sbTPer', t?.periodo ?? null)
}

/** Clona los visuales aplicando la edición (puro, testeable). */
export function aplicarEdicion(visuales: CuerpoVisual[], ed: EdicionSandbox): CuerpoVisual[] {
  return visuales.map((c) =>
    c.id === ed.cuerpoId
      ? { ...c, masa: ed.masa, velocidad: [ed.vx, ed.vy, c.velocidad[2]] as [number, number, number] }
      : { ...c },
  )
}

/** Lee la edición actual del panel (los numéricos mandan). */
function leerEdicion(raiz: HTMLElement): EdicionSandbox {
  const num = (id: string): number => Number((raiz.querySelector(`#${id}`) as HTMLInputElement)?.value ?? '0')
  return {
    cuerpoId: (raiz.querySelector('#sbCuerpo') as HTMLSelectElement)?.value ?? '',
    masa: num('sbMasaNum'),
    vx: num('sbVxNum'),
    vy: num('sbVyNum'),
    dt: num('sbDtNum'),
    duracionDias: num('sbDurNum'),
    infinito: (raiz.querySelector('#sbInf') as HTMLInputElement)?.checked ?? false,
    suavizado: num('sbSuavNum'),
  }
}

/** Une un slider con su numérico en ambas direcciones. */
function parSincronizado(
  raiz: HTMLElement,
  idRango: string,
  idNum: string,
  aNumero: (v: number) => number,
  aRango: (v: number) => number,
): void {
  const rango = raiz.querySelector(`#${idRango}`) as HTMLInputElement
  const num = raiz.querySelector(`#${idNum}`) as HTMLInputElement
  const min = Number(rango.min), max = Number(rango.max)
  rango.addEventListener('input', () => {
    num.value = String(aNumero(Number(rango.value)))
  })
  num.addEventListener('input', () => {
    const v = aRango(Number(num.value))
    if (Number.isFinite(v)) rango.value = String(Math.min(max, Math.max(min, v)))
  })
}

/** Refresca sliders y numéricos con los valores del cuerpo elegido. */
function refrescar(raiz: HTMLElement, cuerpos: CuerpoVisual[]): void {
  const sel = raiz.querySelector('#sbCuerpo') as HTMLSelectElement
  const cuerpo = cuerpos.find((c) => c.id === sel.value) ?? cuerpos[0]
  if (!cuerpo) return
  const fijar = (idRango: string, idNum: string, rango: number, numero: string): void => {
    ;(raiz.querySelector(`#${idRango}`) as HTMLInputElement).value = String(rango)
    ;(raiz.querySelector(`#${idNum}`) as HTMLInputElement).value = numero
  }
  fijar('sbMasa', 'sbMasaNum', Math.log10(cuerpo.masa), cuerpo.masa.toExponential(2))
  fijar('sbVx', 'sbVxNum', cuerpo.velocidad[0], String(Math.round(cuerpo.velocidad[0])))
  fijar('sbVy', 'sbVyNum', cuerpo.velocidad[1], String(Math.round(cuerpo.velocidad[1])))
}

/**
 * Monta el panel dentro de `contenedor`.
 * `alLanzar` recibe la edición; `fijarEstado` muestra pendiente/corriendo/listo.
 */
export function montarSandbox(
  contenedor: HTMLElement,
  cuerpos: CuerpoVisual[],
  dt: number,
  duracionDias: number,
  alCambiar: (ed: EdicionSandbox) => void,
): {
  fijarEstado: (msg: string) => void
  fijarCuerpo: (id: string) => void
  destruir: () => void
} {
  contenedor.innerHTML =
    '<div class="sb-head"><span class="sb-titulo">Sandbox</span>' +
    '<span id="sbEstado" role="status"></span></div>' +
    '<div class="sb-grid">' +
    '<div class="grupo"><span class="titulo">Cuerpo</span>' +
    '<select id="sbCuerpo">' +
    cuerpos.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('') +
    '</select></div>' +
    '<div class="grupo"><span class="titulo">Masa (kg)</span><div class="fila">' +
    '<input id="sbMasa" type="range" min="20" max="31" step="0.1" />' +
    '<input id="sbMasaNum" type="number" min="1e20" max="1e31" step="any" /></div></div>' +
    '<div class="grupo"><span class="titulo">Vx (m/s)</span><div class="fila">' +
    '<input id="sbVx" type="range" min="-30000" max="30000" step="50" />' +
    '<input id="sbVxNum" type="number" min="-30000" max="30000" step="50" /></div></div>' +
    '<div class="grupo"><span class="titulo">Vy (m/s)</span><div class="fila">' +
    '<input id="sbVy" type="range" min="-30000" max="30000" step="50" />' +
    '<input id="sbVyNum" type="number" min="-30000" max="30000" step="50" /></div></div>' +
    '<div class="grupo"><span class="titulo">dt (s)</span><div class="fila">' +
    '<input id="sbDt" type="range" min="10" max="3600" step="10" />' +
    '<input id="sbDtNum" type="number" min="10" max="3600" step="10" /></div></div>' +
    '<div class="grupo"><span class="titulo">Duración (días)</span><div class="fila">' +
    '<input id="sbDur" type="range" min="1" max="120" step="1" />' +
    '<input id="sbDurNum" type="number" min="1" max="120" step="1" /></div></div>' +
    '<div class="grupo"><span class="titulo">Modo</span><div class="fila">' +
    '<label><input id="sbInf" type="checkbox" checked /> Continuo ∞</label></div></div>' +
    '<div class="grupo"><span class="titulo">Suavizado (m)</span><div class="fila">' +
    '<input id="sbSuav" type="range" min="0" max="7" step="0.1" />' +
    '<input id="sbSuavNum" type="number" min="0" max="1e7" step="any" /></div></div>' +
    '</div>' +
    '<div class="sb-grid sb-tele" aria-label="Telemetría del cuerpo elegido">' +
    '<div class="grupo"><span class="titulo">Distancia</span><span class="val" id="sbTDist">—</span></div>' +
    '<div class="grupo"><span class="titulo">Velocidad</span><span class="val" id="sbTVel">—</span></div>' +
    '<div class="grupo"><span class="titulo">Semieje</span><span class="val" id="sbTSma">—</span></div>' +
    '<div class="grupo"><span class="titulo">Excentricidad</span><span class="val" id="sbTEcc">—</span></div>' +
    '<div class="grupo"><span class="titulo">Período</span><span class="val" id="sbTPer">—</span></div>' +
    '</div>'

  const identico = (v: number): number => v
  parSincronizado(contenedor, 'sbMasa', 'sbMasaNum', (v) => Math.pow(10, v), (v) => Math.log10(v))
  parSincronizado(contenedor, 'sbSuav', 'sbSuavNum', (v) => (v <= 0 ? 0 : Math.pow(10, v)), (v) => (v <= 0 ? 0 : Math.log10(v)))
  parSincronizado(contenedor, 'sbVx', 'sbVxNum', identico, identico)
  parSincronizado(contenedor, 'sbVy', 'sbVyNum', identico, identico)
  parSincronizado(contenedor, 'sbDt', 'sbDtNum', identico, identico)
  parSincronizado(contenedor, 'sbDur', 'sbDurNum', identico, identico)
  const sel = contenedor.querySelector('#sbCuerpo') as HTMLSelectElement
  // Por defecto, el último cuerpo (suele ser el que orbita: telemetría viva).
  if (cuerpos.length > 1) sel.value = cuerpos[cuerpos.length - 1].id
  const alCambiarCuerpo = (): void => refrescar(contenedor, cuerpos)
  sel.addEventListener('change', alCambiarCuerpo)
  // dt/pasos iniciales (del escenario) en ambos controles.
  const sembrar = (idRango: string, idNum: string, v: number): void => {
    ;(contenedor.querySelector(`#${idRango}`) as HTMLInputElement).value = String(v)
    ;(contenedor.querySelector(`#${idNum}`) as HTMLInputElement).value = String(v)
  }
  sembrar('sbDt', 'sbDtNum', dt)
  sembrar('sbDur', 'sbDurNum', duracionDias)
  sembrar('sbSuav', 'sbSuavNum', 0)
  refrescar(contenedor, cuerpos)

  // Sin botón Lanzar: cualquier cambio relanza solo con debounce (en vivo).
  let temporizador: number | undefined
  const programar = (): void => {
    window.clearTimeout(temporizador)
    temporizador = window.setTimeout(() => alCambiar(leerEdicion(contenedor)), 700)
  }
  const alEntrada = (): void => programar()
  contenedor.addEventListener('input', alEntrada)
  contenedor.addEventListener('change', alEntrada)

  return {
    fijarEstado: (msg: string) => {
      const estado = contenedor.querySelector('#sbEstado') as HTMLElement
      if (estado) estado.textContent = msg
    },
    /** Selecciona el cuerpo en el desplegable (viene del picking 3D). */
    fijarCuerpo: (id: string) => {
      const existe = cuerpos.some((c) => c.id === id)
      if (!existe) return
      sel.value = id
      refrescar(contenedor, cuerpos)
    },
    destruir: () => {
      window.clearTimeout(temporizador)
      sel.removeEventListener('change', alCambiarCuerpo)
      contenedor.removeEventListener('input', alEntrada)
      contenedor.removeEventListener('change', alEntrada)
    },
  }
}
