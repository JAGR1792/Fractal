import { describe, expect, it } from 'vitest'
import {
  aSegmentos,
  crearEstela,
  empujarEstela,
  generarEstrellas,
  PASO_ESTELA_SIM,
  RegistroEstela,
} from './estelas'

/** Empuja una órbita circular de radio `r` con paso `paso` en tiempo sim. */
function orbitar(e: ReturnType<typeof crearEstela>, cuantos: number, paso = PASO_ESTELA_SIM, r = 10, epoca = 0): void {
  for (let k = 0; k < cuantos; k++) {
    const a = (k / cuantos) * Math.PI
    empujarEstela(e, [Math.cos(a) * r, 0, Math.sin(a) * r], k * paso, epoca, k * paso)
  }
}

describe('estelas y estrellas', () => {
  it('recorta las más viejas', () => {
    const e = crearEstela(3)
    for (let i = 0; i < 5; i++) empujarEstela(e, [i, 0, 0], i * 16)
    expect(e.puntos).toHaveLength(3)
    expect(e.puntos[0][0]).toBe(2)
  })

  it('corta el hueco: separación mayor que el paso', () => {
    const e = crearEstela(10)
    empujarEstela(e, [0, 0, 0], 0)
    empujarEstela(e, [1, 0, 0], PASO_ESTELA_SIM)
    // Hueco: faltan muestras en medio (10 pasos de separación).
    empujarEstela(e, [50, 0, 0], PASO_ESTELA_SIM * 11)
    const segs = aSegmentos(e, [1, 0, 0], PASO_ESTELA_SIM)
    // Solo el primer segmento sobrevive; el hueco se corta.
    expect(segs).toHaveLength(14)
  })

  it('corta el teletransporte aunque el salto temporal sea de un solo paso', () => {
    // Órbita suave y, en el paso siguiente, el cuerpo aparece al otro lado del
    // sistema. El guard de hueco no lo ve (la separación es exactamente un
    // paso): hace falta el guard espacial relativo al propio movimiento.
    const e = crearEstela(600)
    orbitar(e, 40)
    empujarEstela(e, [500, 300, 0], 40 * PASO_ESTELA_SIM)
    const segs = aSegmentos(e, [1, 0, 0], PASO_ESTELA_SIM)
    // 39 pasos suaves = 39 segmentos; el salto NO debe añadir un cuadro.
    expect(segs).toHaveLength(39 * 14)
    const saltos = []
    for (let i = 0; i < segs.length; i += 7) saltos.push(`${segs[i]},${segs[i + 1]},${segs[i + 2]}`)
    expect(saltos).not.toContain('500,300,0')
  })

  it('rompe la estela cuando cambia la época, sin limpiarla', () => {
    // Bifurcar siembra una órbita nueva: la posición es continua, la física no.
    const e = crearEstela(600)
    for (let i = 0; i < 10; i++) empujarEstela(e, [i * 0.5, 0, 0], i * PASO_ESTELA_SIM, 0)
    // Misma época: sí es el mismo vuelo, el trazo se une (9 segmentos).
    expect(aSegmentos(e, [1, 0, 0], PASO_ESTELA_SIM)).toHaveLength(9 * 14)

    // Época nueva arrancando justo donde acabó la anterior: la posición es
    // continua, así que solo la época puede romper el trazo. Los 9 segmentos de
    // cada tramo siguen dibujándose; lo que desaparece es el empalme.
    for (let i = 0; i < 10; i++) empujarEstela(e, [i * 0.5, 0, 0], (10 + i) * PASO_ESTELA_SIM, 1)
    expect(aSegmentos(e, [1, 0, 0], PASO_ESTELA_SIM)).toHaveLength(18 * 14)
  })

  it('segmentos con alpha creciente', () => {
    const e = crearEstela(10)
    empujarEstela(e, [0, 0, 0], 0)
    empujarEstela(e, [1, 0, 0], PASO_ESTELA_SIM)
    empujarEstela(e, [2, 0, 0], 2 * PASO_ESTELA_SIM)
    const segs = aSegmentos(e, [1, 0, 0], PASO_ESTELA_SIM)
    // 2 segmentos × 2 vértices × 7 floats
    expect(segs).toHaveLength(28)
    expect(segs[6]).toBeCloseTo(0, 5)
    expect(segs[segs.length - 1]).toBeCloseTo(2 / 3, 5)
  })

  it('estrellas deterministas sobre el cascarón', () => {
    const a = generarEstrellas(200, 42, 900)
    const b = generarEstrellas(200, 42, 900)
    expect(a).toEqual(b)
    expect(a.length).toBe(600)
    for (let i = 0; i < 200; i++) {
      const r = Math.hypot(a[i * 3], a[i * 3 + 1], a[i * 3 + 2])
      expect(r).toBeGreaterThan(890)
      expect(r).toBeLessThan(910)
    }
  })
})

