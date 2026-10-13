/**
 * Escenario Fractal: tipos + carga + escala visual.
 *
 * El motor usa SI (m, kg, s). La vista usa escala logarítmica/exagerada
 * porque a escala real no se ve nada (la Luna sería 1 píxel).
 */

export interface Vec3Tupla extends Array<number> {
  0: number
  1: number
  2: number
}

export interface CuerpoEscenario {
  id: string
  nombre: string
  masa: number
  radio: number
  posicion: [number, number, number]
  velocidad: [number, number, number]
  /**
   * Período de rotación propia en segundos sim. Negativo = retrógrado
   * (Venus y Urano giran al revés que su órbita). Si falta, se usa el del
   * catálogo `ROTACION_POR_ID`.
   */
  rotacion?: number
}

export interface Escenario {
  id: string
  nombre: string
  descripcion: string
  cuerpos: CuerpoEscenario[]
  parametros?: { dt?: number; pasos?: number; nota?: string }
}

export interface CuerpoVisual extends CuerpoEscenario {
  /** Radio en mundo para dibujo (exagerado). */
  radioVisual: number
  /** Color base RGB 0..1 para ULTRA/LITE. */
  color: [number, number, number]
}

const COLORES_POR_ID: Record<string, [number, number, number]> = {
  sol: [1.0, 0.85, 0.2],
  mercurio: [0.7, 0.7, 0.72],
  venus: [0.95, 0.75, 0.4],
  tierra: [0.2, 0.45, 0.95],
  luna: [0.8, 0.8, 0.85],
  marte: [0.9, 0.35, 0.2],
  jupiter: [0.9, 0.7, 0.5],
  saturno: [0.9, 0.82, 0.6],
  urano: [0.5, 0.85, 0.9],
  neptuno: [0.25, 0.4, 0.95],
}

/**
 * Período de rotación propia real en segundos sim (día sideral).
 *
 * Antes el shader daba 24 h a todo lo que no fuera Sol, Tierra o Luna, así que
 * Venus (243 días) y Júpiter (9,9 h) giraban igual. Los negativos son
 * retrógrados: Venus y Urano giran al revés que su órbita.
 *
 * Fuente: día sideral de cada cuerpo (NASA).
 */
export const ROTACION_POR_ID: Record<string, number> = {
  sol: 25.38 * 86400, // 25,38 días (rotación del ecuador solar)
  mercurio: 58.646 * 86400,
  venus: -243.025 * 86400, // retrógrado
  tierra: 86164.1, // 23 h 56 min 4 s
  luna: 2360591, // acoplada por marea al período orbital
  marte: 88642.7, // 24 h 37 min
  jupiter: 35730, // 9 h 55 min
  saturno: 38052, // 10 h 34 min
  urano: -62064, // retrógrado (eje muy inclinado)
  neptuno: 57996, // 16 h 6 min
}

/** Período de rotación de un cuerpo: el del escenario, el del catálogo o 1 día. */
export function periodoRotacionDe(c: { id: string; rotacion?: number }): number {
  if (typeof c.rotacion === 'number' && Number.isFinite(c.rotacion) && c.rotacion !== 0) {
    return c.rotacion
  }
  return ROTACION_POR_ID[c.id.toLowerCase()] ?? 86400
}

/**
 * Factor de la rotación propia: segundos de rotación por segundo del reloj de
 * rotación. El reloj de rotación es de PARED, no simulado (ver
 * `anguloRotacion`), así que esto no es una escala física sino de presentación.
 *
 * 20000 deja el día terrestre en ~4,3 s de reloj: rápido para percibirse y
 * lento para no parpadear. Las proporciones reales se conservan, así que
 * Júpiter gira ~2,4 veces más rápido que la Tierra y Venus tarda 243 días.
 */
export const VELOCIDAD_ROTACION = 20000

