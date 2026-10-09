import { describe, expect, it } from 'vitest'
import { contarCuerpos, partirBloques, posicionDe, tiempoDeBloque } from './binario'

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

  it('parte bloques sin copiar', () => {
    // 2 bloques × (1 + 1×6) floats
    const datos = new Float32Array([0, 1, 2, 3, 0, 0, 0, 3600, 4, 5, 6, 0, 0, 0])
    const partes = partirBloques(datos, 1)
    expect(partes).toHaveLength(2)
    expect(tiempoDeBloque(partes[1])).toBe(3600)
    expect(posicionDe(partes[1], 0)).toEqual([4, 5, 6])
    // Vista: comparte el buffer original
    expect(partes[0].buffer).toBe(datos.buffer)
  })

  it('rechaza binario truncado', () => {
    expect(() => partirBloques(new Float32Array([0, 1, 2]), 1)).toThrow()
  })
})
