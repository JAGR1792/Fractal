import { describe, expect, it } from 'vitest'
import { aVisual, normalizarPosiciones } from './escenario'

describe('escala visual', () => {
  it('separa radio físico de visual', () => {
    const vis = aVisual({
      id: 'x', nombre: 'X', descripcion: '', cuerpos: [
        { id: 'a', nombre: 'A', masa: 1, radio: 6.371e6, posicion: [0, 0, 0], velocidad: [0, 0, 0] },
        { id: 'b', nombre: 'B', masa: 1, radio: 1.737e6, posicion: [3.844e8, 0, 0], velocidad: [0, 0, 0] },
      ],
    })
    // El radio visual no es el físico, está comprimido y acotado
    expect(vis[0].radioVisual).toBeGreaterThan(vis[1].radioVisual)
    expect(vis[0].radioVisual).toBeLessThanOrEqual(6.0)
  })

  it('normaliza a mundo visible', () => {
    const vis = aVisual({
      id: 'x', nombre: 'X', descripcion: '', cuerpos: [
        { id: 'a', nombre: 'A', masa: 1, radio: 1, posicion: [0, 0, 0], velocidad: [0, 0, 0] },
        { id: 'b', nombre: 'B', masa: 1, radio: 1, posicion: [1.496e11, 0, 0], velocidad: [0, 0, 0] },
      ],
    })
    const mapa = normalizarPosiciones(vis)
    const pb = mapa.get('b')!
    expect(Math.hypot(pb[0], pb[2])).toBeLessThanOrEqual(41)
  })
})