/**
 * Ángulo de rotación propia (radianes) para un tiempo de rotación dado.
 *
 * `relojRotacion` es tiempo de PARED escalado, no tiempo simulado: girar con el
 * tiempo sim es imposible de ver. Medido con el ritmo de reproducción del
 * Sistema Solar, la Tierra daría 87,5° por fotograma y Júpiter 211°, es decir
 * giros invertidos o congelados por aliasing. La causa es que un día (8,6e4 s)
 * es 2,4e-6 de un año (3,2e7 s): ambas escalas no caben en la misma
 * representación. Las órbitas sí van en tiempo sim (0,99°/fotograma).
 *
 * Se calcula en f64 y se devuelve acotado a [0, 2π) para que el argumento del
 * coseno no pierda precisión en f32.
 */
export function anguloRotacion(c: { id: string; rotacion?: number }, relojRotacion: number): number {
  const periodo = periodoRotacionDe(c)
  const tau = 2 * Math.PI
  const fase = (relojRotacion / (periodo / VELOCIDAD_ROTACION)) % 1
  return fase < 0 ? (fase + 1) * tau : fase * tau
}

const COLORES_FALLBACK: Array<[number, number, number]> = [
  [0.7, 0.7, 0.72],
  [0.95, 0.75, 0.4],
  [0.9, 0.35, 0.2],
  [0.5, 0.85, 0.9],
]

/**
 * Tipo visual de un cuerpo para sombreado.
 * 0 = sol (emissive + textura), 1 = tierra, 2 = luna, 3 = genérico.
 * Los tipos 1..3 con slot de textura usan la imagen; sin slot, procedural.
 */
export function tipoPlaneta(id: string): number {
  const clave = id.toLowerCase()
  if (clave === 'sol') return 0
  if (clave === 'tierra') return 1
  if (clave === 'luna') return 2
  return 3
}

/** Entrada del catálogo: URL local + slot de textura en los shaders. */
export interface EntradaTextura {
  url: string
  slot: number
}

/**
 * Catálogo de texturas vendorizadas para el sandbox.
 * Clave = id del cuerpo en minúsculas (ver `public/texturas/LEEME.md`).
 * Sin hotlinks: todo en local para colegios sin internet.
 * Los ids sin entrada usan sombreado procedural.
 */
export const TEXTURAS_POR_ID: Record<string, EntradaTextura> = {
  tierra: { url: '/texturas/tierra.jpg', slot: 0 },
  luna: { url: '/texturas/luna.jpg', slot: 1 },
  mercurio: { url: '/texturas/mercurio.jpg', slot: 2 },
  venus: { url: '/texturas/venus.jpg', slot: 3 },
  marte: { url: '/texturas/marte.jpg', slot: 4 },
  jupiter: { url: '/texturas/jupiter.jpg', slot: 5 },
  saturno: { url: '/texturas/saturno.jpg', slot: 6 },
  urano: { url: '/texturas/urano.jpg', slot: 7 },
  neptuno: { url: '/texturas/neptuno.jpg', slot: 8 },
  sol: { url: '/texturas/sol.jpg', slot: 9 },
}

/** Cuántas texturas enlazan los shaders (slots 0..N-1). */
export const NUM_TEXTURAS = 10

/** URL local de la textura de un cuerpo, o `null` si usa procedural. */
export function urlTextura(id: string): string | null {
  return TEXTURAS_POR_ID[id.toLowerCase()]?.url ?? null
}

/** Slot de textura de un cuerpo, o -1 si usa procedural. */
export function slotTextura(id: string): number {
  return TEXTURAS_POR_ID[id.toLowerCase()]?.slot ?? -1
}

/**
 * Fracción del radio de la órbita más interna que puede ocupar el cuerpo más
 * grande. Es la restricción que hace visible el sistema: si el cuerpo mayor
 * pasa de aquí, se traga las órbitas interiores.
 */
export const MAX_RADIO_VISUAL_RELATIVO = 0.35

/**
 * Altura de referencia del viewport, en unidades de mundo por unidad de
 * pantalla, para razonar en píxeles (900 es un viewport típico).
 */
export const VIEWPORT_REFERENCIA = 900

