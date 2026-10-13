import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  anguloRotacion,
  aVisual,
  distanciaCamara,
  escalaMundo,
  FOV_VERTICAL_GRADOS,
  MAX_RADIO_VISUAL_RELATIVO,
  normalizarPosiciones,
  NUM_TEXTURAS,
  periodoRotacionDe,
  radioVisualMayor,
  ROTACION_POR_ID,
  slotTextura,
  TEXTURAS_POR_ID,
  tipoPlaneta,
  urlTextura,
  VELOCIDAD_ROTACION,
  type CuerpoVisual,
  type Escenario,
} from './escenario'

describe('escala visual', () => {
  it('separa radio físico de visual', () => {
    const vis = aVisual({
      id: 'x', nombre: 'X', descripcion: '', cuerpos: [
        { id: 'a', nombre: 'A', masa: 1, radio: 6.371e6, posicion: [0, 0, 0], velocidad: [0, 0, 0] },
        { id: 'b', nombre: 'B', masa: 1, radio: 1.737e6, posicion: [3.844e8, 0, 0], velocidad: [0, 0, 0] },
      ],
    })
    // El radio visual no es el físico: está comprimido, pero conserva el orden.
    expect(vis[0].radioVisual).toBeGreaterThan(vis[1].radioVisual)
    expect(vis[0].radioVisual).toBeLessThan(vis[0].radio)
  })

  it('ningún cuerpo tapa la órbita de otro (el defecto del Sistema Solar)', () => {
    // Este es el contrato que faltaba: con la fórmula absoluta anterior, el Sol
    // salía con radio 5,02 unidades mientras Mercurio orbita a 0,62, así que
    // Mercurio, Venus, la Tierra y Marte quedaban DENTRO del Sol y solo se veían
    // los planetas exteriores, que son los más lentos. El sistema parecía
    // congelado.
    const sistema = aVisual({
      id: 'solar', nombre: 'Solar', descripcion: '', cuerpos: [
        { id: 'sol', nombre: 'Sol', masa: 1.989e30, radio: 6.957e8, posicion: [0, 0, 0], velocidad: [0, 0, 0] },
        { id: 'mercurio', nombre: 'Mercurio', masa: 3.285e23, radio: 2.4397e6, posicion: [5.79e10, 0, 0], velocidad: [0, 47360, 0] },
        { id: 'tierra', nombre: 'Tierra', masa: 5.972e24, radio: 6.371e6, posicion: [1.496e11, 0, 0], velocidad: [0, 29780, 0] },
        { id: 'jupiter', nombre: 'Jupiter', masa: 1.898e27, radio: 6.9911e7, posicion: [7.785e11, 0, 0], velocidad: [0, 13070, 0] },
        { id: 'neptuno', nombre: 'Neptuno', masa: 1.024e26, radio: 2.4622e7, posicion: [4.495e12, 0, 0], velocidad: [0, 5430, 0] },
      ],
    })
    const mapa = normalizarPosiciones(sistema)
    for (const c of sistema) {
      const centro = mapa.get(c.id)!
      const rOrbita = Math.hypot(centro[0], centro[1], centro[2])
      if (rOrbita === 0) continue // el propio centro
      // El cuerpo (y sobre todo el Sol) tiene que caber dentro de su órbita.
      expect(c.radioVisual, `${c.id} tapa su propia órbita`).toBeLessThan(rOrbita)
    }
    // Y en concreto el Sol, que no orbita: debe caber en la órbita más interna.
    const sol = sistema.find((c) => c.id === 'sol')!
    const mercurio = mapa.get('mercurio')!
    const orbitaMercurio = Math.hypot(mercurio[0], mercurio[1], mercurio[2])
    expect(sol.radioVisual).toBeLessThan(orbitaMercurio)
    // Con margen: no al borde, o rozaría el planeta más interno.
    expect(sol.radioVisual / orbitaMercurio).toBeLessThanOrEqual(MAX_RADIO_VISUAL_RELATIVO + 1e-9)
    // Y sigue siendo el mayor con diferencia (el Sol domina la escena).
    expect(sol.radioVisual).toBeGreaterThan(sistema.find((c) => c.id === 'jupiter')!.radioVisual)
  })

  it('la cámara encuadra el sistema entero, no un cuerpo', () => {
    const leer = (cuerpos: CuerpoVisual[]): CuerpoVisual[] =>
      aVisual({ id: 'x', nombre: 'X', descripcion: '', cuerpos })
    const chico = leer([
      { id: 'tierra', nombre: 'T', masa: 5.972e24, radio: 6.371e6, posicion: [0, 0, 0], velocidad: [0, 0, 0] },
      { id: 'luna', nombre: 'L', masa: 7.34e22, radio: 1.737e6, posicion: [3.844e8, 0, 0], velocidad: [0, 0, 0] },
    ])
    const grande = leer([
      { id: 'sol', nombre: 'S', masa: 1.989e30, radio: 6.957e8, posicion: [0, 0, 0], velocidad: [0, 0, 0] },
      { id: 'neptuno', nombre: 'N', masa: 1.024e26, radio: 2.4622e7, posicion: [4.495e12, 0, 0], velocidad: [0, 5430, 0] },
    ])
    // La cámara encuadra el SISTEMA, así que sale de su extensión en unidades
    // MUNDO (donde las posiciones se normalizan al cuerpo más lejano), no del
    // número de cuerpos ni del radio de uno solo. Comparar extensiones en
    // metros no vale: la normalización iguala los dos sistemas a ~40 unidades.
    const extension = (vis: CuerpoVisual[]): number => {
      const escala = escalaMundo(vis)
      let ext = 0
      for (const c of vis) {
        const r = Math.hypot(c.posicion[0], c.posicion[1], c.posicion[2]) * escala + c.radioVisual
        if (r > ext) ext = r
      }
      return ext
    }
    // Es proporcional a la extensión, con el mismo factor en los dos casos.
    const factor = (vis: CuerpoVisual[]): number => distanciaCamara(vis) / extension(vis)
    expect(factor(chico)).toBeCloseTo(factor(grande), 6)

    // Y la órbita más externa cabe en la semialtura visible.
    for (const vis of [chico, grande]) {
      const d = distanciaCamara(vis)
      const semialtura = d * Math.tan(((FOV_VERTICAL_GRADOS * Math.PI) / 180) / 2)
      expect(semialtura, 'la órbita externa se sale de pantalla').toBeGreaterThan(extension(vis))
    }
  })

  /**
   * Los escenarios REALES del repositorio, no sistemas sintéticos.
   *
   * Hacía falta: los tests de arriba usaban dos cuerpos con la misma masa y no
   * detectaron que en Tierra-Luna (masas muy distintas, Tierra en el
   * baricentro) la Tierra salía 29 veces más grande que su propia órbita, ni que
   * el Sol del Sistema Solar quedaba por debajo del píxel con el suelo de cámara
   * anterior.
   */
  describe('escenarios reales de datos/escenarios', () => {
    const leer = (id: string): CuerpoVisual[] => {
      const ruta = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'datos', 'escenarios', `${id}.json`)
      return aVisual(JSON.parse(readFileSync(ruta, 'utf8')) as Escenario)
    }

    for (const id of ['dos_cuerpos', 'sistema_solar']) {
      it(`${id}: ningún cuerpo tapa a otro ni su órbita`, () => {
        const vis = leer(id)
        const mapa = normalizarPosiciones(vis)
        const radio = (c: CuerpoVisual): number => c.radioVisual
        const centroDe = (c: CuerpoVisual): [number, number, number] => mapa.get(c.id)!

        // 1. Dos esferas no pueden solaparse: distancia > suma de radios.
        //    (Ojo: NO se compara el central con su distancia al origen, porque
        //    en Tierra-Luna el central está en el baricentro, a 0,49 unidades.)
        for (let i = 0; i < vis.length; i++) {
          for (let j = i + 1; j < vis.length; j++) {
            const a = centroDe(vis[i])
            const b = centroDe(vis[j])
            const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
            expect(d, `${id}: ${vis[i].id} y ${vis[j].id} se solapan`).toBeGreaterThan(
              radio(vis[i]) + radio(vis[j]),
            )
          }
        }

        // 2. El cuerpo central no se traga la órbita del más interno.
        let central = 0
        for (let i = 1; i < vis.length; i++) {
          if (vis[i].masa > vis[central].masa) central = i
        }
        const pc = centroDe(vis[central])
        let orbitaMinima = Infinity
        for (const c of vis) {
          if (c.id === vis[central].id) continue
          const p = centroDe(c)
          const d = Math.hypot(p[0] - pc[0], p[1] - pc[1], p[2] - pc[2])
          if (d < orbitaMinima) orbitaMinima = d
        }
        expect(Number.isFinite(orbitaMinima), `${id}: sin órbitas`).toBe(true)
        expect(
          radio(vis[central]),
          `${id}: ${vis[central].id} se traga la órbita interna`,
        ).toBeLessThan(orbitaMinima)

        // 3. Y sigue siendo el mayor: la jerarquía no se invierte.
        const mayor = vis.reduce((a, b) => (radio(b) > radio(a) ? b : a))
        expect(mayor.id, `${id}: el mayor debería ser el central`).toBe(vis[central].id)
      })

      it(`${id}: el cuerpo mayor no queda en un píxel`, () => {
        const vis = leer(id)
        const cam = distanciaCamara(vis)
        const mayor = radioVisualMayor(vis)
        // Fracción del alto de pantalla que ocupa el cuerpo mayor: el radio
        // dividido por la semialtura visible a esa distancia.
        const semialtura = cam * Math.tan(((FOV_VERTICAL_GRADOS * Math.PI) / 180) / 2)
        const fraccion = mayor / semialtura
        // Al menos un puñado de píxeles en un viewport de 900 de alto. Con el
        // Sol del Sistema Solar sale ~0,9% (unos 8 px): pequeño —el sistema es
        // casi todo vacío— pero visible y con el resto de órbitas en cuadro.
        expect(fraccion * 900, `${id}: el cuerpo mayor sale invisible`).toBeGreaterThan(4)
        expect(cam).toBeGreaterThan(mayor)
      })
    }
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

describe('rotación propia', () => {  it('cada cuerpo tiene su período real, no 24 h para todos', () => {
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
