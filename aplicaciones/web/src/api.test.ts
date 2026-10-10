import { describe, expect, it } from 'vitest'
import { aPeticion, visualesConPosiciones, visualesDesdeBloque } from './api'
import { aVisual } from './escenario'

describe('cliente API', () => {
  it('mapea tuplas a objetos xyz para Rust', () => {
    const vis = aVisual({
      id: 'x', nombre: 'X', descripcion: '', cuerpos: [
        { id: 'a', nombre: 'A', masa: 5, radio: 2, posicion: [1, 2, 3], velocidad: [4, 5, 6] },
      ],
    })
    const pet = aPeticion(vis, 600, 100, 10)
    expect(pet.dt).toBe(600)
    expect(pet.pasos).toBe(100)
    expect(pet.cada_n).toBe(10)
    expect(pet.cuerpos[0].posicion).toEqual({ x: 1, y: 2, z: 3 })
    expect(pet.cuerpos[0].velocidad).toEqual({ x: 4, y: 5, z: 6 })
  })

  it('reconstruye visuales desde el último bloque', () => {
    const vis = aVisual({
      id: 'x', nombre: 'X', descripcion: '', cuerpos: [
        { id: 'a', nombre: 'A', masa: 5, radio: 2, posicion: [0, 0, 0], velocidad: [0, 0, 0] },
      ],
    })
    const bloque = new Float32Array([99, 1, 2, 3, 4, 5, 6])
    const rec = visualesDesdeBloque(vis, bloque)
    expect(rec[0].id).toBe('a')
    expect(rec[0].masa).toBe(5)
    expect(rec[0].posicion).toEqual([1, 2, 3])
    expect(rec[0].velocidad).toEqual([4, 5, 6])
  })

  it('pone posiciones del vuelo conservando velocidades', () => {
    const vis = aVisual({
      id: 'x', nombre: 'X', descripcion: '', cuerpos: [
        { id: 'a', nombre: 'A', masa: 5, radio: 2, posicion: [0, 0, 0], velocidad: [7, 8, 9] },
      ],
    })
    const rec = visualesConPosiciones(vis, [1, 2, 3])
    expect(rec[0].posicion).toEqual([1, 2, 3])
    expect(rec[0].velocidad).toEqual([7, 8, 9])
  })
})
