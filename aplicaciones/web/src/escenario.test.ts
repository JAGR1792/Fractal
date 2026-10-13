import { describe, expect, it } from 'vitest'
import {
  aVisual,
  normalizarPosiciones,
  NUM_TEXTURAS,
  slotTextura,
  TEXTURAS_POR_ID,
  tipoPlaneta,
  urlTextura,
} from './escenario'

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
    expect(vis[0].radioVisual).toBeLessThanOrEqual(3.2)
    expect(vis[1].radioVisual).toBeGreaterThanOrEqual(0.4)
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

  it('clasifica tipos visuales por id', () => {
    expect(tipoPlaneta('sol')).toBe(0)
    expect(tipoPlaneta('Tierra')).toBe(1)
    expect(tipoPlaneta('LUNA')).toBe(2)
    expect(tipoPlaneta('marte')).toBe(3)
  })

  it('resuelve texturas vendorizadas del sandbox', () => {
    expect(urlTextura('tierra')).toBe('/texturas/tierra.jpg')
    expect(urlTextura('LUNA')).toBe('/texturas/luna.jpg')
    expect(urlTextura('marte')).toBe('/texturas/marte.jpg')
    expect(urlTextura('pluton')).toBeNull()
    expect(slotTextura('tierra')).toBe(0)
    expect(slotTextura('sol')).toBe(9)
    expect(slotTextura('pluton')).toBe(-1)
  })

  it('el catálogo de texturas respeta el contrato de slots', () => {
    // El shader ULTRA declara un binding por slot y arma el bind group con
    // `binding: 3 + slot`. Si los slots tuvieran huecos o se repitieran, el
    // muestreo leería la textura equivocada sin dar ningún error: por eso se
    // fija aquí como contrato.
    const entradas = Object.entries(TEXTURAS_POR_ID)
    expect(entradas).toHaveLength(NUM_TEXTURAS)

    const slots = entradas.map(([, e]) => e.slot).sort((a, b) => a - b)
    // Contiguos desde 0: 0, 1, 2, ... NUM_TEXTURAS-1 (sin huecos ni repetidos).
    expect(slots).toEqual(Array.from({ length: NUM_TEXTURAS }, (_v, i) => i))

    // Cada id del catálogo resuelve a su propio slot.
    for (const [id, entrada] of entradas) {
      expect(slotTextura(id)).toBe(entrada.slot)
      expect(urlTextura(id)).toBe(entrada.url)
    }
  })

  it('los cuerpos del Sistema Solar tienen textura y el Sol también', () => {
    // El escenario real debe poder resolver una textura por cuerpo; si un id
    // se escribe distinto, el planeta cae a color plano sin avisar.
    for (const id of ['sol', 'mercurio', 'venus', 'tierra', 'marte', 'jupiter', 'saturno', 'urano', 'neptuno']) {
      expect(slotTextura(id), `${id} sin textura`).toBeGreaterThanOrEqual(0)
    }
    expect(slotTextura('luna')).toBeGreaterThanOrEqual(0)
  })
})
