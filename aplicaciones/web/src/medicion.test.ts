import { describe, expect, it } from 'vitest'
import { Medidor, UMBRAL_PARON_MS, textoMedicion } from './medicion'

describe('medidor de rendimiento', () => {
  it('ignora cuadros inválidos y cuenta parones', () => {
    const m = new Medidor()
    m.marco(10)
    m.marco(20)
    m.marco(NaN)
    m.marco(-5)
    m.marco(UMBRAL_PARON_MS + 1)
    const f = m.foto()
    expect(f.cuadros).toBe(3)
    expect(f.parones).toBe(1)
    expect(f.msMax).toBeCloseTo(UMBRAL_PARON_MS + 1, 9)
  })

  it('p95 refleja la cola lenta aunque la mediana sea sana', () => {
    const m = new Medidor()
    for (let i = 0; i < 95; i++) m.marco(8)
    for (let i = 0; i < 5; i++) m.marco(60)
    const f = m.foto()
    expect(f.msP50).toBeCloseTo(8, 9)
    expect(f.msP95).toBeGreaterThan(8)
  })

  it('congela las interpolaciones del cuadro al cerrar el marco', () => {
    const m = new Medidor()
    m.sumarInterpolaciones(40)
    m.marco(12)
    expect(m.foto().interpUltimoCuadro).toBe(40)
    expect(m.foto().interpTotal).toBe(40)
    // El cuadro siguiente sin trabajo reporta 0 pero conserva el total.
    m.marco(9)
    expect(m.foto().interpUltimoCuadro).toBe(0)
    expect(m.foto().interpTotal).toBe(40)
  })

  it('marca hambre y el texto avisa buffering', () => {
    const m = new Medidor()
    m.estado = 'vivo'
    expect(m.foto().hambre).toBe(false)
    m.hambre = true
    m.marco(33)
    const f = m.foto()
    expect(f.hambre).toBe(true)
    expect(textoMedicion(f)).toContain('buffering')
  })

  it('acumula anexados, podas y bytes, y el texto es de una línea', () => {
    const m = new Medidor()
    m.estado = 'vivo'
    m.sumarAnexados(200)
    m.sumarPoda()
    m.sumarBytes(2048)
    m.marco(5)
    const f = m.foto()
    expect(f.bloquesAnexados).toBe(200)
    expect(f.podas).toBe(1)
    expect(f.bytesSubidos).toBe(2048)
    const t = textoMedicion(f)
    expect(t).toContain('vivo')
    expect(t.split('\n').length).toBe(1)
  })
})
