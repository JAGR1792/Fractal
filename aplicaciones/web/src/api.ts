/**
 * Cliente del API Fractal: sesiones vivas con cursor (ADR-0007).
 *
 * El servidor integra sin fin; el frontend avanza un cursor temporal por
 * polling. Todo fallo devuelve `null`/`false`: demo local sin servidor.
 */
import type { CuerpoVisual } from './escenario'
import { VERSION_BINARIO } from './binario'

/** Fuente de fotogramas del servidor para los renderers. */
export interface FuenteEstados {
  /** Bloques como vistas (ver `partirBloques`), con `bloques[i][0]` = tiempo. */
  bloques: Float32Array[]
  /** Factor mundo (misma escala que `normalizarPosiciones`). */
  escala: number
  /** Reservado (compatibilidad con versiones de tramo). */
  tCalculoMs: number
}

/** Cuerpo en el formato que espera Rust (`Vec3` como objeto, no tupla). */
interface CuerpoApi {
  id: string
  nombre: string
  masa: number
  radio: number
  posicion: { x: number; y: number; z: number }
  velocidad: { x: number; y: number; z: number }
}

/** Convierte cuerpos visuales (tuplas) al JSON del API (objetos xyz). */
export function aPeticion(
  visuales: CuerpoVisual[],
  dt: number,
  pasos: number,
  cadaN: number,
  suavizado = 0,
): { cuerpos: CuerpoApi[]; dt: number; pasos: number; cada_n: number; suavizado: number } {
  return {
    cuerpos: visuales.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      masa: c.masa,
      radio: c.radio,
      posicion: { x: c.posicion[0], y: c.posicion[1], z: c.posicion[2] },
      velocidad: { x: c.velocidad[0], y: c.velocidad[1], z: c.velocidad[2] },
    })),
    dt,
    pasos,
    cada_n: cadaN,
    suavizado,
  }
}

/** Base del API (`VITE_API_URL` o localhost por defecto). */
export function baseApi(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return env?.['VITE_API_URL'] ?? 'http://localhost:3000'
}

/**
 * Reconstruye visuales desde un bloque binario (posiciones+velocidades en SI).
 * Conserva id/nombre/masa/radio de `base`. Para encadenar simulaciones.
 */
export function visualesDesdeBloque(base: CuerpoVisual[], bloque: Float32Array): CuerpoVisual[] {
  return base.map((c, i) => {
    const o = 1 + i * 6
    return {
      ...c,
      posicion: [bloque[o] ?? 0, bloque[o + 1] ?? 0, bloque[o + 2] ?? 0] as [number, number, number],
      velocidad: [bloque[o + 3] ?? 0, bloque[o + 4] ?? 0, bloque[o + 5] ?? 0] as [number, number, number],
    }
  })
}

/**
 * Pone posiciones SI (plano N×3) sobre la base, conservando velocidades.
 * Para bifurcar desde el vuelo actual sin saltos visuales.
 */
export function visualesConPosiciones(base: CuerpoVisual[], pos: number[]): CuerpoVisual[] {
  return base.map((c, i) => ({
    ...c,
    posicion: [pos[i * 3] ?? 0, pos[i * 3 + 1] ?? 0, pos[i * 3 + 2] ?? 0] as [number, number, number],
  }))
}

/** Bloques cada ~12000 s de sim (independiente del dt). */
export function cadaNPara(dt: number): number {
  if (!(dt > 0)) return 20
  return Math.min(1000, Math.max(1, Math.round(12000 / dt)))
}

/** Sesión viva del servidor (ver ADR-0007). */
export interface SesionCliente {
  id: string
  cuerpos: number
}

/** Crea una sesión viva desde visuales (integra bajo demanda). */
export async function crearSesion(
  base: string,
  visuales: CuerpoVisual[],
  dt: number,
  suavizado: number,
): Promise<SesionCliente | null> {
  try {
    const res = await fetch(`${base}/api/v1/sesiones`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(aPeticion(visuales, dt, 1200, cadaNPara(dt), suavizado)),
    })
    if (res.status !== 201) return null
    return (await res.json()) as SesionCliente
  } catch {
    return null
  }
}

/** Lee lo nuevo desde el cursor `desde` (tiempo sim). */
export async function leerSesion(
  base: string,
  id: string,
  desde: number,
  limite = 200,
): Promise<{ bloques: Float32Array[]; hasta: number; cuerpos: number } | null> {
  try {
    const res = await fetch(`${base}/api/v1/sesiones/${id}/estados?desde=${desde}&limite=${limite}`)
    if (!res.ok) return null
    if (res.headers.get('x-fractal-version') !== String(VERSION_BINARIO)) return null
    const cuerpos = Number(res.headers.get('x-fractal-cuerpos') ?? '0')
    const hasta = Number(res.headers.get('x-fractal-hasta') ?? String(desde))
    if (!Number.isFinite(cuerpos) || cuerpos < 1 || !Number.isFinite(hasta)) return null
    const { partirBloques } = await import('./binario')
    return { bloques: partirBloques(new Float32Array(await res.arrayBuffer()), cuerpos), hasta, cuerpos }
  } catch {
    return null
  }
}

/** Cambia masas/dt/suavizado en caliente sobre la sesión viva. */
export async function actualizarSesion(
  base: string,
  id: string,
  cambios: { masas?: Record<string, number>; dt?: number; suavizado?: number },
): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/v1/sesiones/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cambios),
    })
    return res.ok
  } catch {
    return false
  }
}