/**
 * Fracción mínima del alto de pantalla que ocupa cualquier cuerpo.
 *
 * Es la condición que hace útil el render: con las ocho órbitas en cuadro, el
 * rango físico Sol→Mercurio es 285:1 y una fracción fija del radio de
 * referencia dejaba a los interiores en 0,3 píxeles (invisibles). Fijando el
 * mínimo **en píxeles** (0,0018 del alto ≈ 1,6 px en 900), todos los cuerpos se
 * ven como puntos.
 *
 * El valor es un compromiso medido: el Sol, con las ocho órbitas en cuadro,
 * ocupa ~4 px, así que un suelo más alto (3 px) igualaba todos los planetas al
 * Sol y borraba la jerarquía; uno más bajo (0,3 px) los hacía invisibles.
 */
export const MIN_FRACCION_PANTALLA = 0.0018

/**
 * Convierte radios físicos (m) a radios visuales (mundo).
 *
 * Los radios se escalan **relativos al sistema**, no en absoluto. Ese era el
 * defecto: con una fórmula absoluta, en el Sistema Solar el Sol salía con radio
 * 5,02 unidades mientras Mercurio orbita a 0,62, así que Mercurio, Venus, la
 * Tierra y Marte quedaban **dentro del Sol** y solo se veían los planetas
 * exteriores (justo los más lentos: Neptuno recorre 0,001° por fotograma). El
 * sistema parecía congelado. En Tierra-Luna no se notaba porque los radios
 * físicos son parecidos.
 *
 * Pasos, en este orden:
 * 1. Extensión del sistema y distancia de cámara (encuadra todo).
 * 2. Compresión logarítmica del radio físico, con tope: nadie tapa a su vecino.
 * 3. Suelo en píxeles: nadie queda invisible.
 */
export function aVisual(escenario: Escenario): CuerpoVisual[] {
  const cuerpos = escenario.cuerpos
  const escala = escalaMundoDe(cuerpos)

  // Separación más corta del sistema: fija el radio de referencia.
  let separacionMinima = Infinity
  for (let i = 0; i < cuerpos.length; i++) {
    for (let j = i + 1; j < cuerpos.length; j++) {
      const d = Math.hypot(
        cuerpos[j].posicion[0] - cuerpos[i].posicion[0],
        cuerpos[j].posicion[1] - cuerpos[i].posicion[1],
        cuerpos[j].posicion[2] - cuerpos[i].posicion[2],
      )
      if (d > 0 && d < separacionMinima) separacionMinima = d
    }
  }
  const separacionMundo = Number.isFinite(separacionMinima) ? separacionMinima * escala : 40

  // Extensión del sistema en unidades mundo y semialtura visible con la cámara
  // que lo encuadra. De aquí sale el suelo en píxeles.
  let extension = 0
  for (const c of cuerpos) {
    const r = Math.hypot(c.posicion[0], c.posicion[1], c.posicion[2]) * escala
    if (r > extension) extension = r
  }
  const semialtura = extension > 0
    ? extension * MARGEN_ENCUADRE
    : 20 * Math.tan(((FOV_VERTICAL_GRADOS * Math.PI) / 180) / 2)

  const radioVisualMax = separacionMundo * MAX_RADIO_VISUAL_RELATIVO
  const radioFisicoMax = Math.max(...cuerpos.map((c) => Math.max(c.radio, 1)))
  const radioVisualMin = semialtura * MIN_FRACCION_PANTALLA

  return cuerpos.map((c, i) => {
    const proporcion = Math.log10(1 + 9 * (Math.max(c.radio, 1) / radioFisicoMax))
    let radioVisual = radioVisualMax * proporcion

    // Tope: que quepa antes del cuerpo más próximo (nadie tapa a nadie).
    let vecinoMasProximo = Infinity
    for (let j = 0; j < cuerpos.length; j++) {
      if (j === i) continue
      const d = Math.hypot(
        cuerpos[j].posicion[0] - c.posicion[0],
        cuerpos[j].posicion[1] - c.posicion[1],
        cuerpos[j].posicion[2] - c.posicion[2],
      )
      if (d > 0 && d < vecinoMasProximo) vecinoMasProximo = d
    }
    if (Number.isFinite(vecinoMasProximo)) {
      radioVisual = Math.min(radioVisual, vecinoMasProximo * escala * MAX_RADIO_VISUAL_RELATIVO)
    }
    // Suelo en píxeles: que se vea. Se aplica después del tope porque un punto
    // diminuto no tapa nada y un tope excesivo sí.
    radioVisual = Math.max(radioVisual, radioVisualMin)

    const color = COLORES_POR_ID[c.id.toLowerCase()] ?? COLORES_FALLBACK[i % COLORES_FALLBACK.length]
    return { ...c, radioVisual, color }
  })
}

