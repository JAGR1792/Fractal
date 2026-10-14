/**
 * Medición de rendimiento del render (lógica pura, sin DOM ni GPU).
 *
 * Fase 0 del experimento (`experimento_nuevo_render`): medir antes de
 * optimizar. El libro (§1.3) exige estimar el presupuesto de operaciones
 * antes de tocar nada: a 60 fps cada cuadro dispone de ~16 ms, y todo lo que
 * se salga de ahí es un parón visible.
 *
 * El medidor es barato a propósito: un anillo fijo de tiempos (sin allocs en
 * caliente) y contadores enteros. `foto()` copia y ordena, pero solo se llama
 * ~1 vez por segundo desde el overlay, nunca en el camino caliente.
 */

/** Ventana de cuadros para p50/p95/máx. */
export const VENTANA_MEDICION = 240
/** Un cuadro que tarda más que esto cuenta como parón visible. */
export const UMBRAL_PARON_MS = 50

/** Foto inmutable para el overlay y `window.__fractalMedicion`. */
export interface FotoMedicion {
  cuadros: number
  msUltimo: number
  msP50: number
  msP95: number
  msMax: number
  /** Cuadros de más de `UMBRAL_PARON_MS` acumulados. */
  parones: number
  /** Interpolaciones Hermite del último cuadro (relleno de estelas incluido). */
  interpUltimoCuadro: number
  interpTotal: number
  bloquesAnexados: number
  podas: number
  /** Bytes aproximados subidos a GPU (acumulado). */
  bytesSubidos: number
  /** Lo fija el núcleo: 'cargando' | 'vivo'. */
  estado: string
  /** Lo fija el núcleo: `true` si el reloj pide más de lo que hay (como YouTube). */
  hambre: boolean
}

function percentil(ordenados: number[], q: number): number {
  if (ordenados.length === 0) return 0
  const i = Math.min(ordenados.length - 1, Math.floor(q * ordenados.length))
  return ordenados[i]
}

export class Medidor {
  private readonly anillo = new Float32Array(VENTANA_MEDICION)
  private escritos = 0
  private cuadros = 0
  private parones = 0
  private interpActual = 0
  private interpUltimo = 0
  private interpTotal = 0
  private bloquesAnexados = 0
  private podas = 0
  private bytesSubidos = 0
  private ultimoMs = 0
  estado = 'cargando'
  hambre = false

  /** Registra el trabajo en ms de un cuadro (llamar una vez por cuadro). */
  marco(dtMs: number): void {
    if (!(dtMs >= 0) || !Number.isFinite(dtMs)) return
    this.anillo[this.escritos % VENTANA_MEDICION] = dtMs
    this.escritos++
    this.cuadros++
    this.ultimoMs = dtMs
    if (dtMs > UMBRAL_PARON_MS) this.parones++
    // Se congela lo acumulado por este cuadro; el siguiente empieza en 0.
    // `marco` se llama al FINAL del cuadro, así que lo sumado antes queda.
    this.interpUltimo = this.interpActual
    this.interpActual = 0
  }

  sumarInterpolaciones(n: number): void {
    if (!(n > 0)) return
    this.interpActual += n
    this.interpTotal += n
  }

  sumarAnexados(n: number): void {
    if (n > 0) this.bloquesAnexados += n
  }

  sumarPoda(): void {
    this.podas++
  }

  sumarBytes(n: number): void {
    if (n > 0) this.bytesSubidos += n
  }

  foto(): FotoMedicion {
    const m = Math.min(this.escritos, VENTANA_MEDICION)
    const copia: number[] = []
    for (let i = 0; i < m; i++) copia.push(this.anillo[i])
    copia.sort((a, b) => a - b)
    return {
      cuadros: this.cuadros,
      msUltimo: this.ultimoMs,
      msP50: percentil(copia, 0.5),
      msP95: percentil(copia, 0.95),
      msMax: copia.length > 0 ? copia[copia.length - 1] : 0,
      parones: this.parones,
      interpUltimoCuadro: this.interpUltimo,
      interpTotal: this.interpTotal,
      bloquesAnexados: this.bloquesAnexados,
      podas: this.podas,
      bytesSubidos: this.bytesSubidos,
      estado: this.estado,
      hambre: this.hambre,
    }
  }
}

/** Una línea para el overlay de la barra (`#medicion`). */
export function textoMedicion(f: FotoMedicion): string {
  const kb = f.bytesSubidos > 0 ? ` · ↑${(f.bytesSubidos / 1024).toFixed(0)}KB` : ''
  const espera = f.hambre ? ' · buffering…' : ''
  return `${f.estado}${espera} · ${f.msUltimo.toFixed(1)}ms (p95 ${f.msP95.toFixed(1)}) · parones ${f.parones} · interp/f ${f.interpUltimoCuadro}${kb}`
}
