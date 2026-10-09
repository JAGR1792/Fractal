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
