/**
 * Escenario Fractal: tipos + carga + escala visual.
 *
 * El motor usa SI (m, kg, s). La vista usa escala logarítmica/exagerada
 * porque a escala real no se ve nada (la Luna sería 1 píxel).
 */

export interface Vec3Tupla extends Array<number> {
  0: number
  1: number
  2: number
}

export interface CuerpoEscenario {
  id: string
  nombre: string
  masa: number
  radio: number
  posicion: [number, number, number]
  velocidad: [number, number, number]
}

export interface Escenario {
  id: string
  nombre: string
  descripcion: string
  cuerpos: CuerpoEscenario[]
  parametros?: { dt?: number; pasos?: number; nota?: string }
}

export interface CuerpoVisual extends CuerpoEscenario {
  /** Radio en mundo para dibujo (exagerado). */
  radioVisual: number
  /** Color base RGB 0..1 para ULTRA/LITE. */
  color: [number, number, number]
}

const COLORES_POR_ID: Record<string, [number, number, number]> = {
  sol: [1.0, 0.85, 0.2],
  mercurio: [0.7, 0.7, 0.72],
  venus: [0.95, 0.75, 0.4],
  tierra: [0.2, 0.45, 0.95],
  luna: [0.8, 0.8, 0.85],
  marte: [0.9, 0.35, 0.2],
  jupiter: [0.9, 0.7, 0.5],
  saturno: [0.9, 0.82, 0.6],
  urano: [0.5, 0.85, 0.9],
  neptuno: [0.25, 0.4, 0.95],
}

const COLORES_FALLBACK: Array<[number, number, number]> = [
  [0.7, 0.7, 0.72],
  [0.95, 0.75, 0.4],
  [0.9, 0.35, 0.2],
  [0.5, 0.85, 0.9],
]

/**
 * Convierte radios físicos (m) a radios visuales (mundo).
 * Usa raíz cúbica para comprimir 3 órdenes de magnitud en ~1 orden visual.
 */
export function aVisual(escenario: Escenario, exageracion = 800): CuerpoVisual[] {
  void exageracion
  return escenario.cuerpos.map((c, i) => {
    // Escala logarítmica: comprime 1e6..1e9 m en 0.6..6.0 mundo, preserva orden.
    const radioVisual = 0.6 + Math.log10(Math.max(c.radio, 1)) * 0.5
    const color = COLORES_POR_ID[c.id.toLowerCase()] ?? COLORES_FALLBACK[i % COLORES_FALLBACK.length]
    return {
      ...c,
      radioVisual: Math.min(Math.max(radioVisual, 0.6), 6.0),
      color,
    }
  })
}

/** Normaliza posiciones del escenario a mundo (-50..50) para la cámara inicial. */
export function normalizarPosiciones(visuales: CuerpoVisual[]): Map<string, [number, number, number]> {
  let maxR = 1
  for (const c of visuales) {
    const r = Math.hypot(c.posicion[0], c.posicion[1], c.posicion[2])
    if (r > maxR) maxR = r
  }
  const escala = 40 / maxR
  const mapa = new Map<string, [number, number, number]>()
  for (const c of visuales) {
    mapa.set(c.id, [c.posicion[0] * escala, c.posicion[2] * escala, c.posicion[1] * escala])
  }
  return mapa
}

export async function cargarEscenario(url: string): Promise<Escenario> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`no se pudo cargar escenario: ${url}`)
  const datos = (await res.json()) as Escenario
  if (!Array.isArray(datos.cuerpos) || datos.cuerpos.length === 0) {
    throw new Error('escenario sin cuerpos')
  }
  return datos
}
