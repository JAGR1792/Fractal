/**
 * Frontera de reproducción (lógica pura, sin GPU ni DOM).
 *
 * El servidor integra sin fin; el render no puede dibujar más allá de los
 * bloques que ya tiene, así que persigue la frontera: avanza a ritmo fijo y
 * **espera en el borde** hasta que llegan más datos. Nunca hay módulo ni
 * reinicio de reloj: eso era justo lo que producía el salto visible.
 *
 * El margen de dos bloques existe porque la interpolación de Hermite necesita
 * el bloque siguiente para reconstruir con exactitud el actual.
 */
import { interpolarBloque } from './binario'

/** Estado mínimo de la reproducción que ambos renderers comparten. */
export interface Frontera {
  /** Bloques del servidor (cada uno `[t, x,y,z,vx,vy,vz × N]`). */
  bloques: Float32Array[] | null
  /** Reloj de reproducción en segundos sim. */
  tiempo: number
  /**
   * Techo más alto alcanzado. Guarda contra el retroceso: si por una poda o
   * una respuesta rancia la lista de bloques encogiera, el techo bajaría y el
   * reloj retrocedería — y retroceder el reloj es teletransportar los cuerpos.
   */
  techoVisto: number
}

/** Crea la frontera desde una lista de bloques (o vacía). */
export function crearFrontera(bloques: Float32Array[] | null): Frontera {
  return { bloques, tiempo: bloques && bloques.length > 0 ? bloques[0][0] : 0, techoVisto: -Infinity }
}

/**
 * Segundos de simulación por segundo de pared a velocidad 1x, para que el
 * sistema se VEA moverse.
 *
 * Un ritmo fijo no sirve para todos los escenarios: calibrado para la órbita
 * lunar (2,36e6 s) daba ~20 s por vuelta, que está bien; pero en el Sistema
 * Solar los planetas exteriores recorrían 1e-4 grados por fotograma y parecían
 * congelados (Neptuno tardaba 12 horas de reloj en dar una vuelta).
 *
 * El criterio es el mismo que usa `cadaNPara` para el muestreo: tomar como
 * referencia una vuelta del cuerpo principal. Aquí, que esa vuelta tarde
 * `segundosPorVuelta` de pared a 1x. Ocho segundos dejan la vuelta completa
 * visible sin que el planeta parpadee entre fotogramas, y el deslizador de
 * velocidad permite alejarse de ahí en ambos sentidos.
 */
export const SEGUNDOS_POR_VUELTA = 8

/** Ritmo de reproducción para un período orbital de referencia (segundos sim). */
export function ritmoParaPeriodo(periodoSim: number): number {
  if (!(periodoSim > 0) || !Number.isFinite(periodoSim)) return RITMO_SIM_POR_DEFECTO
  return periodoSim / SEGUNDOS_POR_VUELTA
}

/**
 * Ritmo por defecto: el del escenario Tierra-Luna (una órbita lunar de 2,36e6 s
 * cada ~20 s de pared). Se usa hasta que el escenario dice su período real.
 */
export const RITMO_SIM_POR_DEFECTO = 2_360_448 / SEGUNDOS_POR_VUELTA

/** Vuelta al Sol del planeta más interno, o `null` si no se puede calcular. */
export function periodoDelSistema(
  cuerpos: Array<{ posicion: [number, number, number]; masa: number }>,
): number | null {
  if (cuerpos.length < 2) return null
  // Masa central: el cuerpo más masivo (el Sol en el Sistema Solar).
  let centro = 0
  for (let i = 1; i < cuerpos.length; i++) {
    if (cuerpos[i].masa > cuerpos[centro].masa) centro = i
  }
  const G = 6.6743e-11
  let menor = Infinity
  for (let i = 0; i < cuerpos.length; i++) {
    if (i === centro) continue
    const r = Math.hypot(
      cuerpos[i].posicion[0] - cuerpos[centro].posicion[0],
      cuerpos[i].posicion[1] - cuerpos[centro].posicion[1],
      cuerpos[i].posicion[2] - cuerpos[centro].posicion[2],
    )
    if (!(r > 0)) continue
    // Tercera ley de Kepler: T = 2π√(r³/GM).
    const t = 2 * Math.PI * Math.sqrt((r * r * r) / (G * cuerpos[centro].masa))
    if (t < menor) menor = t
  }
  return Number.isFinite(menor) ? menor : null
}

/**
 * Techo de reproducción: tercer bloque desde el final (margen de 2) o el
 * mayor ya visto. `-Infinity` si aún no hay historial suficiente para
 * interpolar con exactitud.
 */
export function techoDe(f: Frontera): number {
  if (!f.bloques || f.bloques.length < 3) return f.techoVisto
  const actual = f.bloques[f.bloques.length - 3][0]
  return Math.max(actual, f.techoVisto)
}

/**
 * Avanza el reloj `dtSegundos` de pared a `velocidad`×, sin pasar el techo.
 * Devuelve el instante nuevo. Pausado, o sin margen, el reloj no se mueve.
 */
export function avanzar(f: Frontera, dtSegundos: number, velocidad: number, ritmoSim: number, pausado: boolean): number {
  const techo = techoDe(f)
  f.techoVisto = techo
  if (pausado || !(techo > f.tiempo)) return f.tiempo
  f.tiempo = Math.min(f.tiempo + dtSegundos * velocidad * ritmoSim, techo)
  return f.tiempo
}

/**
 * Instante que se está dibujando: el reloj, nunca por encima del techo.
 * Un reloj por debajo del primer bloque disponible se sube al primero (pasó
 * tras podar): dibujar antes del primer bloque sería extrapolar.
 */
export function instanteDe(f: Frontera): number {
  if (!f.bloques || f.bloques.length === 0) return f.tiempo
  const primero = f.bloques[0][0]
  if (f.tiempo < primero) f.tiempo = primero
  const techo = techoDe(f)
  return techo > -Infinity ? Math.min(f.tiempo, techo) : f.tiempo
}

/**
 * Bloque interpolado en el instante que se está dibujando (para telemetría y
 * para resembrar una sesión sin salto). `null` si no hay historial.
 */
export function bloqueActual(f: Frontera): Float32Array | null {
  if (!f.bloques || f.bloques.length < 2) return null
  return interpolarBloque(f.bloques, f.bloques.length - 1, instanteDe(f))
}

/**
 * Reancla el reloj al primer bloque disponible. Se llama al cambiar de fuente:
 * el tiempo de una sesión no significa nada en otra.
 */
export function reanclar(f: Frontera, bloques: Float32Array[] | null): void {
  f.bloques = bloques
  f.tiempo = bloques && bloques.length > 0 ? bloques[0][0] : 0
  f.techoVisto = -Infinity
}
