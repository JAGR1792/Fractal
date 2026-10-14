import { describe, expect, it } from 'vitest'
import { NucleoReproduccion } from './nucleo-reproduccion'

type S6 = [number, number, number, number, number, number]

function bloque(t: number, cuerpos: S6[]): Float32Array {
  const b = new Float32Array(1 + cuerpos.length * 6)
  b[0] = t
  cuerpos.forEach((c, i) => b.set(c, 1 + i * 6))
  return b
}

const DOS = (dx: number): S6[] => [
  [dx, 0, 0, 0, 0, 0],
  [40 + dx, 0, 0, 0, 0, 0],
]

describe('núcleo de reproducción', () => {
  it('sin fuente arranca cargando, congela el diorama y no inventa tiempo', () => {
    const semilla = new Float32Array([1, 2, 3, 0, 4, 5, 6, 0])
    const n = new NucleoReproduccion(2, null, null, semilla)
    expect(n.estado).toBe('cargando')
    expect(n.avanzarCuadro(0.016, 1, false)).toBe('cargando')
    expect(Array.from(n.centros)).toEqual([1, 2, 3, 0, 4, 5, 6, 0])
    expect(n.leerTiempo()).toBeNaN()
    expect(n.leerBloqueActual()).toBeNull()
  })

  it('con fuente interpola con el mapeo mundo [x*e, z*e, y*e]', () => {
    const bloques = [bloque(0, DOS(0)), bloque(10, DOS(10)), bloque(20, DOS(20))]
    const n = new NucleoReproduccion(2, null, { bloques, escala: 2, tCalculoMs: 0 })
    expect(n.estado).toBe('vivo')
    // t=0 exacto: cuerpo 0 en x=0, cuerpo 1 en x=40 → mundo x=0 y x=80.
    expect(n.centros[0]).toBeCloseTo(0, 9)
    expect(n.centros[4]).toBeCloseTo(80, 9)
    // El mapeo cruza y/z: SI (7, 8, 9) → mundo (7e, 9e, 8e).
    const b2 = [bloque(0, [[7, 8, 9, 0, 0, 0]]), bloque(10, [[17, 18, 19, 0, 0, 0]])]
    const m = new NucleoReproduccion(1, null, { bloques: b2, escala: 1, tCalculoMs: 0 })
    expect(m.centros[0]).toBeCloseTo(7, 6)
    expect(m.centros[1]).toBeCloseTo(9, 6)
    expect(m.centros[2]).toBeCloseTo(8, 6)
  })

  it('el reloj mostrado nunca retrocede aunque poden por detrás', () => {
    const bloques = [bloque(0, DOS(0)), bloque(100, DOS(0)), bloque(200, DOS(0)), bloque(300, DOS(0))]
    const n = new NucleoReproduccion(2, 800, { bloques, escala: 1, tCalculoMs: 0 })
    n.avanzarCuadro(1, 1, false) // ritmo 800/s → t=100 (techo 200 con margen)
    const t1 = n.leerTiempo()
    expect(t1).toBeGreaterThan(0)
    n.podar(1000) // poda agresiva: el techo caería, el mostrado no
    n.avanzarCuadro(1, 1, false)
    expect(n.leerTiempo()).toBeGreaterThanOrEqual(t1)
  })

  it('fijarFuente copia (el dueño puede mutar su arreglo en paz)', () => {
    const bloques = [bloque(0, DOS(0)), bloque(10, DOS(10))]
    const n = new NucleoReproduccion(2, null, { bloques, escala: 1, tCalculoMs: 0 })
    bloques.push(bloque(20, DOS(20)))
    bloques.splice(0, 1)
    // El núcleo no se entera: sigue con sus 2 bloques copiados.
    expect(n.leerBloqueActual()).not.toBeNull()
    n.fijarFuente(null)
    expect(n.estado).toBe('cargando')
    expect(n.leerTiempo()).toBeNaN()
  })

  it('ritmo inválido se ignora y anexar/podar miden', () => {
    const bloques = [bloque(0, DOS(0)), bloque(10, DOS(10))]
    // Período 800 → ritmo 100 (una vuelta cada 8 s de pared).
    const n = new NucleoReproduccion(2, 800, { bloques, escala: 1, tCalculoMs: 0 })
    n.fijarRitmo(-5)
    n.fijarRitmo(NaN)
    expect(n.leerRitmo()).toBe(100)
    n.fijarRitmo(50)
    expect(n.leerRitmo()).toBe(50)
    expect(n.anexarBloques([])).toBe(0)
    expect(n.anexarBloques([bloque(20, DOS(20))])).toBe(1)
    expect(n.podar(-1)).toBe(0)
    const f = n.medir()
    expect(f.bloquesAnexados).toBe(1)
    expect(f.estado).toBe('vivo')
  })

  it('posicionEn escribe el scratch y leerPosicionesSI deshace el mapeo', () => {
    const bloques = [bloque(0, DOS(0)), bloque(10, DOS(10))]
    const n = new NucleoReproduccion(2, null, { bloques, escala: 2, tCalculoMs: 0 })
    const salida = [0, 0, 0]
    expect(n.posicionEn(0, 5, salida)).toBe(false)
    expect(n.posicionEn(0, 1, salida)).toBe(true)
    expect(salida[0]).toBeCloseTo(80, 6)
    const si = n.leerPosicionesSI(1)
    expect(si).not.toBeNull()
    // Mundo x=80 con e=2 → SI x=40; el y/z cruzados vuelven a su sitio.
    expect(si![3]).toBeCloseTo(40, 6)
    expect(si![4]).toBeCloseTo(0, 9)
    expect(si![5]).toBeCloseTo(0, 9)
  })
})
