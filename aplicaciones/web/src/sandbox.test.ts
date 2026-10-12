import { describe, expect, it } from 'vitest'
import { aplicarEdicion, pasosContinuos, pasosParaDuracion } from './sandbox'
import { aVisual } from './escenario'

describe('panel sandbox', () => {
  it('aplica la edición solo al cuerpo elegido', () => {
    const vis = aVisual({
      id: 'x', nombre: 'X', descripcion: '', cuerpos: [
        { id: 'a', nombre: 'A', masa: 1, radio: 1, posicion: [0, 0, 0], velocidad: [0, 0, 0] },
        { id: 'b', nombre: 'B', masa: 2, radio: 1, posicion: [9, 0, 0], velocidad: [0, 7, 0] },
      ],
    })
    const editados = aplicarEdicion(vis, { cuerpoId: 'b', masa: 5, vx: 1, vy: 2, dt: 600, duracionDias: 27, infinito: true, suavizado: 0 })
    expect(editados[0].masa).toBe(1)
    expect(editados[1].masa).toBe(5)
    expect(editados[1].velocidad).toEqual([1, 2, 0])
    // No muta el original
    expect(vis[1].masa).toBe(2)
  })

  it('calcula pasos desde duración y dt', () => {
    expect(pasosParaDuracion(27, 600)).toBe(3888)
    expect(pasosParaDuracion(0, 600)).toBe(50)
    expect(pasosParaDuracion(27, 0)).toBe(50)
  })

  it('tramo continuo de ~dos meses según dt (≥2 órbitas)', () => {
    expect(pasosContinuos(600)).toBe(8000)
    expect(pasosContinuos(0)).toBe(8000)
    expect(pasosContinuos(1)).toBe(30000)
  })
})
