import { describe, expect, it } from 'vitest'
import { aSegmentos, crearEstela, empujarEstela, generarEstrellas } from './estelas'

describe('estelas y estrellas', () => {
  it('recorta las más viejas', () => {
    const e = crearEstela(3)
    for (let i = 0; i < 5; i++) empujarEstela(e, [i, 0, 0])
    expect(e.puntos).toHaveLength(3)
    expect(e.puntos[0][0]).toBe(2)
  })

  it('segmentos con alpha creciente', () => {
    const e = crearEstela(10)
    empujarEstela(e, [0, 0, 0])
    empujarEstela(e, [1, 0, 0])
    empujarEstela(e, [2, 0, 0])
    const segs = aSegmentos(e, [1, 0, 0])
    // 2 segmentos × 2 vértices × 7 floats
    expect(segs).toHaveLength(28)
    expect(segs[6]).toBeCloseTo(0, 5)
    expect(segs[segs.length - 1]).toBeCloseTo(2 / 3, 5)
  })

  it('estrellas deterministas sobre el cascarón', () => {
    const a = generarEstrellas(200, 42, 900)
    const b = generarEstrellas(200, 42, 900)
    expect(a).toEqual(b)
    expect(a.length).toBe(600)
    for (let i = 0; i < 200; i++) {
      const r = Math.hypot(a[i * 3], a[i * 3 + 1], a[i * 3 + 2])
      expect(r).toBeGreaterThan(890)
      expect(r).toBeLessThan(910)
    }
  })
})
