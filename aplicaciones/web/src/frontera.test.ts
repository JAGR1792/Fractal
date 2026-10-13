import { describe, expect, it } from 'vitest'
import {
  avanzar,
  bloqueActual,
  crearFrontera,
  instanteDe,
  periodoDelSistema,
  reanclar,
  ritmoParaPeriodo,
  RITMO_SIM_POR_DEFECTO,
  SEGUNDOS_POR_VUELTA,
  techoDe,
} from './frontera'

/** Bloque binario mínimo: [t, x,y,z,vx,vy,vz] de un cuerpo. */
function bloque(t: number, x = 0): Float32Array {
  return new Float32Array([t, x, 0, 0, 0, 0, 0])
}

/** Serie de bloques cada 12000 s desde `desde`. */
function serie(desde: number, cuantos: number): Float32Array[] {
  return Array.from({ length: cuantos }, (_v, i) => bloque(desde + i * 12000, i))
}

describe('frontera de reproducción', () => {
  it('el techo deja dos bloques de margen para el Hermite', () => {
    const f = crearFrontera(serie(0, 10))
    // bloques 0..9 → techo = t del bloque 7
    expect(techoDe(f)).toBe(7 * 12000)
  })

  it('sin historial suficiente no hay techo', () => {
    expect(techoDe(crearFrontera(null))).toBe(-Infinity)
    expect(techoDe(crearFrontera(serie(0, 2)))).toBe(-Infinity)
  })

  it('avanza a ritmo fijo y se detiene en la frontera, sin dar la vuelta', () => {
    const f = crearFrontera(serie(0, 10))
    const techo = techoDe(f)
    // 1 s de pared a 1x con ritmo 120000 s/sim: un salto enorme, recortado.
    expect(avanzar(f, 1, 1, 120000, false)).toBe(techo)
    expect(f.tiempo).toBe(techo)
    // Ya en el borde: por mucho que siga el reloj de pared, no pasa ni vuelve
    // al principio (el módulo al bloque 0 era el salto del reinicio visible).
    for (let i = 0; i < 200; i++) avanzar(f, 0.016, 1, 120000, false)
    expect(f.tiempo).toBe(techo)
  })

  it('pausado no toca el reloj', () => {
    const f = crearFrontera(serie(0, 10))
    f.tiempo = 1000
    expect(avanzar(f, 1, 10, 120000, true)).toBe(1000)
    expect(f.tiempo).toBe(1000)
  })

  it('el techo no retrocede aunque encogan los bloques', () => {
    // Caso real: una poda o una respuesta rancia deja la lista más corta. Si el
    // techo bajara, el reloj retrocedería y los cuerpos se teletransportarían.
    const f = crearFrontera(serie(0, 30))
    const techo = avanzar(f, 100, 1, 120000, false)
    expect(techo).toBe(27 * 12000)

    f.bloques = serie(0, 5)
    expect(techoDe(f)).toBe(27 * 12000)
    expect(avanzar(f, 1, 1, 120000, false)).toBe(27 * 12000)
    // El reloj sigue por delante de los bloques disponibles: el instante que se
    // dibuja se recorta al techo, nunca retrocede por debajo.
    expect(instanteDe(f)).toBe(27 * 12000)
  })

  it('el instante dibujado nunca excede el techo ni el primer bloque', () => {
    const f = crearFrontera(serie(0, 10))
    f.tiempo = 1e12
    expect(instanteDe(f)).toBe(techoDe(f))

    // Reloj por debajo del primer bloque disponible (tras podar): se sube.
    const g = crearFrontera(serie(500000, 10))
    g.tiempo = 10
    expect(instanteDe(g)).toBe(500000)
  })

  it('reanclar reinicia el reloj al primer bloque de la fuente nueva', () => {
    const f = crearFrontera(serie(0, 10))
    avanzar(f, 100, 1, 120000, false)
    reanclar(f, serie(9e6, 6))
    expect(f.tiempo).toBe(9e6)
    expect(techoDe(f)).toBe(9e6 + 3 * 12000)
    reanclar(f, null)
    expect(f.tiempo).toBe(0)
    expect(f.bloques).toBeNull()
  })

  it('bloqueActual interpola en el instante dibujado', () => {
    const f = crearFrontera(serie(0, 10))
    f.tiempo = 0
    const b = bloqueActual(f)!
    expect(b).not.toBeNull()
    expect(b[0]).toBe(0)
    expect(b[1]).toBeCloseTo(0, 6)
    expect(bloqueActual(crearFrontera(null))).toBeNull()
    expect(bloqueActual(crearFrontera(serie(0, 1)))).toBeNull()
  })
})

