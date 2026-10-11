/**
 * Partículas de explosión puras (sin GPU): sistema testeable.
 * El render las vuelca a un buffer de puntos cada frame.
 */

export interface Chispa {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  /** Vida total en segundos. */
  vida: number
  /** Edad en segundos. */
  edad: number
  r: number; g: number; b: number
}

export interface SistemaChispas {
  chispas: Chispa[]
  capacidad: number
}

/** Crea un sistema vacío con tope de partículas. */
export function crearSistema(capacidad = 800): SistemaChispas {
  return { chispas: [], capacidad }
}

/**
 * Registra el último disparo por clave (p. ej. `"2-5"`): devuelve `true`
 * si ya pasó `esperaMs` desde la anterior (anti-spam de explosiones).
 */
export function puedeExplotar(mapa: Map<string, number>, clave: string, ahoraMs: number, esperaMs: number): boolean {
  const ultimo = mapa.get(clave) ?? -Infinity
  if (ahoraMs - ultimo < esperaMs) return false
  mapa.set(clave, ahoraMs)
  return true
}

/** Siembra `n` chispas en `punto` con velocidades de hasta `rapidez` m/s (mundo). */
export function explotar(sis: SistemaChispas, punto: [number, number, number], n: number, rapidez: number): void {
  for (let k = 0; k < n; k++) {
    if (sis.chispas.length >= sis.capacidad) sis.chispas.shift()
    const t = Math.random() * Math.PI * 2
    const z = Math.random() * 2 - 1
    const r = Math.sqrt(Math.max(0, 1 - z * z))
    const v = rapidez * (0.4 + 0.6 * Math.random())
    sis.chispas.push({
      x: punto[0], y: punto[1], z: punto[2],
      vx: r * Math.cos(t) * v, vy: r * Math.sin(t) * v, vz: z * v,
      vida: 1.2 + Math.random() * 0.8,
      edad: 0,
      r: 1.0, g: 0.45 + Math.random() * 0.2, b: 0.15,
    })
  }
}

/** Avanza la simulación `dt` segundos (con arrastre); devuelve vivas. */
export function actualizar(sis: SistemaChispas, dt: number): number {
  const freno = Math.max(0, 1 - 0.6 * dt)
  for (const c of sis.chispas) {
    c.edad += dt
    c.x += c.vx * dt
    c.y += c.vy * dt
    c.z += c.vz * dt
    c.vx *= freno
    c.vy *= freno
    c.vz *= freno
  }
  sis.chispas = sis.chispas.filter((c) => c.edad < c.vida)
  return sis.chispas.length
}

/** Vuelca a intercalado `[x,y,z, brillo, r,g,b]` (brillo 1→0 con la edad). */
export function aIntercalado(sis: SistemaChispas): Float32Array {
  const salida = new Float32Array(sis.chispas.length * 7)
  sis.chispas.forEach((c, i) => {
    const brillo = Math.max(0, 1 - c.edad / c.vida)
    salida.set([c.x, c.y, c.z, brillo, c.r, c.g, c.b], i * 7)
  })
  return salida
}
