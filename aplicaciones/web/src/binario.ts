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
