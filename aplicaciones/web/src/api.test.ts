import { describe, expect, it } from 'vitest'
import { aPeticion } from './api'
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
})
