/**
 * Mecánica orbital real (sin motor): elementos keplerianos desde r y v.
 * Para la telemetría del sandbox con fotogramas del servidor.
 */
import type { CuerpoVisual } from './escenario'

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

/**
 * Cuerpo central de `indice`: alrededor de quién orbita de verdad.
 *
 * El criterio es la **esfera de influencia** (Laplace), no la fuerza: un cuerpo
 * es central de otro si este último cae dentro de su radio de influencia
 * `r_SOI = d · (m/M)^(2/5)`, siendo `M` su propio primario. Entre varios
 * candidatos válidos gana el más masivo (el padre más cercano en la jerarquía).
 *
 * Por qué no basta la aceleración: la Tierra atrae a la Luna con 2.70e-3 m/s²
 * y el Sol con 5.90e-3 m/s², así que "más fuerza" daría Sol, cuando la Luna
 * está a 384400 km y la esfera de influencia terrestre llega a ~924000 km.
 * Tampoco sirve la cercanía en pantalla: las posiciones dibujadas están
 * escaladas de forma no uniforme (los radios se exageran).
 *
 * Si ningún candidato es válido (el padre candidato es el propio cuerpo, que
 * es lo que pasa en un sistema de dos cuerpos), se devuelve el más masivo.
 * Devuelve `null` si no hay otro cuerpo válido.
 */
export function cuerpoCentral(cuerpos: CuerpoVisual[], indice: number): number | null {
  const centro = cuerpos[indice]
  if (!centro) return null

  // El primario del candidato es el cuerpo más masivo que no sea él mismo.
  let padre: number | null = null
  let masaPadre = 0
  for (let j = 0; j < cuerpos.length; j++) {
    if (j === indice) continue
    const m = cuerpos[j]?.masa ?? 0
    if (m > masaPadre) {
      masaPadre = m
      padre = j
    }
  }
  if (padre === null) return null

  let mejor: number | null = null
  let mejorMasa = 0
  let masMasivo: number | null = null
  let masaMasMasivo = 0

  for (let j = 0; j < cuerpos.length; j++) {
    if (j === indice) continue
    const otro = cuerpos[j]
    const mp = cuerpos[padre]
    if (!otro || !mp || !(otro.masa > 0) || !(mp.masa > 0)) continue

    const dx = otro.posicion[0] - centro.posicion[0]
    const dy = otro.posicion[1] - centro.posicion[1]
    const dz = otro.posicion[2] - centro.posicion[2]
    const d = Math.hypot(dx, dy, dz)
    if (!(d > 0)) continue

    if (otro.masa > masaMasMasivo) {
      masaMasMasivo = otro.masa
      masMasivo = j
    }

    if (j === padre) continue // el primario no es central de su propio secundario
    const dp = Math.hypot(
      otro.posicion[0] - mp.posicion[0],
      otro.posicion[1] - mp.posicion[1],
      otro.posicion[2] - mp.posicion[2],
    )
    if (!(dp > 0)) continue
    const soi = dp * Math.pow(otro.masa / mp.masa, 0.4)
    if (d <= soi && otro.masa > mejorMasa) {
      mejorMasa = otro.masa
      mejor = j
    }
  }

  return mejor ?? masMasivo
}

/**
 * Elementos orbitales del cuerpo `indice` alrededor de su central real.
 * `null` si no hay central o los vectores son degenerados.
 */
export function elementosDeCuerpo(cuerpos: CuerpoVisual[], indice: number): Elementos | null {
  const central = cuerpoCentral(cuerpos, indice)
  const centro = cuerpos[indice]
  if (central === null || !centro) return null
  const otro = cuerpos[central]
  if (!otro) return null
  const r: Vec3 = [
    centro.posicion[0] - otro.posicion[0],
    centro.posicion[1] - otro.posicion[1],
    centro.posicion[2] - otro.posicion[2],
  ]
  const v: Vec3 = [
    centro.velocidad[0] - otro.velocidad[0],
    centro.velocidad[1] - otro.velocidad[1],
    centro.velocidad[2] - otro.velocidad[2],
  ]
  return elementosOrbitales(r, v, G * otro.masa)
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