/** Radio máximo dibujado, para situar la cámara. */
export function radioVisualMayor(visuales: CuerpoVisual[]): number {
  let max = 0
  for (const c of visuales) if (c.radioVisual > max) max = c.radioVisual
  return max
}

/** Campo de visión vertical de la cámara, en grados (ver `matrizProyeccion`). */
export const FOV_VERTICAL_GRADOS = 50

/** Margen del encuadre: 15% de aire alrededor de la órbita más externa. */
export const MARGEN_ENCUADRE = 1.15

/**
 * Distancia de cámara que **encuadra el sistema entero**: la órbita más externa
 * más un margen debe caber en el campo de visión vertical.
 *
 * Ojo con las unidades: la extensión se mide en unidades MUNDO (las posiciones
 * se normalizan con `escalaMundo`), no en metros. Usar los metros daba una
 * cámara a 1e13, con todo el sistema en un píxel.
 *
 * Antes esto era un múltiplo del radio dibujado, que con los radios ya
 * relativos daba 3,04 unidades para el Sistema Solar cuando Neptuno orbita a
 * 40: se veían el Sol y Mercurio y nada más.
 */
export function distanciaCamara(visuales: CuerpoVisual[]): number {
  const escala = escalaMundo(visuales)
  let extension = 0
  for (const c of visuales) {
    const r = Math.hypot(c.posicion[0], c.posicion[1], c.posicion[2]) * escala + c.radioVisual
    if (r > extension) extension = r
  }
  if (!(extension > 0)) return 20
  // La semialtura visible a distancia d es d·tan(fov/2).
  return (extension * MARGEN_ENCUADRE) / Math.tan(((FOV_VERTICAL_GRADOS * Math.PI) / 180) / 2)
}

/** Factor de escala mundo (40 / radio máximo) para normalizar posiciones SI. */
export function escalaMundo(visuales: CuerpoVisual[]): number {
  return escalaMundoDe(visuales)
}

/** Igual que `escalaMundo` pero sobre cuerpos con posición (sin radioVisual). */
function escalaMundoDe(cuerpos: Array<{ posicion: [number, number, number] }>): number {
  let maxR = 1
  for (const c of cuerpos) {
    const r = Math.hypot(c.posicion[0], c.posicion[1], c.posicion[2])
    if (r > maxR) maxR = r
  }
  return 40 / maxR
}

/** Normaliza posiciones del escenario a mundo (-50..50) para la cámara inicial. */
export function normalizarPosiciones(visuales: CuerpoVisual[]): Map<string, [number, number, number]> {
  const escala = escalaMundo(visuales)
  const mapa = new Map<string, [number, number, number]>()
  for (const c of visuales) {
    mapa.set(c.id, [c.posicion[0] * escala, c.posicion[2] * escala, c.posicion[1] * escala])
  }
  return mapa
}

export async function cargarEscenario(url: string): Promise<Escenario> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`no se pudo cargar escenario: ${url}`)
  const datos = (await res.json()) as Escenario
  if (!Array.isArray(datos.cuerpos) || datos.cuerpos.length === 0) {
    throw new Error('escenario sin cuerpos')
  }
  return datos
}