describe('registro de estela en tiempo sim', () => {
  /** Posición de una órbita circular de radio 10, exacta. */
  const orbita = (periodo: number) => (t: number): [number, number, number] => {
    const a = (t / periodo) * 2 * Math.PI
    return [Math.cos(a) * 10, 0, Math.sin(a) * 10]
  }

  it('graba con paso constante en tiempo sim, no por fotograma', () => {
    const e = crearEstela(600)
    const reg = new RegistroEstela(PASO_ESTELA_SIM, 600)
    const pos = orbita(2.36e6)
    // 3 fotogramas de pared: el reloj sim avanza 20000 s cada uno (velocidad
    // baja). Con paso 12000 debe grabar 1-2 puntos por fotograma, no 3.
    let t = 0
    for (let f = 0; f < 3; f++) {
      t += 20000
      reg.registrar(e, t, 0, pos)
    }
    // El espaciado entre puntos es SIEMPRE el paso (salvo el primero).
    for (let k = 1; k < e.puntos.length; k++) {
      expect(e.puntos[k][3] - e.puntos[k - 1][3]).toBeCloseTo(PASO_ESTELA_SIM, 6)
    }
    expect(e.puntos.length).toBeGreaterThanOrEqual(3)
  })

  it('a velocidad alta rellena los pasos intermedios: la geometría no cambia', () => {
    const periodo = 2.36e6
    const pos = orbita(periodo)
    const lento = crearEstela(600)
    const rapido = crearEstela(600)
    const regLento = new RegistroEstela(PASO_ESTELA_SIM, 600)
    const regRapido = new RegistroEstela(PASO_ESTELA_SIM, 600)

    // Mismo tramo de tiempo sim (600 s de reloj sim), muestreado con dos
    // cadencias de fotograma muy distintas.
    let t = 0
    for (let f = 0; f < 600; f++) {
      t += 20000
      regLento.registrar(lento, t, 0, pos)
    }
    let t2 = 0
    for (let f = 0; f < 60; f++) {
      t2 += 200000
      regRapido.registrar(rapido, t2, 0, pos)
    }

    // Los tiempos grabados son idénticos: la estela no depende de los fps.
    const tiempos = (e: typeof lento) => e.puntos.map((p) => p[3])
    expect(tiempos(rapido)).toEqual(tiempos(lento))
    // Y por tanto las aristas también: nada de cuerdas más largas a más fps.
    const segs = aSegmentos(lento, [1, 1, 1], PASO_ESTELA_SIM)
    expect(aSegmentos(rapido, [1, 1, 1], PASO_ESTELA_SIM)).toEqual(segs)
  })

  it('no graba por delante del reloj y se reancla si el tiempo retrocede', () => {
    const e = crearEstela(600)
    const reg = new RegistroEstela(PASO_ESTELA_SIM, 600)
    const pos = orbita(2.36e6)
    // La primera llamada solo fija la referencia: no inventa pasado.
    expect(reg.registrar(e, -5, 0, pos)).toBe(0)
    expect(e.puntos).toHaveLength(0)
    reg.registrar(e, 0, 0, pos)
    const antes = e.puntos.length

    // Tiempo que retrocede (no debería pasar): se reancla y sigue grabando, no
    // se queda mudo para siempre.
    reg.registrar(e, -1000, 0, pos)
    expect(e.puntos.length).toBeGreaterThan(antes)
    // Y a partir de ahí vuelve al paso constante.
    const ultimo = e.puntos[e.puntos.length - 1][3]
    reg.registrar(e, ultimo + PASO_ESTELA_SIM, 0, pos)
    expect(e.puntos[e.puntos.length - 1][3]).toBeCloseTo(ultimo + PASO_ESTELA_SIM, 6)
  })

  it('un hueco enorme reancla en vez de rellenar miles de puntos', () => {
    const e = crearEstela(600)
    const reg = new RegistroEstela(PASO_ESTELA_SIM, 600)
    const pos = orbita(2.36e6)
    reg.registrar(e, 0, 0, pos)
    const antes = e.puntos.length
    // Salto de 100000 pasos: no puede intentar rellenarlos todos de golpe.
    reg.registrar(e, PASO_ESTELA_SIM * 100_000, 0, pos)
    expect(e.puntos.length - antes).toBeLessThanOrEqual(1)
    // Y la estela sigue viva después (el próximo paso sí se graba).
    reg.registrar(e, PASO_ESTELA_SIM * 100_001, 0, pos)
    expect(e.puntos.length).toBeGreaterThan(antes)
  })
})
