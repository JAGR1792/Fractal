/**
 * Estelas y estrellas puras (sin GPU): lógica testeable del render.
 *
 * Una estela es un camino CONTINUO muestreado en **tiempo simulado** con paso
 * constante. Ese detalle es la clave: el render se dibuja a 60 fotogramas por
 * segundo de PARED, pero el reloj avanza en tiempo SIM a `RITMO_SIM` (unos
 * 120000 s de simulación por segundo de pared). Registrar un punto por
 * fotograma haría que cada arista cubriera un trozo enorme de órbita a alta
 * velocidad, y se vería una **cuerda recta** en vez de la curva recorrida.
 *
 * Con paso fijo en tiempo sim la geometría de la estela no depende de la
 * velocidad de reproducción: siempre es la misma curva, reconstruida con la
 * misma fidelidad. Además encaja con los bloques del servidor, que ya vienen
 * muestreados uniformemente en tiempo sim.
 *
 * La estela se rompe por:
 * 1. Época distinta — otra sesión, otra física, otro marco.
 * 2. Hueco en el stream — el reloj avanzó más de un paso sin datos intermedios.
 * 3. Salto espacial imposible — teletransporte frente al movimiento reciente.
 *
 * Las estrellas son puntos fijos en un cascarón lejano.
 */

/**
 * Un punto de estela: posición MUNDO, tiempo sim (s), época y tiempo de pared
 * (ms). El tiempo sim fija la separación entre puntos; el de pared solo se usa
 * para descartar huecos si alguna vez se graba con relojes distintos.
 */
export type PuntoEstela = [number, number, number, number, number, number]

/**
 * Una estela: anillo de posiciones recientes de un cuerpo (libro §3.3.7).
 *
 * Cola circular fija: `ranura` se preasigna una vez con capacidad `maximo` y
 * jamás se realoja; `inicio` marca el punto más viejo y `cantidad` los vivos.
 * Empujar es O(1) sin `shift()` (que era un memmove O(n) por punto: a alta
 * velocidad se rellenan cientos de puntos por cuadro y el frame se atraganta).
 * Las tuplas también se reutilizan: empujar escribe en el slot, no crea.
 */
export interface Estela {
  ranura: PuntoEstela[]
  inicio: number
  cantidad: number
  maximo: number
}

/**
 * Paso de muestreo de la estela en tiempo sim, en segundos.
 *
 * No es arbitrario: los bloques del servidor vienen muestreados cada
 * `dt × cada_n` (12 000 s con los valores por defecto). La estela interpola con
 * Hermite cúbica, que entre dos nodos reconstruye la cúbica exacta del tramo;
 * muestrear más fino que los nodos **no añade información** — solo dibuja la
 * misma curva con más vértices. Muestrear más grueso sí pierde la curva.
 * Por eso el paso es el de los nodos: fidelidad máxima sin gastar de más.
 */
export const PASO_ESTELA_SIM = 12000

/** Crea una estela vacía con capacidad `maximo` (slots preasignados una vez). */
export function crearEstela(maximo: number): Estela {
  if (!(maximo >= 2)) throw new Error('la estela necesita capacidad para al menos 2 puntos')
  const ranura: PuntoEstela[] = []
  for (let i = 0; i < maximo; i++) ranura.push([0, 0, 0, 0, 0, 0])
  return { ranura, inicio: 0, cantidad: 0, maximo }
}

/**
 * Empuja una posición en O(1): escribe en el slot que toca y avanza el
 * inicio si el anillo estaba lleno. Sin allocs, sin memmove. Uso directo en
 * tests y como primitiva de `RegistroEstela`.
 */
export function empujarEstela(
  e: Estela,
  p: [number, number, number],
  tSim: number,
  epoca = 0,
  tPared = tSim,
): Estela {
  let destino: PuntoEstela
  if (e.cantidad < e.maximo) {
    destino = e.ranura[(e.inicio + e.cantidad) % e.maximo]
    e.cantidad++
  } else {
    destino = e.ranura[e.inicio]
    e.inicio = (e.inicio + 1) % e.maximo
  }
  destino[0] = p[0]
  destino[1] = p[1]
  destino[2] = p[2]
  destino[3] = tSim
  destino[4] = epoca
  destino[5] = tPared
  return e
}

/** Punto lógico `k` (0 = más viejo). Sin copiar. */
export function puntoEn(e: Estela, k: number): PuntoEstela {
  return e.ranura[(e.inicio + k) % e.maximo]
}

/**
 * Copia en orden viejo→nuevo. Solo para tests y debug: el render itera con
 * `puntoEn` sin copiar nada.
 */
export function puntosEnOrden(e: Estela): PuntoEstela[] {
  const salida: PuntoEstela[] = []
  for (let k = 0; k < e.cantidad; k++) salida.push(puntoEn(e, k))
  return salida
}

