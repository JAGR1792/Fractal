import { describe, expect, it } from 'vitest'
import { detectarImpactos, elementosOrbitales, formatearDistancia, G } from './mecanica'

describe('mecánica orbital', () => {
  it('órbita circular: sma=r, ecc=0, período de Kepler', () => {
    // Luna aproximada: r=3.844e8 m, v=1022 m/s, central = Tierra.
    const mu = G * 5.972e24
    const el = elementosOrbitales([3.844e8, 0, 0], [0, 1022, 0], mu)!
    expect(el).not.toBeNull()
    expect(el.sma! / 3.844e8).toBeCloseTo(1, 1)
    expect(el.excentricidad).toBeLessThan(0.05)
    // T ≈ 2.37e6 s (27.4 días)
    expect(el.periodo! / 2.37e6).toBeCloseTo(1, 1)
  })

  it('hiperbólica: sin sma ni período', () => {
    const mu = G * 5.972e24
    const el = elementosOrbitales([3.844e8, 0, 0], [0, 5000, 0], mu)!
    expect(el.sma).toBeNull()
    expect(el.periodo).toBeNull()
  })

  it('formatea distancias', () => {
    expect(formatearDistancia(384400)).toBe('384.4 km')
    expect(formatearDistancia(3.844e8)).toBe('384.4k km')
  })

  it('detecta impactos por proximidad', () => {
    const cerca = detectarImpactos([[0, 0, 0], [1, 0, 0]], [1, 1])
    expect(cerca).toHaveLength(1)
    expect(cerca[0].punto).toEqual([0.5, 0, 0])
    expect(detectarImpactos([[0, 0, 0], [100, 0, 0]], [1, 1])).toHaveLength(0)
  })
})
