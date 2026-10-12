/**
 * Protocolo binario Fractal v1 (little-endian).
 *
 * Configuración: JSON de datos/escenarios/*.json (una vez).
 * Estados: bloques Float32Array por frame simulado:
 *   [t, x0,y0,z0,vx0,vy0,vz0, x1,y1,z1,...]
 * Longitud = 1 + N*6 floats.
 *
 * JSON es 5-10x más grande y genera GC; por eso ULTRA usa binario.
 */

export const VERSION_BINARIO = 1
export const FLOTANTES_POR_CUERPO = 6

export function contarCuerpos(buffer: Float32Array): number {
  if (buffer.length < 1) throw new Error('bloque vacío')
  return Math.floor((buffer.length - 1) / FLOTANTES_POR_CUERPO)
}

export function tiempoDeBloque(buffer: Float32Array): number {
  if (buffer.length < 1) throw new Error('bloque vacío')
  return buffer[0]
}

/** Vista de posiciones de un cuerpo sin copiar (x,y,z). */
export function posicionDe(buffer: Float32Array, indice: number): [number, number, number] {
  const base = 1 + indice * FLOTANTES_POR_CUERPO
  return [buffer[base], buffer[base + 1], buffer[base + 2]]
}

/** Fotogramas traídos del API (`GET /:id/binario`). */
export interface Fotogramas {
  /** Cuerpos por bloque (cabecera `x-fractal-cuerpos`). */
  cuerpos: number
  /** Bloques recibidos (cabecera `x-fractal-bloques`). */
  bloques: number
  /** Índice inicial (cabecera `x-fractal-desde`). */
  desde: number
  /** Todos los floats concatenados, little-endian. */
  datos: Float32Array
}

/** Parte el buffer en vistas por bloque, sin copiar (una vista por fotograma). */
export function partirBloques(datos: Float32Array, cuerpos: number): Float32Array[] {
  const porBloque = 1 + cuerpos * FLOTANTES_POR_CUERPO
  if (porBloque < 1 || datos.length % porBloque !== 0) throw new Error('binario truncado')
  const salida: Float32Array[] = []
  for (let i = 0; i < datos.length / porBloque; i++) {
    salida.push(datos.subarray(i * porBloque, (i + 1) * porBloque))
  }
  return salida
}

/**
 * Último bloque de la primera órbita completa del cuerpo 1 alrededor del 0.
 * Loopear ahí es física continua hacia adelante (sin saltos ni rebobinados).
 * Revisa los planos XY/XZ/YZ porque cada escenario orbita en el suyo.
 *
 * Robusto ante ventanas que no cierran la órbita exacta (p. ej. 0.985
 * órbitas): en vez de exigir 2π−0.05 estricto, busca el MEJOR empalme
 * (mínimo saltoDeBucle) entre los candidatos con ≥0.9 órbitas acumuladas.
 * Así el wrap es el salto más pequeño posible, no un corte arbitrario.
 */
export function detectarLimiteBucle(bloques: Float32Array[], nCuerpos: number): number {
  if (!bloques || bloques.length < 3 || nCuerpos < 2) {
    return bloques ? bloques.length - 1 : 0
  }
  const planos: Array<[number, number, number, number]> = [
    [1, 2, 7, 8],
    [1, 3, 7, 9],
    [2, 3, 8, 9],
  ]
  const angulo = (b: Float32Array, p: [number, number, number, number]): number =>
    Math.atan2(b[p[3]] - b[p[1]], b[p[2]] - b[p[0]])
  const estado = planos.map((p) => ({ p, previo: angulo(bloques[0], p), acum: 0 }))
  let mejor = bloques.length - 1
  let mejorSalto = Infinity
  const medir = (k: number): number => {
    const a = bloques[0]
    const b = bloques[k]
    if (a.length < 13 || b.length < 13) return Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3])
    const dx = (b[7] - b[1]) - (a[7] - a[1])
    const dy = (b[8] - b[2]) - (a[8] - a[2])
    const dz = (b[9] - b[3]) - (a[9] - a[3])
    return Math.hypot(dx, dy, dz)
  }
  for (let k = 1; k < bloques.length; k++) {
    const b = bloques[k]
    for (const s of estado) {
      const a = angulo(b, s.p)
      let d = a - s.previo
      if (d > Math.PI) d -= 2 * Math.PI
      if (d < -Math.PI) d += 2 * Math.PI
      s.acum += d
      s.previo = a
      // Candidato: casi una vuelta o más; nos quedamos con el menor salto.
      // Se recorre TODO (n~200, barato) porque el primer candidato rara vez
      // es el mejor: el mínimo global es el empalme más invisible.
      if (Math.abs(s.acum) >= 2 * Math.PI - 0.6) {
        const salto = medir(k)
        if (salto < mejorSalto) {
          mejorSalto = salto
          mejor = k
        }
      }
    }
  }
  return mejor
}

