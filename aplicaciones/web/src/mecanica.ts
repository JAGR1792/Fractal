/**
 * Mecánica orbital real (sin motor): elementos keplerianos desde r y v.
 * Para la telemetría del sandbox con fotogramas del servidor.
 */

/** Constante gravitacional en SI (m³/kg/s²). */
export const G = 6.6743e-11

export type Vec3 = [number, number, number]

/** Elementos orbitales osculadores alrededor de una masa central. */
export interface Elementos {
  /** Semieje mayor en m (`null` si no está ligada). */
  sma: number | null
  /** Excentricidad (0 = circular). */
  excentricidad: number
  /** Período en s (`null` si no está ligada). */
  periodo: number | null
  /** Velocidad en m/s. */
  velocidad: number
  /** Distancia en m. */
  distancia: number
}

/**
 * Calcula elementos desde posición/velocidad relativas al central.
 * `mu = G * M_central`. Devuelve `null` si los vectores son degenerados.
 */
export function elementosOrbitales(r: Vec3, v: Vec3, mu: number): Elementos | null {
  const rn = Math.hypot(r[0], r[1], r[2])
  const v2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2]
  if (!(rn > 0) || !(mu > 0)) return null
  const energia = v2 / 2 - mu / rn
  const sma = energia < 0 ? -mu / (2 * energia) : null
  // Vector excentricidad: ((v²−μ/r)r − (r·v)v) / μ
  const rv = r[0] * v[0] + r[1] * v[1] + r[2] * v[2]
  const f = v2 - mu / rn
  const ex = (f * r[0] - rv * v[0]) / mu
  const ey = (f * r[1] - rv * v[1]) / mu
  const ez = (f * r[2] - rv * v[2]) / mu
  const excentricidad = Math.hypot(ex, ey, ez)
  const periodo = sma !== null ? 2 * Math.PI * Math.sqrt((sma * sma * sma) / mu) : null
  return { sma, excentricidad, periodo, velocidad: Math.sqrt(v2), distancia: rn }
}

/** Formato compacto: 3.84e+8 m → "384.4k km", 1022 → "1.02 km/s". */
export function formatearDistancia(m: number): string {
  const km = m / 1000
  if (km < 1000) return `${km.toFixed(1)} km`
  if (km < 1e6) return `${(km / 1000).toFixed(1)}k km`
  return `${(km / 1e6).toFixed(2)}M km`
}

/** Impacto entre dos cuerpos: índices y punto medio (mundo). */
export interface Impacto {
  a: number
  b: number
  punto: [number, number, number]
}

/**
 * Detecta pares cuya distancia es menor que `(r1+r2) × factor`.
 * O(N²) como la física; N es pequeño en el sandbox.
 */
export function detectarImpactos(
  centros: Array<[number, number, number]>,
  radios: number[],
  factor = 1.5,
): Impacto[] {
  const salida: Impacto[] = []
  for (let i = 0; i < centros.length; i++) {
    for (let j = i + 1; j < centros.length; j++) {
      const dx = centros[j][0] - centros[i][0]
      const dy = centros[j][1] - centros[i][1]
      const dz = centros[j][2] - centros[i][2]
      const d = Math.hypot(dx, dy, dz)
      if (d < ((radios[i] ?? 0) + (radios[j] ?? 0)) * factor) {
        salida.push({
          a: i,
          b: j,
          punto: [
            (centros[i][0] + centros[j][0]) / 2,
            (centros[i][1] + centros[j][1]) / 2,
            (centros[i][2] + centros[j][2]) / 2,
          ],
        })
      }
    }
  }
  return salida
}
