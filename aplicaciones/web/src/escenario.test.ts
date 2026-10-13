import { describe, expect, it } from 'vitest'
import {
  anguloRotacion,
  aVisual,
  normalizarPosiciones,
  NUM_TEXTURAS,
  periodoRotacionDe,
  ROTACION_POR_ID,
  slotTextura,
  TEXTURAS_POR_ID,
  tipoPlaneta,
  urlTextura,
  VELOCIDAD_ROTACION,
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

describe('rotación propia', () => {
  it('cada cuerpo tiene su período real, no 24 h para todos', () => {
    // El defecto: el shader daba 86400 s a todo lo que no fuera Sol/Tierra/Luna.
    expect(periodoRotacionDe({ id: 'jupiter' })).toBe(ROTACION_POR_ID.jupiter)
    expect(periodoRotacionDe({ id: 'mercurio' })).toBe(ROTACION_POR_ID.mercurio)
    // Júpiter gira en 9,9 h y la Tierra en 23,9 h: no pueden ser iguales.
    expect(periodoRotacionDe({ id: 'jupiter' })).toBeLessThan(periodoRotacionDe({ id: 'tierra' }))
    expect(periodoRotacionDe({ id: 'mercurio' })).toBeGreaterThan(periodoRotacionDe({ id: 'tierra' }) * 50)
  })

  it('Venus y Urano son retrógrados', () => {
    expect(periodoRotacionDe({ id: 'venus' })).toBeLessThan(0)
    expect(periodoRotacionDe({ id: 'urano' })).toBeLessThan(0)
    expect(periodoRotacionDe({ id: 'tierra' })).toBeGreaterThan(0)
  })

  it('el valor del escenario manda sobre el catálogo', () => {
    expect(periodoRotacionDe({ id: 'tierra', rotacion: 1000 })).toBe(1000)
    // Un cero o un valor inválido cae al catálogo, no a un período infinito.
    expect(periodoRotacionDe({ id: 'tierra', rotacion: 0 })).toBe(ROTACION_POR_ID.tierra)
    expect(periodoRotacionDe({ id: 'desconocido' })).toBe(86400)
  })

  it('el ángulo está acotado a [0, 2π) y avanza con el reloj', () => {
    const cuerpo = { id: 'tierra' }
    for (const reloj of [0, 1e3, 1e6, 1e9, 1e12]) {
      const a = anguloRotacion(cuerpo, reloj)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(2 * Math.PI)
    }
    // Un día de rotación completa una vuelta: el ángulo vuelve a 0 (envuelve).
    const unDia = ROTACION_POR_ID.tierra / VELOCIDAD_ROTACION
    expect(anguloRotacion(cuerpo, unDia)).toBeCloseTo(0, 6)
    // Y a tres cuartos de vuelta le queda un cuarto para cerrar.
    expect(anguloRotacion(cuerpo, (unDia * 3) / 4)).toBeCloseTo((3 * Math.PI) / 2, 6)
    expect(anguloRotacion(cuerpo, unDia / 4)).toBeCloseTo(Math.PI / 2, 6)

    // Retrógrado: con período negativo la fase avanza al revés. Se comprueba
    // sobre la fase con signo (normalizada, Venus cae cerca de 2π y no se puede
    // comparar magnitudes).
    const faseTierra = anguloRotacion({ id: 'tierra' }, 1e5)
    const avance = (id: string, reloj: number): number => {
      const a0 = anguloRotacion({ id }, reloj)
      const a1 = anguloRotacion({ id }, reloj + 1)
      let d = a1 - a0
      if (d > Math.PI) d -= 2 * Math.PI
      if (d < -Math.PI) d += 2 * Math.PI
      return d
    }
    expect(avance('tierra', 1e5)).toBeGreaterThan(0)
    expect(avance('venus', 1e5)).toBeLessThan(0)
    expect(faseTierra).toBeGreaterThan(0)
  })

  it('la rotación es visible sin estroboscopio a 60 fps', () => {
    // Este es el motivo de usar reloj de pared: con tiempo sim la Tierra daba
    // 87,5° por fotograma y Júpiter 211° (giros invertidos o congelados).
    // El reloj de rotación avanza 1 s de pared por segundo real: un fotograma
    // son 1/60 s de ese reloj.
    const porFotograma = (reloj: number, id: string): number => {
      const a0 = anguloRotacion({ id }, reloj)
      const a1 = anguloRotacion({ id }, reloj + 1 / 60)
      // Diferencia angular mínima (evita el salto de 2π al dar la vuelta).
      const d = Math.abs(a1 - a0)
      return (Math.min(d, 2 * Math.PI - d) * 180) / Math.PI
    }
    for (const id of ['tierra', 'marte', 'jupiter', 'saturno']) {
      const g = porFotograma(1e7, id)
      expect(g, `${id} gira demasiado rápido`).toBeLessThan(45)
      expect(g, `${id} gira demasiado lento`).toBeGreaterThan(0.05)
    }
    // Júpiter (9,9 h) gira más rápido que la Tierra (23,9 h), como en la realidad.
    expect(porFotograma(1e7, 'jupiter')).toBeGreaterThan(porFotograma(1e7, 'tierra'))
  })
})
