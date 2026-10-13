import { describe, expect, it } from 'vitest'
import { avanzar, bloqueActual, crearFrontera, instanteDe, reanclar, techoDe } from './frontera'

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
