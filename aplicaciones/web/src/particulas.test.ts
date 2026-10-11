import { describe, expect, it } from 'vitest'
import { actualizar, aIntercalado, crearSistema, explotar, puedeExplotar } from './particulas'

describe('partículas de explosión', () => {
  it('respeta la capacidad (saca las viejas)', () => {
    const sis = crearSistema(10)
    explotar(sis, [0, 0, 0], 15, 5)
    expect(sis.chispas.length).toBe(10)
  })

  it('envejecen y mueren', () => {
    const sis = crearSistema()
    explotar(sis, [1, 2, 3], 5, 5)
    expect(actualizar(sis, 0.5)).toBe(5)
    expect(actualizar(sis, 10)).toBe(0)
  })

  it('el brillo decae con la edad', () => {
    const sis = crearSistema()
    explotar(sis, [0, 0, 0], 1, 0)
    const a = aIntercalado(sis)
    expect(a.length).toBe(7)
    expect(a[3]).toBeCloseTo(1, 5)
    actualizar(sis, 100)
    expect(aIntercalado(sis).length).toBe(0)
  })

  it('anti-spam por clave', () => {
    const mapa = new Map<string, number>()
    expect(puedeExplotar(mapa, 'a-b', 1000, 3000)).toBe(true)
    expect(puedeExplotar(mapa, 'a-b', 2000, 3000)).toBe(false)
    expect(puedeExplotar(mapa, 'a-b', 5000, 3000)).toBe(true)
  })
})
