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
 * Bloque interpolado al instante `t` dentro de `[bloques[0][0]..bloques[limite][0]]`.
 * Devuelve copia nueva `[t, x,y,z,vx,vy,vz × N]`.
 *
 * Interpolación de Hermite cúbica con las velocidades de los extremos:
 * exacta en los nodos (posición Y velocidad) y mucho más fiel entre ellos
 * que el lerp lineal. Esto importa el doble: suaviza el render Y reduce el
 * error al resembrar el siguiente tramo desde el vuelo actual (cada
 * re-sembraje con lerp cambiaba un poco la energía y la órbita derivaba).
 */
export function interpolarBloque(bloques: Float32Array[], limite: number, t: number): Float32Array | null {
  if (!bloques || bloques.length < 2) return null
  const tope = Math.min(limite, bloques.length - 1)
  let k = 0
  while (k + 1 < tope && bloques[k + 1][0] <= t) k++
  const a = bloques[k]
  const b = bloques[Math.min(k + 1, tope)]
  const h = b[0] - a[0]
  const u = h > 0 ? Math.min(Math.max((t - a[0]) / h, 0), 1) : 0
  const u2 = u * u
  const u3 = u2 * u
  // Base de Hermite: h00, h10, h01, h11.
  const h00 = 2 * u3 - 3 * u2 + 1
  const h10 = u3 - 2 * u2 + u
  const h01 = -2 * u3 + 3 * u2
  const h11 = u3 - u2
  // Derivadas para la velocidad (respecto a t real: se divide entre h).
  const d00 = (6 * u2 - 6 * u) / (h > 0 ? h : 1)
  const d10 = (3 * u2 - 4 * u + 1)
  const d01 = (-6 * u2 + 6 * u) / (h > 0 ? h : 1)
  const d11 = (3 * u2 - 2 * u)
  const salida = new Float32Array(a.length)
  salida[0] = t
  const n = Math.floor((a.length - 1) / FLOTANTES_POR_CUERPO)
  for (let i = 0; i < n; i++) {
    const o = 1 + i * FLOTANTES_POR_CUERPO
    for (let e = 0; e < 3; e++) {
      const p0 = a[o + e]
      const v0 = a[o + 3 + e]
      const p1 = b[o + e]
      const v1 = b[o + 3 + e]
      salida[o + e] = h00 * p0 + h10 * h * v0 + h01 * p1 + h11 * h * v1
      salida[o + 3 + e] = d00 * p0 + d10 * v0 + d01 * p1 + d11 * v1
    }
  }
  return salida
}
