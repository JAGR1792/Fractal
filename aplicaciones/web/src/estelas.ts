/**
 * Estelas y estrellas puras (sin GPU): lógica testeable del render.
 * Las estelas guardan las últimas posiciones MUNDO de cada cuerpo con su
 * marca temporal; al pausar y reanudar se corta el segmento en vez de unir
 * puntos lejanos con una recta (ver mejorables §3).
 * Las estrellas son puntos fijos en un cascarón lejano.
 */

/** Un punto de estela con marca temporal (ms de performance.now()). */
export type PuntoEstela = [number, number, number, number]

/** Una estela: anillo de posiciones recientes de un cuerpo. */
export interface Estela {
  puntos: PuntoEstela[]
  maximo: number
}

/** Crea una estela vacía con capacidad `maximo`. */
export function crearEstela(maximo: number): Estela {
  return { puntos: [], maximo }
}

/**
 * Empuja una posición con su marca temporal (clona); recorta las más viejas.
 * `t` por defecto es `performance.now()`; en tests se pasa explícito.
 */
export function empujarEstela(e: Estela, p: [number, number, number], t = performance.now()): Estela {
  e.puntos.push([p[0], p[1], p[2], t])
  while (e.puntos.length > e.maximo) e.puntos.shift()
  return e
}

/** Vértice de línea ULTRA: [x,y,z, r,g,b, alpha]. */
export type VerticeLinea = [number, number, number, number, number, number, number]

/**
 * Convierte una estela en segmentos para line-list: del más viejo (alpha 0)
 * al más nuevo (alpha 1), con el color del cuerpo. Corta el segmento cuando
 * el salto temporal supera `saltoMaxMs` (pausa larga → sin recta fantasma).
 */
export function aSegmentos(
  e: Estela,
  color: [number, number, number],
  saltoMaxMs = 500,
): number[] {
  const salida: number[] = []
  const n = e.puntos.length
  for (let i = 0; i + 1 < n; i++) {
    const p = e.puntos[i]
    const q = e.puntos[i + 1]
    if (q[3] - p[3] > saltoMaxMs) continue
    const a0 = i / n
    const a1 = (i + 1) / n
    salida.push(p[0], p[1], p[2], color[0], color[1], color[2], a0)
    salida.push(q[0], q[1], q[2], color[0], color[1], color[2], a1)
  }
  return salida
}

/** Generador determinista (mulberry32) para estrellas estables entre cargas. */
export function generarEstrellas(cuantas: number, semilla: number, radio: number): Float32Array {
  let s = semilla >>> 0
  const azar = (): number => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const salida = new Float32Array(cuantas * 3)
  for (let i = 0; i < cuantas; i++) {
    // Dirección uniforme en la esfera × radio del cascarón.
    const u = azar() * 2 - 1
    const phi = azar() * Math.PI * 2
    const r = Math.sqrt(1 - u * u)
    salida[i * 3] = r * Math.cos(phi) * radio
    salida[i * 3 + 1] = Math.abs(u) * radio * (azar() > 0.15 ? 1 : -1)
    salida[i * 3 + 2] = r * Math.sin(phi) * radio
  }
  return salida
}