/** Vacía la estela sin soltar la memoria (bifurcación con limpieza). */
export function limpiarEstela(e: Estela): void {
  e.inicio = 0
  e.cantidad = 0
}

/**
 * Registra la estela de un cuerpo con paso fijo en tiempo sim.
 *
 * El render lo llama una vez por fotograma: si el reloj avanzó más de un paso
 * (velocidad alta), rellena los pasos intermedios para no dejar cuerdas; si el
 * reloj no llegó a avanzar un paso entero, no graba nada.
 */
export class RegistroEstela {
  private ultimo: number | null = null
  private readonly paso: number
  private readonly maximo: number
  /**
   * Tope de puntos que se rellenan de una sola vez. Es una red de seguridad
   * para un salto absurdo, NO un límite de trabajo normal.
   *
   * Medido contra la API viva: al recuperarse de un bloqueo del cómputo el
   * reloj da saltos de hasta ~168 pasos (200x) y de ~200 pasos (1000x). Con un
   * tope ajustado el registro se rendía y reanclaba, y ese hueco partía la
   * estela justo en el momento más visible. Rellenar es lineal y barato (600
   * interpolaciones son microsegundos), así que el tope se pone holgado: cuatro
   * vueltas completas al anillo. Más allá de eso sí conviene reanclar, porque
   * rellenar sin límite ante un tiempo corrupto sí podría colgar el fotograma.
   */
  private readonly rellenoMaximo: number

  constructor(paso: number, maximo: number) {
    if (!(paso > 0)) throw new Error('el paso de la estela debe ser positivo')
    this.paso = paso
    this.maximo = maximo
    this.rellenoMaximo = Math.max(4, maximo * 4)
  }

  /**
   * Avanza el registro hasta `tSim` con la posición que le corresponda.
   * `posicion(t)` la da el render (interpolando los bloques en ese instante).
   * Devuelve cuántos puntos grabó.
   */
  registrar(
    estela: Estela,
    tSim: number,
    epoca: number,
    posicion: (t: number) => [number, number, number] | null,
  ): number {
    if (!Number.isFinite(tSim)) return 0
    // La primera llamada solo fija la referencia: no se graba un punto hacia
    // atrás. Así el primer punto de la estela coincide con el reloj actual.
    if (this.ultimo === null) {
      this.ultimo = tSim
      return 0
    }
    // El tiempo sim no debería retroceder; si lo hace, se reancla.
    if (tSim < this.ultimo) this.ultimo = tSim - this.paso

    let pasos = Math.floor((tSim - this.ultimo) / this.paso)
    if (pasos <= 0) return 0
    if (pasos > this.rellenoMaximo) {
      // Hueco enorme: reanclar en el instante presente (sin bucle gigante).
      this.ultimo = tSim
      pasos = 0
    }

    let grabados = 0
    for (let k = 1; k <= pasos; k++) {
      const t = this.ultimo + k * this.paso
      const p = posicion(t)
      if (!p) continue
      empujarEstela(estela, p, t, epoca, t)
      grabados++
    }
    if (pasos > 0) this.ultimo += pasos * this.paso
    return grabados
  }

  /** Olvida la última marca (al cambiar de fuente). */
  reiniciar(): void {
    this.ultimo = null
  }
}

/**
 * Estimador robusto del paso típico de un cuerpo, por cuerpo.
 *
 * Guarda las últimas distancias entre fotogramas y decide si un paso nuevo es
 * plausible comparándolo con la mediana. La mediana es robusta a valores
 * extremos, así que un teletransporte no la contamina: seguimos detectando el
 * siguiente. Un umbral absoluto no serviría: el paso legítimo depende de la
 * escala de la escena, de `dt`, de la velocidad y del zoom.
 */
export class RastreadorPasos {
  private readonly ventana: number[] = []
  private readonly capacidad: number

  constructor(capacidad = 32) {
    this.capacidad = capacidad
  }

  /** Mediana de los pasos recientes (0 si aún no hay historia). */
  private mediana(): number {
    if (this.ventana.length === 0) return 0
    const orden = [...this.ventana].sort((a, b) => a - b)
    const medio = orden.length >> 1
    return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2
  }

  /**
   * Olvida la historia: el paso típico del vuelo anterior no dice nada del
   * nuevo. Se llama al cambiar de época; sin esto el trazo quedaría cortado
   * para siempre, porque la mediana vieja hace imposible todo paso nuevo.
   */
  olvidar(): void {
    this.ventana.length = 0
  }