describe('ritmo de reproducción por sistema', () => {
  /** Cuerpo mínimo para `periodoDelSistema`. */
  const cuerpo = (masa: number, posicion: [number, number, number]) => ({ masa, posicion })

  it('deduce el período del planeta más interno por Kepler', () => {
    // Sol en el origen y un planeta a 1 UA: T = 2π√(r³/GM) ≈ 1 año.
    const periodo = periodoDelSistema([cuerpo(1.989e30, [0, 0, 0]), cuerpo(5.972e24, [1.496e11, 0, 0])])!
    expect(periodo / (365.25 * 86400)).toBeCloseTo(1, 1)
  })

  it('toma el cuerpo más masivo como centro, no el primero', () => {
    // Planeta pequeño primero y Sol después: el período debe salir del Sol.
    const periodo = periodoDelSistema([cuerpo(5.972e24, [1.496e11, 0, 0]), cuerpo(1.989e30, [0, 0, 0])])!
    expect(periodo / (365.25 * 86400)).toBeCloseTo(1, 1)
  })

  it('con varios planetas usa el más interno', () => {
    // Mercurio (0,387 UA) y Neptuno (30 UA): manda Mercurio.
    const periodo = periodoDelSistema([
      cuerpo(1.989e30, [0, 0, 0]),
      cuerpo(3.285e23, [5.79e10, 0, 0]),
      cuerpo(1.024e26, [4.495e12, 0, 0]),
    ])!
    expect(periodo / (365.25 * 86400)).toBeCloseTo(0.24, 1)
  })

  it('sin dos cuerpos no hay período', () => {
    expect(periodoDelSistema([])).toBeNull()
    expect(periodoDelSistema([cuerpo(1.989e30, [0, 0, 0])])).toBeNull()
  })

  it('el ritmo hace visible una vuelta completa en el Sistema Solar', () => {
    // El defecto era este: con el ritmo fijo de la Luna (120000), los planetas
    // exteriores recorrían ~1e-4 grados por fotograma y parecían congelados.
    const RITMO_VIEJO = 120000
    const periodoNeptuno = 164.79 * 365.25 * 86400
    const gradosViejos = ((RITMO_VIEJO / 60) / periodoNeptuno) * 360
    expect(gradosViejos).toBeLessThan(0.001) // imperceptible

    // Con el ritmo del sistema, una vuelta del cuerpo principal tarda
    // exactamente SEGUNDOS_POR_VUELTA de pared a 1x.
    const periodo = periodoDelSistema([
      cuerpo(1.989e30, [0, 0, 0]),
      cuerpo(1.024e26, [4.495e12, 0, 0]),
    ])!
    const ritmo = ritmoParaPeriodo(periodo)
    expect(periodo / ritmo).toBeCloseTo(SEGUNDOS_POR_VUELTA, 6)

    // Y el movimiento por fotograma entra en rango visible.
    const gradosFotograma = ((ritmo / 60) / periodo) * 360
    expect(gradosFotograma).toBeGreaterThan(0.05)
    expect(gradosFotograma).toBeLessThan(5)
  })

  it('sin período válido cae al ritmo por defecto (Tierra-Luna)', () => {
    expect(ritmoParaPeriodo(NaN)).toBe(RITMO_SIM_POR_DEFECTO)
    expect(ritmoParaPeriodo(0)).toBe(RITMO_SIM_POR_DEFECTO)
    expect(ritmoParaPeriodo(-5)).toBe(RITMO_SIM_POR_DEFECTO)
    // El defecto conserva el comportamiento del escenario Tierra-Luna: una
    // órbita lunar cada SEGUNDOS_POR_VUELTA.
    expect(2_360_448 / RITMO_SIM_POR_DEFECTO).toBeCloseTo(SEGUNDOS_POR_VUELTA, 6)
  })

  it('el ritmo escala con el período del sistema, sea cual sea', () => {
    // Lo que fallaba no era el valor del ritmo, sino que fuera FIJO: la órbita
    // lunar se veía bien y los planetas exteriores del Sistema Solar no.
    const T_LUNA = 2_360_448
    const T_MERCURIO = 0.2408 * 365.25 * 86400
    const ritmoLuna = ritmoParaPeriodo(T_LUNA)
    const ritmoSolar = ritmoParaPeriodo(T_MERCURIO)

    // El ritmo es proporcional al período de referencia: sistemas con órbitas
    // más lentas avanzan más segundos sim por segundo de reloj.
    expect(ritmoSolar / ritmoLuna).toBeCloseTo(T_MERCURIO / T_LUNA, 6)
    expect(ritmoSolar).toBeGreaterThan(ritmoLuna)

    // Y con el ritmo del sistema, la vuelta del cuerpo principal tarda lo mismo
    // en ambos escenarios: la experiencia no depende del sistema elegido.
    const gradosLuna = ((ritmoLuna / 60) / T_LUNA) * 360
    const gradosMercurio = ((ritmoSolar / 60) / T_MERCURIO) * 360
    expect(gradosLuna).toBeCloseTo(gradosMercurio, 6)
    // En rango visible en los dos casos (el umbral de percepción está en ~0,05°).
    expect(gradosLuna).toBeGreaterThan(0.05)
    expect(gradosMercurio).toBeGreaterThan(0.05)
  })
})
