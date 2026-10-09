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

/** Lee la edición actual del panel (masa en escala logarítmica). */
function leerEdicion(raiz: HTMLElement): EdicionSandbox {
  const tomar = (id: string): string => (raiz.querySelector(`#${id}`) as HTMLInputElement)?.value ?? ''
  return {
    cuerpoId: (raiz.querySelector('#sbCuerpo') as HTMLSelectElement)?.value ?? '',
    masa: Math.pow(10, Number(tomar('sbMasa'))),
    vx: Number(tomar('sbVx')),
    vy: Number(tomar('sbVy')),
    dt: Number(tomar('sbDt')),
    pasos: Number(tomar('sbPasos')),
  }
}

/** Refresca etiquetas y sliders con los valores del cuerpo elegido. */
function refrescar(raiz: HTMLElement, cuerpos: CuerpoVisual[]): void {
  const sel = raiz.querySelector('#sbCuerpo') as HTMLSelectElement
  const cuerpo = cuerpos.find((c) => c.id === sel.value) ?? cuerpos[0]
  if (!cuerpo) return
  const fijar = (id: string, v: number): void => {
    const input = raiz.querySelector(`#${id}`) as HTMLInputElement
    const etiqueta = raiz.querySelector(`#${id}Val`) as HTMLElement
    input.value = String(v)
    if (etiqueta) etiqueta.textContent = etiqueta.dataset['formato'] === 'exp' ? Number(v).toExponential(1) : String(v)
  }
  fijar('sbMasa', Math.log10(cuerpo.masa))
  fijar('sbVx', cuerpo.velocidad[0])
  fijar('sbVy', cuerpo.velocidad[1])
  const poner = (id: string, texto: string): void => {
    const etiqueta = raiz.querySelector(`#${id}Val`) as HTMLElement
    if (etiqueta) etiqueta.textContent = texto
  }
  poner('sbMasa', cuerpo.masa.toExponential(1))
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
    '<strong>Sandbox</strong>' +
    '<label>Cuerpo <select id="sbCuerpo">' +
    cuerpos.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('') +
    '</select></label>' +
    '<label>Masa <input id="sbMasa" type="range" min="20" max="31" step="0.1" /><span id="sbMasaVal"></span></label>' +
    '<label>Vx <input id="sbVx" type="range" min="-30000" max="30000" step="50" /><span id="sbVxVal"></span></label>' +
    '<label>Vy <input id="sbVy" type="range" min="-30000" max="30000" step="50" /><span id="sbVyVal"></span></label>' +
    '<label>dt(s) <input id="sbDt" type="range" min="10" max="3600" step="10" value="' + dt + '" /><span id="sbDtVal">' + dt + '</span></label>' +
    '<label>Pasos <input id="sbPasos" type="range" min="50" max="20000" step="50" value="' + pasos + '" /><span id="sbPasosVal">' + pasos + '</span></label>' +
    '<button id="sbLanzar">Lanzar</button>' +
    '<span id="sbEstado" role="status"></span>'

  const enVivo = (id: string): void => {
    const input = contenedor.querySelector(`#${id}`) as HTMLInputElement
    const etiqueta = contenedor.querySelector(`#${id}Val`) as HTMLElement
    input.addEventListener('input', () => {
      etiqueta.textContent = id === 'sbMasa' ? Number(Math.pow(10, Number(input.value))).toExponential(1) : input.value
    })
  }
  for (const id of ['sbMasa', 'sbVx', 'sbVy', 'sbDt', 'sbPasos']) enVivo(id)
  const sel = contenedor.querySelector('#sbCuerpo') as HTMLSelectElement
  const alCambiarCuerpo = (): void => refrescar(contenedor, cuerpos)
  sel.addEventListener('change', alCambiarCuerpo)
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