  /**
   * Registra un paso y dice si es plausible (no rompe la estela).
   * Sin historia suficiente se acepta: preferimos dibujar de más al arrancar
   * que cortar el trazo legítimo de los primeros fotogramas.
   *
   * Un paso rechazado NO entra en la ventana: si entrara, un valor enorme
   * subiría la mediana y enmascararía el siguiente salto.
   */
  aceptar(distancia: number): boolean {
    const previa = this.mediana()
    const hayHistoria = this.ventana.length >= 4
    // Margen amplio: un cuerpo en órbita acelera de verdad (perihelio), y eso
    // no puede partir la estela.
    const plausible = !hayHistoria || distancia <= Math.max(previa * 200, 1e-9)
    if (plausible) {
      this.ventana.push(distancia)
      if (this.ventana.length > this.capacidad) this.ventana.shift()
    }
    return plausible
  }
}

/** Vértice de línea ULTRA: [x,y,z, r,g,b, alpha]. */
export type VerticeLinea = [number, number, number, number, number, number, number]

/**
 * Convierte una estela en segmentos para line-list: del más viejo (alpha 0)
 * al más nuevo (alpha 1), con el color del cuerpo. Devuelve dos vértices por
 * segmento dibujable; los empalmes cortados no emiten geometría.
 *
 * Corta el segmento cuando:
 * - el salto de tiempo sim supera `paso` (hueco: faltan muestras en medio),
 * - cambia la época (otra sesión / otra física / otro marco), o
 * - el paso espacial es imposible frente al movimiento reciente del cuerpo.
 *
 * `paso` es el espaciado con que se muestreó la estela. Es determinista, así
 * que una separación mayor delata un hueco real sin depender de temporizadores
 * de pared.
 *
 * `destino` es el scratch del render: si se da, se ANEXA sin crear (cero
 * allocs en caliente; el llamador lo vacía con `length = 0`); si no, se
 * devuelve un arreglo nuevo.
 */
export function aSegmentos(
  e: Estela,
  color: [number, number, number],
  paso = 0,
  destino?: number[],
): number[] {
  const salida = destino ?? []
  const n = e.cantidad
  if (n < 2) return salida

  const rastreador = new RastreadorPasos()
  let epocaActual = puntoEn(e, 0)[4]
  // Tolerancia del 50% sobre el paso: absorbe el redondeo en coma flotante de
  // las marcas de tiempo sin dejar pasar un hueco de verdad.
  const saltoMaxS = paso > 0 ? paso * 1.5 : 0

  for (let i = 0; i + 1 < n; i++) {
    const p = puntoEn(e, i)
    const q = puntoEn(e, i + 1)

    // Época: dos tramos de vuelos distintos no son vecinos, aunque lo parezcan.
    if (q[4] !== epocaActual) {
      epocaActual = q[4]
      rastreador.olvidar()
      continue
    }
    // Hueco en el stream: entre ambos puntos faltan muestras.
    if (saltoMaxS > 0 && q[3] - p[3] > saltoMaxS) {
      rastreador.olvidar()
      continue
    }

    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const dz = q[2] - p[2]
    if (!rastreador.aceptar(Math.hypot(dx, dy, dz))) continue

    const a0 = i / n
    const a1 = (i + 1) / n
    salida.push(p[0], p[1], p[2], color[0], color[1], color[2], a0)
    salida.push(q[0], q[1], q[2], color[0], color[1], color[2], a1)
  }
  return salida
}

/**
 * Scratch de `Float32Array` reutilizado para subir vértices a GPU.
 *
 * `writeBuffer`/`bufferData` copian al momento, así que la misma vista sirve
 * para draws secuenciales. Solo crece (nunca en caliente estable): la
 * conversión `number[] → Float32Array` por cuadro y por cuerpo era un alloc
 * grande en cada frame con estelas visibles.
 */
export class RaspaFlotantes {
  private buf = new Float32Array(0)

  /** Vista reutilizada de longitud `n`. */
  vista(n: number): Float32Array {
    if (this.buf.length < n) this.buf = new Float32Array(Math.max(n, 64))
    return this.buf.subarray(0, n)
  }
}

/** Generador determinista (mulberry32) para estrellas estables entre cargas. */
export function generarEstrellas(cuantas: number, semilla: number, radio: number): Float32Array {
  let s = semilla >>> 0
  const azar = (): number => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const salida = new Float32Array(cuantas * 3)
  for (let i = 0; i < cuantas; i++) {
    // Dirección uniforme en la esfera × radio del cascarón.
    const u = azar() * 2 - 1
    const phi = azar() * Math.PI * 2
    const r = Math.sqrt(1 - u * u)
    salida[i * 3] = r * Math.cos(phi) * radio
    salida[i * 3 + 1] = Math.abs(u) * radio * (azar() > 0.15 ? 1 : -1)
    salida[i * 3 + 2] = r * Math.sin(phi) * radio
  }
  return salida
}
