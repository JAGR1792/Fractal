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