/**
 * Salto del bucle en metros SI: distancia entre el estado inicial y el de
 * cierre para el cuerpo 1 relativo al 0. Cero = loop perfecto.
 */
export function saltoDeBucle(bloques: Float32Array[], limite: number): number {
  if (!bloques || bloques.length < 2) return Infinity
  const a = bloques[0]
  const b = bloques[Math.min(Math.max(limite, 1), bloques.length - 1)]
  if (a.length < 13 || b.length < 13) {
    // Un cuerpo: deriva absoluta (idealmente vuelve al inicio).
    return Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3])
  }
  const dx = (b[7] - b[1]) - (a[7] - a[1])
  const dy = (b[8] - b[2]) - (a[8] - a[2])
  const dz = (b[9] - b[3]) - (a[9] - a[3])
  return Math.hypot(dx, dy, dz)
}

/**
 * Bloque interpolado al instante `t` dentro de `[bloques[0][0]..bloques[limite][0]]`.
 * Devuelve copia nueva `[t, x,y,z,vx,vy,vz × N]`.
 */
export function interpolarBloque(bloques: Float32Array[], limite: number, t: number): Float32Array | null {
  if (!bloques || bloques.length < 2) return null
  const tope = Math.min(limite, bloques.length - 1)
  let k = 0
  while (k + 1 < tope && bloques[k + 1][0] <= t) k++
  const a = bloques[k]
  const b = bloques[Math.min(k + 1, tope)]
  const tramo = b[0] - a[0]
  const alpha = tramo > 0 ? Math.min(Math.max((t - a[0]) / tramo, 0), 1) : 0
  const salida = new Float32Array(a.length)
  salida[0] = t
  for (let i = 1; i < a.length; i++) salida[i] = a[i] + (b[i] - a[i]) * alpha
  return salida
}

/** Trae bloques binarios del API y valida el layout con las cabeceras. */
export async function traerBinario(base: string, id: string, desde = 0, limite = 100): Promise<Fotogramas> {
  const res = await fetch(`${base}/api/v1/simulaciones/${id}/binario?desde=${desde}&limite=${limite}`)
  if (!res.ok) throw new Error(`binario HTTP ${res.status}`)
  const version = res.headers.get('x-fractal-version')
  if (version !== String(VERSION_BINARIO)) throw new Error(`protocolo ${version}, esperaba ${VERSION_BINARIO}`)
  const cuerpos = Number(res.headers.get('x-fractal-cuerpos') ?? '0')
  const bloques = Number(res.headers.get('x-fractal-bloques') ?? '0')
  const desdeCab = Number(res.headers.get('x-fractal-desde') ?? String(desde))
  if (!Number.isFinite(cuerpos) || cuerpos < 1) throw new Error('cabecera x-fractal-cuerpos inválida')
  const datos = new Float32Array(await res.arrayBuffer())
  const vistas = partirBloques(datos, cuerpos)
  if (vistas.length !== bloques) throw new Error('bloques incompletos')
  return { cuerpos, bloques, desde: desdeCab, datos }
}
