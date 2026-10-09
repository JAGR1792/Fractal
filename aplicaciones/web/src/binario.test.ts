import { describe, expect, it } from 'vitest'
import { contarCuerpos, posicionDe, tiempoDeBloque } from './binario'

describe('protocolo binario v1', () => {
  it('cuenta cuerpos y lee tiempo', () => {
    // t=10, 1 cuerpo en (1,2,3) con v=(4,5,6)
    const buf = new Float32Array([10, 1, 2, 3, 4, 5, 6])
    expect(tiempoDeBloque(buf)).toBe(10)
    expect(contarCuerpos(buf)).toBe(1)
    expect(posicionDe(buf, 0)).toEqual([1, 2, 3])
  })

  it('rechaza bloque vacío', () => {
    expect(() => tiempoDeBloque(new Float32Array([]))).toThrow()
  })
})
