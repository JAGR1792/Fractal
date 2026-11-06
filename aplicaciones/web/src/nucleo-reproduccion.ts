/**
 * Núcleo común de reproducción (experimento `experimento_nuevo_render`).
 *
 * ULTRA y LITE calculaban lo mismo por separado (~300 líneas duplicadas) con
 * fórmulas que divergían en silencio (demo `0.002` vs `0.004`, `10/r` vs
 * `12/r`, relojes que retroceden en un perfil y no en el otro). Este módulo
 * es el único dueño del reloj, la fuente, el ritmo y los centros: los
 * backends solo dibujan lo que el núcleo dice, con los mismos números.
 *
 * Reglas del núcleo:
 * - Cero allocs en el camino caliente: `centros` y el scratch de posiciones
 *   se preasignan una vez y se reutilizan. Quien los lea no debe retenerlos.
 * - Sin demo falsa ni fundidos: sin fuente el estado es `cargando` y los
 *   centros quedan congelados en el diorama inicial (honesto, sin saltos).
 * - El reloj nunca retrocede (`max`, como ya hacía ULTRA; LITE retrocedía).
 * - Todo lo medible pasa por el `Medidor` (Fase 0: medir antes de optimizar).
 */
import { avanzar, bloqueActual, crearFrontera, reanclar, ritmoParaPeriodo, techoDe, type Frontera } from './frontera'
import { interpolarBloque } from './binario'
import type { FuenteEstados } from './api'
import { Medidor, type FotoMedicion } from './medicion'

/** Sin fuente válida no hay nada que mover: diorama congelado + overlay. */
export type EstadoFuente = 'cargando' | 'vivo'

export class NucleoReproduccion {
  private readonly fro: Frontera
  private ritmo: number
  private escala: number
  /** Reloj mostrado: monótono por construcción (nunca retrocede). */
  private mostrado = 0
  /** Buenos días: cuerpos que dibujan los backends. */
  readonly n: number
  /**
   * Centros mundo reutilizados `[x,y,z,0 × N]`, misma convención que
   * `normalizarPosiciones`: `[x*e, z*e, y*e]`. NO retener: se sobrescribe.
   */
  readonly centros: Float32Array
  private readonly posScratch: number[]
  /** Medición abierta para los backends (marco, bytes) y el overlay. */
  readonly medidor = new Medidor()

  /**
   * @param nCuerpos cuerpos del escenario.
   * @param periodoSim período orbital de referencia o `null` (ritmo por defecto).
   * @param fuente fuente inicial o `null` (arranca `cargando`).
   * @param semilla diorama inicial `[x,y,z,0 × N]` (posiciones del escenario).
   */
  constructor(nCuerpos: number, periodoSim: number | null, fuente: FuenteEstados | null = null, semilla?: Float32Array) {
    if (!(nCuerpos >= 1)) throw new Error('el núcleo necesita al menos un cuerpo')
    this.n = nCuerpos
    this.ritmo = ritmoParaPeriodo(periodoSim ?? Number.NaN)
    this.escala = fuente?.escala ?? 1
    this.centros = new Float32Array(Math.max(nCuerpos * 4, 4))
    if (semilla && semilla.length >= nCuerpos * 4) this.centros.set(semilla.subarray(0, nCuerpos * 4))
    this.posScratch = new Array<number>(Math.max(nCuerpos * 3, 3)).fill(0)
    // COPIA, no referencia: el dueño del arreglo (principal) también lo muta
    // con poll/prune; compartirlo duplicaba y sobrepodaba (saltos rectos).
    this.fro = crearFrontera(fuente && fuente.bloques.length >= 2 ? [...fuente.bloques] : null)
    if (this.fro.bloques) {
      this.escribirCentros(this.fro.tiempo)
      this.mostrado = this.fro.tiempo
    }
    this.medidor.estado = this.estado
  }

  get estado(): EstadoFuente {
    return this.fro.bloques !== null && this.fro.bloques.length >= 2 ? 'vivo' : 'cargando'
  }

  /** Segundos sim del reloj de reproducción (el de la frontera). */
  get tiempo(): number {
    return this.fro.tiempo
  }

  fijarRitmo(r: number): void {
    if (r > 0 && Number.isFinite(r)) this.ritmo = r
  }

  leerRitmo(): number {
    return this.ritmo
  }

  /** Cambia la fuente (bifurcación o primera conexión). Sin fundidos. */
  fijarFuente(f: FuenteEstados | null): void {
    reanclar(this.fro, f && f.bloques.length >= 2 ? [...f.bloques] : null)
    this.escala = f?.escala ?? 1
    if (this.fro.bloques) {
      this.escribirCentros(this.fro.tiempo)
      // Monótono también al bifurcar: la sesión nueva arranca en su t≈0 pero
      // el reloj mostrado no retrocede (igual que antes con `spinSim`).
      if (this.fro.tiempo > this.mostrado) this.mostrado = this.fro.tiempo
    }
    this.medidor.estado = this.estado
  }

