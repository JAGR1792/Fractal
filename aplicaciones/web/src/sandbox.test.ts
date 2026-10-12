import { describe, expect, it } from 'vitest'
import { aplicarEdicion } from './sandbox'
import { cadaNPara } from './api'
import { aVisual } from './escenario'

describe('panel sandbox', () => {
  it('aplica la edición solo al cuerpo elegido', () => {
    const vis = aVisual({
      id: 'x', nombre: 'X', descripcion: '', cuerpos: [
        { id: 'a', nombre: 'A', masa: 1, radio: 1, posicion: [0, 0, 0], velocidad: [0, 0, 0] },
        { id: 'b', nombre: 'B', masa: 2, radio: 1, posicion: [9, 0, 0], velocidad: [0, 7, 0] },
      ],
    })
    const editados = aplicarEdicion(vis, { cuerpoId: 'b', masa: 5, vx: 1, vy: 2, dt: 600, suavizado: 0 })
    expect(editados[0].masa).toBe(1)
    expect(editados[1].masa).toBe(5)
    expect(editados[1].velocidad).toEqual([1, 2, 0])
    // No muta el original
    expect(vis[1].masa).toBe(2)
  })

  it('bloques cada ~12000 s según dt', () => {
    expect(cadaNPara(600)).toBe(20)
    expect(cadaNPara(0)).toBe(20)
    expect(cadaNPara(1)).toBe(1000)
  })
})
