import { describe, expect, it } from 'vitest'
import {
  cuerpoCentral,
  detectarImpactos,
  elementosDeCuerpo,
  elementosOrbitales,
  formatearDistancia,
  G,
} from './mecanica'
import type { CuerpoVisual } from './escenario'

/** Cuerpo visual mínimo para probar la elección de central. */
function cuerpo(
  id: string,
  masa: number,
  posicion: [number, number, number],
  velocidad: [number, number, number] = [0, 0, 0],
): CuerpoVisual {
  return {
    id,
    nombre: id,
    masa,
    radio: 1e6,
    posicion,
    velocidad,
    radioVisual: 1,
    color: [1, 1, 1],
  }
}

describe('mecánica orbital', () => {
  it('órbita circular: sma=r, ecc=0, período de Kepler', () => {
    // Luna aproximada: r=3.844e8 m, v=1022 m/s, central = Tierra.
    const mu = G * 5.972e24
    const el = elementosOrbitales([3.844e8, 0, 0], [0, 1022, 0], mu)!
    expect(el).not.toBeNull()
    expect(el.sma! / 3.844e8).toBeCloseTo(1, 1)
    expect(el.excentricidad).toBeLessThan(0.05)
    // T ≈ 2.37e6 s (27.4 días)
    expect(el.periodo! / 2.37e6).toBeCloseTo(1, 1)
  })

  it('hiperbólica: sin sma ni período', () => {
    const mu = G * 5.972e24
    const el = elementosOrbitales([3.844e8, 0, 0], [0, 5000, 0], mu)!
    expect(el.sma).toBeNull()
    expect(el.periodo).toBeNull()
  })

  it('formatea distancias', () => {
    expect(formatearDistancia(384400)).toBe('384.4 km')
    expect(formatearDistancia(3.844e8)).toBe('384.4k km')
  })

  it('detecta impactos por proximidad', () => {
    const cerca = detectarImpactos([[0, 0, 0], [1, 0, 0]], [1, 1])
    expect(cerca).toHaveLength(1)
    expect(cerca[0].punto).toEqual([0.5, 0, 0])
    expect(detectarImpactos([[0, 0, 0], [100, 0, 0]], [1, 1])).toHaveLength(0)
  })

  it('la Luna orbita la Tierra aunque el Sol atraiga más', () => {
    // Escenario real: Sol en el origen, Tierra a 1 UA y Luna a 384400 km.
    const sistema: CuerpoVisual[] = [
      cuerpo('sol', 1.989e30, [0, 0, 0]),
      cuerpo('tierra', 5.972e24, [1.496e11, 0, 0], [0, 29780, 0]),
      cuerpo('luna', 7.34e22, [1.496e11 + 3.844e8, 0, 0], [0, 29780 + 1022, 0]),
    ]
    // La Tierra atrae a la Luna con 2.70e-3 m/s² y el Sol con 5.90e-3 m/s²:
    // si el criterio fuera la fuerza, el central saldría el Sol. La esfera de
    // influencia terrestre (~924000 km) contiene a la Luna (384400 km).
    expect(cuerpoCentral(sistema, 2)).toBe(1)
    // La Tierra sí orbita el Sol.
    expect(cuerpoCentral(sistema, 1)).toBe(0)

    const el = elementosDeCuerpo(sistema, 2)!
    expect(el).not.toBeNull()
    // Semieje lunar real (384400 km), no el heliocéntrico (1 UA).
    expect(el.sma! / 3.844e8).toBeCloseTo(1, 1)
    expect(el.sma! / 1.496e11).toBeLessThan(0.01)
    // Período lunar: ~27.3 días, no ~410 días del movimiento heliocéntrico.
    expect(el.periodo! / 2.36e6).toBeCloseTo(1, 1)
  })

  it('en dos cuerpos el central es el otro, que además es el más masivo', () => {
    // Tierra y Luna solas: sin Sol, la Tierra es a la vez el padre y el central.
    const sistema: CuerpoVisual[] = [
      cuerpo('tierra', 5.972e24, [0, 0, 0]),
      cuerpo('luna', 7.34e22, [3.844e8, 0, 0], [0, 1022, 0]),
    ]
    expect(cuerpoCentral(sistema, 1)).toBe(0)
    const el = elementosDeCuerpo(sistema, 1)!
    expect(el.sma! / 3.844e8).toBeCloseTo(1, 1)
    expect(el.periodo! / 2.36e6).toBeCloseTo(1, 1)
    expect(el.excentricidad).toBeLessThan(0.05)
  })

  it('sin otro cuerpo válido no hay central', () => {
    expect(cuerpoCentral([cuerpo('sol', 1.989e30, [0, 0, 0])], 0)).toBeNull()
    expect(cuerpoCentral([], 0)).toBeNull()
    expect(elementosDeCuerpo([cuerpo('sol', 1.989e30, [0, 0, 0])], 0)).toBeNull()
  })
})