  /** Añade bloques del stream. Devuelve cuántos entraron. */
  anexarBloques(nuevos: Float32Array[]): number {
    if (!this.fro.bloques || nuevos.length === 0) return 0
    for (const b of nuevos) this.fro.bloques.push(b)
    this.medidor.sumarAnexados(nuevos.length)
    this.medidor.estado = this.estado
    return nuevos.length
  }

  /** Poda bloques con t < `mantenerDesde`. Devuelve cuántos salieron. */
  podar(mantenerDesde: number): number {
    const b = this.fro.bloques
    if (!b || b.length === 0) return 0
    let cortar = 0
    while (cortar < b.length - 2 && b[cortar][0] < mantenerDesde) cortar++
    if (cortar > 0) {
      b.splice(0, cortar)
      this.medidor.sumarPoda()
    }
    return cortar
  }

  /**
   * Avanza un cuadro: persigue la frontera a ritmo fijo y espera en el borde.
   * Escribe `this.centros`. En `cargando` (o pausado) no toca nada: el
   * diorama queda congelado, sin círculos falsos que luego saltarían.
   *
   * El avance por cuadro nunca supera lo pedido (`dt·velocidad·ritmo`): no
   * hay saltos de puesta al día, solo espera en el borde. Por eso el parón
   * de alta velocidad es inanición pura (como YouTube), no pico de cálculo.
   * Si pedimos avance y llega menos de la mitad porque el borde nos frenó,
   * se marca `hambre` y el overlay lo dice.
   */
  avanzarCuadro(dtParedSeg: number, velocidad: number, pausado: boolean): EstadoFuente {
    if (this.estado !== 'vivo') {
      this.medidor.hambre = false
      return 'cargando'
    }
    const pedido = dtParedSeg * velocidad * this.ritmo
    const previo = this.fro.tiempo
    const t = avanzar(this.fro, dtParedSeg, velocidad, this.ritmo, pausado)
    // Monótono aunque una poda reancle por detrás: retroceder el reloj es
    // teletransportar los cuerpos.
    if (t > this.mostrado) this.mostrado = t
    this.escribirCentros(t)
    // Hambre: hay demanda real (no pausa, velocidad > 0) pero el borde nos
    // dejó con menos de la mitad de lo pedido.
    const techo = techoDe(this.fro)
    this.medidor.hambre =
      !pausado && pedido > 0 && techo > -Infinity && t - previo < pedido * 0.5 && t >= techo
    return 'vivo'
  }

  /**
   * Escribe los centros interpolados al instante `t` en `this.centros`.
   * Una sola Hermite por cuadro (la del instante actual): el registro de
   * estelas usa `posicionEn` y cuenta aparte.
   */
  private escribirCentros(t: number): void {
    const bl = this.fro.bloques
    if (!bl) return
    const b = interpolarBloque(bl, bl.length - 1, t)
    this.medidor.sumarInterpolaciones(1)
    if (!b) return
    const e = this.escala
    for (let i = 0; i < this.n; i++) {
      const o = 1 + i * 6
      this.centros[i * 4] = b[o] * e
      this.centros[i * 4 + 1] = b[o + 2] * e
      this.centros[i * 4 + 2] = b[o + 1] * e
    }
  }

  /**
   * Posición mundo del cuerpo `i` al instante `t`, en `salida[0..2]`.
   * Para el registro de estelas (mismo mapeo, mismos números que el dibujo).
   * `false` si no hay fuente.
   */
  posicionEn(t: number, i: number, salida: number[]): boolean {
    const bl = this.fro.bloques
    if (!bl || i < 0 || i >= this.n) return false
    const b = interpolarBloque(bl, bl.length - 1, t)
    this.medidor.sumarInterpolaciones(1)
    if (!b) return false
    const o = 1 + i * 6
    const e = this.escala
    salida[0] = b[o] * e
    salida[1] = b[o + 2] * e
    salida[2] = b[o + 1] * e
    return true
  }

  /**
   * Segundos simulados mostrados (para el reloj de la barra).
   * `NaN` en `cargando`: la barra pinta '—' en vez de inventar tiempo.
   */
  leerTiempo(): number {
    return this.estado === 'vivo' ? this.mostrado : Number.NaN
  }

  leerBloqueActual(): Float32Array | null {
    return bloqueActual(this.fro)
  }

  /**
   * Posiciones SI actuales `[x,y,z × N]` para bifurcar sin saltos.
   * Referencia reutilizada: NO retener. `null` si la escala no es válida.
   */
  leerPosicionesSI(escalaMundo: number): number[] | null {
    const e = this.fro.bloques ? this.escala : escalaMundo
    if (!(e > 0)) return null
    for (let i = 0; i < this.n; i++) {
      this.posScratch[i * 3] = this.centros[i * 4] / e
      this.posScratch[i * 3 + 1] = this.centros[i * 4 + 2] / e
      this.posScratch[i * 3 + 2] = this.centros[i * 4 + 1] / e
    }
    return this.posScratch
  }

  medir(): FotoMedicion {
    this.medidor.estado = this.estado
    return this.medidor.foto()
  }
}
