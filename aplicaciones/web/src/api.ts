/**
 * Cliente del API Fractal (Etapa 3).
 *
 * Orquesta el flujo sandbox: crea la simulación desde un escenario local,
 * espera a que el background termine y trae los fotogramas binarios.
 * Todo fallo devuelve `null`: el render usa la demo local (sin servidor).
 */
import { traerBinario, type Fotogramas } from './binario'
import type { CuerpoVisual } from './escenario'
import { escalaMundo } from './escenario'

/** Fuente de fotogramas del servidor para `montarUltra`. */
export interface FuenteEstados {
  /** Bloques como vistas (ver `partirBloques`), con `bloques[i][0]` = tiempo. */
  bloques: Float32Array[]
  /** Factor mundo (misma escala que `normalizarPosiciones`). */
  escala: number
  /** Milisegundos que tardó el cálculo (para el prefetch adaptativo). */
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
export function aPeticion(visuales: CuerpoVisual[], dt: number, pasos: number, cadaN: number): { cuerpos: CuerpoApi[]; dt: number; pasos: number; cada_n: number } {  return {
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

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Intenta traer fotogramas del servidor para los visuales dados.
 * Devuelve `null` si el API no responde (demo local como fallback).
 */
export async function probarFuente(visuales: CuerpoVisual[], dt: number, pasos: number): Promise<FuenteEstados | null> {
  const base = baseApi()
  try {
    const ctrl = new AbortController()
    const fuera = setTimeout(() => ctrl.abort(), 1500)
    const salud = await fetch(`${base}/salud`, { signal: ctrl.signal }).catch(() => null)
    clearTimeout(fuera)
    if (!salud || !salud.ok) return null

    // Sobrepedido ×1.3: la ventana debe cubrir más de una órbita para que
    // el detector de bucle cierre con margen (ver detectarLimiteBucle).
    const pasosFx = Math.ceil(pasos * 1.3)
    const cadaN = Math.max(1, Math.floor(pasosFx / 200))
    const tIni = performance.now()
    const crear = await fetch(`${base}/api/v1/simulaciones`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(aPeticion(visuales, dt, pasosFx, cadaN)),
    })
    if (crear.status !== 202) return null
    const { id } = (await crear.json()) as { id: string }

    for (let i = 0; i < 200; i++) {
      const ficha = await fetch(`${base}/api/v1/simulaciones/${id}`).catch(() => null)
      if (!ficha || !ficha.ok) return null
      const info = (await ficha.json()) as { estado: string }
      if (info.estado === 'completada') break
      if (info.estado === 'fallida') return null
      await esperar(300)
    }
    const foto: Fotogramas = await traerBinario(base, id, 0, 500)
    if (foto.bloques < 2) return null
    const { partirBloques } = await import('./binario')
    return {
      bloques: partirBloques(foto.datos, foto.cuerpos),
      escala: escalaMundo(visuales),
      tCalculoMs: performance.now() - tIni,
    }
  } catch {
    return null
  }
}
