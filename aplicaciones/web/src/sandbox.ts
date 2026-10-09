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
  pasos: number
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
    pasos: Math.round(num('sbPasosNum')),
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
  pasos: number,
  alLanzar: (ed: EdicionSandbox) => void,
): {
  fijarEstado: (msg: string) => void
  fijarCuerpo: (id: string) => void
  destruir: () => void
} {
  contenedor.innerHTML =
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
    '<div class="grupo"><span class="titulo">Pasos</span><div class="fila">' +
    '<input id="sbPasos" type="range" min="50" max="20000" step="50" />' +
    '<input id="sbPasosNum" type="number" min="50" max="20000" step="50" /></div></div>' +
    '<div class="grupo"><button id="sbLanzar">Lanzar</button><span id="sbEstado" role="status"></span></div>'

  const identico = (v: number): number => v
  parSincronizado(contenedor, 'sbMasa', 'sbMasaNum', (v) => Math.pow(10, v), (v) => Math.log10(v))
  parSincronizado(contenedor, 'sbVx', 'sbVxNum', identico, identico)
  parSincronizado(contenedor, 'sbVy', 'sbVyNum', identico, identico)
  parSincronizado(contenedor, 'sbDt', 'sbDtNum', identico, identico)
  parSincronizado(contenedor, 'sbPasos', 'sbPasosNum', identico, identico)
  const sel = contenedor.querySelector('#sbCuerpo') as HTMLSelectElement
  const alCambiarCuerpo = (): void => refrescar(contenedor, cuerpos)
  sel.addEventListener('change', alCambiarCuerpo)
  // dt/pasos iniciales (del escenario) en ambos controles.
  const sembrar = (idRango: string, idNum: string, v: number): void => {
    ;(contenedor.querySelector(`#${idRango}`) as HTMLInputElement).value = String(v)
    ;(contenedor.querySelector(`#${idNum}`) as HTMLInputElement).value = String(v)
  }
  sembrar('sbDt', 'sbDtNum', dt)
  sembrar('sbPasos', 'sbPasosNum', pasos)
  refrescar(contenedor, cuerpos)

  const btn = contenedor.querySelector('#sbLanzar') as HTMLButtonElement
  const alLanzarClick = (): void => alLanzar(leerEdicion(contenedor))
  btn.addEventListener('click', alLanzarClick)

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
      sel.removeEventListener('change', alCambiarCuerpo)
      btn.removeEventListener('click', alLanzarClick)
    },
  }
}
