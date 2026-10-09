import { describe, expect, it } from 'vitest'
import {
  camaraInicial,
  invertir,
  matrizProyeccion,
  matrizVista,
  multiplicar,
  rayoDesdePantalla,
  tocaEsfera,
  type Rayo,
} from './camara'

describe('matemáticas de cámara y picking', () => {
  it('invertir deshace la matriz vista-proyección', () => {
    const vp = multiplicar(matrizProyeccion(16 / 9, 50, 1, 100), matrizVista(camaraInicial(80)))
    const id = multiplicar(vp, invertir(vp))
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const esperado = r === c ? 1 : 0
        expect(id[c * 4 + r]).toBeCloseTo(esperado, 2)
      }
    }
  })

  it('el centro de la pantalla mira al frente con identidad', () => {
    const identidad = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    const rayo = rayoDesdePantalla(400, 300, 800, 600, identidad)
    expect(rayo.origen).toEqual([0, 0, -1])
    expect(rayo.direccion[2]).toBeCloseTo(1, 5)
  })

  it('tocaEsfera acierta de frente y falla de lado', () => {
    const rayo: Rayo = { origen: [0, 0, 10], direccion: [0, 0, -1] }
    expect(tocaEsfera(rayo, [0, 0, 0], 1)).toBeCloseTo(9, 5)
    const lado: Rayo = { origen: [0, 0, 10], direccion: [0, 1, 0] }
    expect(tocaEsfera(lado, [0, 0, 0], 1)).toBeNull()
  })
})
