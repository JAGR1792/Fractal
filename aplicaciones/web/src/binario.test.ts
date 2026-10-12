import { describe, expect, it } from 'vitest'
import { contarCuerpos, detectarLimiteBucle, interpolarBloque, partirBloques, posicionDe, saltoDeBucle, tiempoDeBloque } from './binario'

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

  it('detecta la órbita completa e interpola al medio', () => {
    // 2 cuerpos: central fijo + luna en círculo de radio 10, 65 bloques.
    const bloques: Float32Array[] = []
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2
      bloques.push(new Float32Array([k, 0, 0, 0, 0, 0, 0, 10 * Math.cos(a), 0, 10 * Math.sin(a), 0, 0, 0]))
    }
    expect(detectarLimiteBucle(bloques, 2)).toBe(64)
    const medio = interpolarBloque(bloques, 64, 32)!
    expect(medio[0]).toBe(32)
    // A medio camino: ángulo π → x=-10, z≈0.
    expect(medio[7]).toBeCloseTo(-10, 3)
    expect(medio[9]).toBeCloseTo(0, 3)
  })

  it('ventana de 0.985 órbitas cierra en el mejor empalme', () => {
    // La ventana por defecto del escenario dos_cuerpos cubría 0.985 órbitas:
    // el detector viejo (2π−0.05) fallaba siempre. El nuevo devuelve el
    // mejor empalme (mínimo salto) en vez del último bloque arbitrario.
    const bloques: Float32Array[] = []
    for (let k = 0; k <= 62; k++) {
      const a = (k / 64) * Math.PI * 2
      bloques.push(new Float32Array([k, 0, 0, 0, 0, 0, 0, 10 * Math.cos(a), 0, 10 * Math.sin(a), 0, 0, 0]))
    }
    const limite = detectarLimiteBucle(bloques, 2)
    expect(limite).toBe(62)
    expect(saltoDeBucle(bloques, limite)).toBeLessThan(2)
  })

  it('hermite es exacta en los nodos (posicion y velocidad)', () => {
    const a = new Float32Array([0, 0, 0, 0, 10, 0, 0])
    const b = new Float32Array([10, 100, 0, 0, 20, 0, 0])
    const ini = interpolarBloque([a, b], 1, 0)!
    const fin = interpolarBloque([a, b], 1, 10)!
    expect(ini[1]).toBeCloseTo(0, 6)
    expect(ini[4]).toBeCloseTo(10, 6)
    expect(fin[1]).toBeCloseTo(100, 6)
    expect(fin[4]).toBeCloseTo(20, 6)
  })

  it('salto cero en órbita cerrada y grande si se trunca', () => {
    const bloques: Float32Array[] = []
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2
      bloques.push(new Float32Array([k, 0, 0, 0, 0, 0, 0, 10 * Math.cos(a), 0, 10 * Math.sin(a), 0, 0, 0]))
    }
    expect(saltoDeBucle(bloques, 64)).toBeCloseTo(0, 3)
    // Truncada a media vuelta: el salto es el diámetro.
    expect(saltoDeBucle(bloques, 32)).toBeCloseTo(20, 3)
  })
})
