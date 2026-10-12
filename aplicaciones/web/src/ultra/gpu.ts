/* eslint-disable @typescript-eslint/no-explicit-any */
import { camaraInicial, conectarControles, invertir, matrizProyeccion, matrizVista, multiplicar, ojoDeCamara, rayoDesdePantalla, tocaEsfera, type EstadoCamara } from '../camara'
import { aVisual, cargarEscenario, escalaMundo, normalizarPosiciones, tipoPlaneta, urlTextura, type CuerpoVisual } from '../escenario'
import type { FuenteEstados } from '../api'
import { detectarLimiteBucle, interpolarBloque } from '../binario'
import planetaWGSL from './sombreadores/planeta.wgsl?raw'
import orbitaWGSL from './sombreadores/orbita.wgsl?raw'
import puntosWGSL from './sombreadores/puntos.wgsl?raw'
import { aSegmentos, crearEstela, empujarEstela, generarEstrellas, type Estela } from '../estelas'
import { actualizar, aIntercalado, crearSistema, explotar, puedeExplotar } from '../particulas'
import { detectarImpactos } from '../mecanica'

// Usos de textura con nombre (no hex de memoria): GPUTextureUsage del navegador.
const TU: any = (globalThis as any).GPUTextureUsage ?? { TEXTURE_BINDING: 0x10, COPY_DST: 0x08, RENDER_ATTACHMENT: 0x40 }

/**
 * ULTRA: WebGPU nativo + instancing + órbitas merged.
 * Sin motores. 1 draw de planetas + 1 draw de órbitas.
 */

export interface ControlUltra {
  alternarPausa: () => void
  fijarVelocidad: (v: number) => void
  seleccionar: (id: string | null) => void
  /** Cambia la fuente de fotogramas en vivo (`null` = demo local). */
  /** Cambia la fuente (`limpiar=false` conserva estelas en encadenados). */
  fijarFuente: (f: FuenteEstados | null, limpiar?: boolean) => void
  /** Segundos simulados actuales (para el reloj de la barra). */
  leerTiempo: () => number
  /** Fracción 0..1 del tramo actual (para encadenar antes del final). */
  leerProgreso: () => number
  /** Posiciones SI actuales (para bifurcar sin saltos). `null` si no hay. */
  leerPosicionesActuales: () => number[] | null
  /** Bloque completo interpolado al instante actual (t + xyz + vxvyvz). */
  leerBloqueActual: () => Float32Array | null
  destruir: () => void
  leerSeleccion: () => string | null
}

function esferaUnitaria(lat = 24, lon = 18): { posiciones: Float32Array; normales: Float32Array; uvs: Float32Array; indices: Uint16Array } {
  const pos: number[] = []
  const nor: number[] = []
  const uvs: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= lat; i++) {
    const theta = (i / lat) * Math.PI
    for (let j = 0; j <= lon; j++) {
      const phi = (j / lon) * Math.PI * 2
      const x = Math.sin(theta) * Math.cos(phi)
      const y = Math.cos(theta)
      const z = Math.sin(theta) * Math.sin(phi)
      pos.push(x, y, z)
      nor.push(x, y, z)
      // UV equirect: v=0 en el polo norte (primera fila de la imagen).
      // u invertida: sin el (1 - ...) el este sale a la izquierda (espejo).
      uvs.push(1 - j / lon, i / lat)
    }
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j
      const b = a + lon + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  return { posiciones: new Float32Array(pos), normales: new Float32Array(nor), uvs: new Float32Array(uvs), indices: new Uint16Array(idx) }
}

/** Carga una textura local a GPU (ver `public/texturas/LEEME.md`). */
async function cargarTextura(device: any, url: string, colorFondo: [number, number, number, number]): Promise<any> {
  // Constantes con nombre: inmunes a errores de memoria con los bits hex.
  const USO_MUESTREO = TU.TEXTURE_BINDING | TU.COPY_DST
  const crearReserva = (): any => {
    const reserva: any = device.createTexture({ size: [2, 2], format: 'rgba8unorm', usage: USO_MUESTREO })
    device.queue.writeTexture(
      { texture: reserva },
      new Uint8Array(colorFondo.map((v) => Math.round(v * 255))),
      { bytesPerRow: 8 },
      [2, 2],
    )
    return reserva
  }
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const mapaBits = await createImageBitmap(await res.blob())
    // Vía canvas2D + writeTexture: solo exige COPY_DST (sin RENDER_ATTACHMENT).
    const lienzo2d = document.createElement('canvas')
    lienzo2d.width = mapaBits.width
    lienzo2d.height = mapaBits.height
    const ctx = lienzo2d.getContext('2d')
    if (!ctx) throw new Error('sin contexto 2d')
    ctx.drawImage(mapaBits, 0, 0)
    const datos = ctx.getImageData(0, 0, lienzo2d.width, lienzo2d.height)
    const textura: any = device.createTexture({
      size: [lienzo2d.width, lienzo2d.height],
      format: 'rgba8unorm',
      usage: USO_MUESTREO,
    })
    // writeTexture exige bytesPerRow múltiplo de 256: rellenar si hace falta.
    const fila = lienzo2d.width * 4
    const paso = Math.ceil(fila / 256) * 256
    const denso: Uint8Array = paso === fila
      ? new Uint8Array(datos.data.buffer)
      : (() => {
          const buf = new Uint8Array(paso * lienzo2d.height)
          for (let y = 0; y < lienzo2d.height; y++) {
            buf.set(datos.data.subarray(y * fila, (y + 1) * fila), y * paso)
          }
          return buf
        })()
    device.queue.writeTexture(
      { texture: textura },
      denso,
      { bytesPerRow: paso },
      [lienzo2d.width, lienzo2d.height],
    )
    return textura
  } catch (e) {
    console.warn(`[fractal/ultra] sin textura ${url}, uso color plano:`, e)
    return crearReserva()
  }
}

export async function montarUltra(
  lienzo: HTMLCanvasElement,
  urlEscenario = '/datos/dos_cuerpos.json',
  fuente: FuenteEstados | null = null,
): Promise<ControlUltra> {
  const nav: any = navigator as any
  if (!nav.gpu) throw new Error('sin WebGPU')
  const adapter: any = await nav.gpu.requestAdapter()
  if (!adapter) throw new Error('sin adapter WebGPU')
  const device: any = await adapter.requestDevice()
  device.addEventListener?.('uncapturederror', (e: any) => {
    console.error('[fractal/ultra] WebGPU error:', e?.error ?? e)
    const aviso = document.getElementById('aviso')
    // Conservar el PRIMER error: los siguientes son solo cascada del submit.
    if (aviso && !aviso.dataset.error) {
      aviso.dataset.error = '1'
      const msg = String(e?.error?.message ?? e?.message ?? e)
      aviso.textContent = `ULTRA error: ${msg}`
      document.title = `ULTRA ERROR: ${msg.slice(0, 100)}`
    }
  })
  const contexto: any = (lienzo as any).getContext('webgpu')
  if (!contexto) throw new Error('sin contexto webgpu')
  const formato: string = nav.gpu.getPreferredCanvasFormat()
  contexto.configure({ device, format: formato, alphaMode: 'opaque' })

  const escenario = await cargarEscenario(urlEscenario).catch(() => null)
  const visuales: CuerpoVisual[] = escenario
    ? aVisual(escenario)
    : [
        { id: 'sol', nombre: 'Sol', masa: 1.989e30, radio: 6.957e8, posicion: [0, 0, 0], velocidad: [0, 0, 0], radioVisual: 5, color: [1, 0.85, 0.2] },
        { id: 'tierra', nombre: 'Tierra', masa: 5.972e24, radio: 6.371e6, posicion: [1.496e11, 0, 0], velocidad: [0, 29780, 0], radioVisual: 1.6, color: [0.2, 0.45, 0.95] },
      ]
  const posMundo = normalizarPosiciones(visuales)

  const cam: EstadoCamara = camaraInicial(70)
  let necesitaVista = true
  const desconectar = conectarControles(lienzo, cam, () => { necesitaVista = true })

  // Geometría esfera
  const esfera = esferaUnitaria()
  const bufVert: any = device.createBuffer({ size: esfera.posiciones.byteLength, usage: 0x20 | 0x8, mappedAtCreation: true })
  new Float32Array(bufVert.getMappedRange()).set(esfera.posiciones)
  bufVert.unmap()
  const bufNor: any = device.createBuffer({ size: esfera.normales.byteLength, usage: 0x20 | 0x8, mappedAtCreation: true })
  new Float32Array(bufNor.getMappedRange()).set(esfera.normales)
  bufNor.unmap()
  const bufIdx: any = device.createBuffer({ size: esfera.indices.byteLength, usage: 0x10 | 0x8, mappedAtCreation: true })
  new Uint16Array(bufIdx.getMappedRange()).set(esfera.indices)
  bufIdx.unmap()
  const bufUV: any = device.createBuffer({ size: esfera.uvs.byteLength, usage: 0x20 | 0x8, mappedAtCreation: true })
  new Float32Array(bufUV.getMappedRange()).set(esfera.uvs)
  bufUV.unmap()

  // Texturas vendorizadas (tierra/luna). El catálogo vive en escenario.ts
  // para que el sandbox registre más planetas (ver public/texturas/LEEME.md).
  const texTierra: any = await cargarTextura(device, urlTextura('tierra') ?? '', [0.12, 0.3, 0.75, 1])
  const texLuna: any = await cargarTextura(device, urlTextura('luna') ?? '', [0.62, 0.62, 0.66, 1])
  const muestreador: any = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'clamp-to-edge' })

  // Storage: centros (xyz + tipo visual) + datos (radio + color)
  const n = visuales.length
  const centros = new Float32Array(n * 4)
  const datos = new Float32Array(n * 4)
  visuales.forEach((c, i) => {
    const p = posMundo.get(c.id) ?? [0, 0, 0]
    centros.set([p[0], p[1], p[2], tipoPlaneta(c.id)], i * 4)
    datos.set([c.radioVisual, c.color[0], c.color[1], c.color[2]], i * 4)
  })
  const bufCentros: any = device.createBuffer({ size: centros.byteLength, usage: 0x8 | 0x80, mappedAtCreation: true })
  new Float32Array(bufCentros.getMappedRange()).set(centros)
  bufCentros.unmap()
  const bufDatos: any = device.createBuffer({ size: datos.byteLength, usage: 0x8 | 0x80, mappedAtCreation: true })
  new Float32Array(bufDatos.getMappedRange()).set(datos)
  bufDatos.unmap()

  // Uniformes: viewProj(64) + luzDir(12)+tiempo(4) + camPos(12)+brillo(4) + spin(4)+pad → 128 por alineación
  const bufUni: any = device.createBuffer({ size: 128, usage: 0x40 | 0x8 })
  const modPlaneta: any = device.createShaderModule({ code: planetaWGSL })
  const modOrbita: any = device.createShaderModule({ code: orbitaWGSL })
  const pipePlaneta: any = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: modPlaneta, entryPoint: 'vs', buffers: [
      { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
      { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
      { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }] },
    ]},
    fragment: { module: modPlaneta, entryPoint: 'fs', targets: [{ format: formato }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' },
  })

  // Sin órbitas decorativas: la única órbita honesta es la estela viva
  // (trayectoria real recorrida). Los círculos fijos mentían el plano.
  const pipeOrbita: any = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: modOrbita, entryPoint: 'vs', buffers: [{ arrayStride: 28, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32' },
    ]}]},
    fragment: { module: modOrbita, entryPoint: 'fs', targets: [{ format: formato, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } }] },
    primitive: { topology: 'line-list' },
    depthStencil: { depthWriteEnabled: false, depthCompare: 'less', format: 'depth24plus' },
  })
  let texProf: any = device.createTexture({ size: [lienzo.width || 800, lienzo.height || 600], sampleCount: 1, format: 'depth24plus', usage: TU.RENDER_ATTACHMENT })
  let vistaProf: any = texProf.createView()

  const grupoPlaneta: any = device.createBindGroup({ layout: pipePlaneta.getBindGroupLayout(0), entries: [
    { binding: 0, resource: { buffer: bufUni } },
    { binding: 1, resource: { buffer: bufCentros } },
    { binding: 2, resource: { buffer: bufDatos } },
    { binding: 3, resource: texTierra.createView() },
    { binding: 4, resource: texLuna.createView() },
    { binding: 5, resource: muestreador },
  ]})
  const grupoOrbita: any = device.createBindGroup({ layout: pipeOrbita.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bufUni } }]})

  // Estrellas fijas: 1500 puntos en cascarón de radio 900 (ver puntos.wgsl).
  const modPuntos: any = device.createShaderModule({ code: puntosWGSL })
  const pipePuntos: any = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: modPuntos, entryPoint: 'vs', buffers: [{ arrayStride: 28, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32' },
      { shaderLocation: 2, offset: 16, format: 'float32x3' },
    ]}]},
    fragment: { module: modPuntos, entryPoint: 'fs', targets: [{ format: formato, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } }] },
    primitive: { topology: 'point-list' },
    depthStencil: { depthWriteEnabled: false, depthCompare: 'less', format: 'depth24plus' },
  })
  const posEstrellas = generarEstrellas(1500, 1234, 900)
  const arrEstrellas = new Float32Array(1500 * 7)
  for (let i = 0; i < 1500; i++) {
    const b = 0.3 + 0.7 * (((i * 2654435761) >>> 0) / 4294967296)
    arrEstrellas.set([posEstrellas[i * 3], posEstrellas[i * 3 + 1], posEstrellas[i * 3 + 2], b, 0.85, 0.9, 1.0], i * 7)
  }
  const bufEstrellas: any = device.createBuffer({ size: arrEstrellas.byteLength, usage: 0x20 | 0x8, mappedAtCreation: true })
  new Float32Array(bufEstrellas.getMappedRange()).set(arrEstrellas)
  bufEstrellas.unmap()
  const grupoPuntos: any = device.createBindGroup({ layout: pipePuntos.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bufUni } }]})
  // Chispas de explosión: buffer dinámico con el mismo layout.
  const bufChispas: any = device.createBuffer({ size: Math.max(800 * 7 * 4, 16), usage: 0x20 | 0x8 })
  const chispas = crearSistema(800)
  const ultimasChispas = new Map<string, number>()

  // Estelas: últimos 600 centros por cuerpo (una órbita entera), un draw merged.
  const LARGO_ESTELA = 600
  const estelas: Estela[] = visuales.map(() => crearEstela(LARGO_ESTELA))
  const bufEstelas: any = device.createBuffer({ size: Math.max(n * LARGO_ESTELA * 2 * 7 * 4, 16), usage: 0x20 | 0x8 })
  let tikEstela = 0

  let pausado = false
  let velocidad = 1
  let seleccionado: string | null = null
  let angulo = 0
  let vivo = true
  let cuadros = 0
  const tituloBase = document.title
  const t0 = performance.now()
  let ultimoMs = t0
  let tiempoFuente = 0
  // Segundos SIMULADOS para la rotación propia (ver periodoRotacion en WGSL).
  let spinSim = 0
  let ultimosCentros: Float32Array = centros
  const radios = visuales.map((c) => c.radioVisual * 1.2)
  // Fundido de empalme (~1 s): mezcla la imagen previa con la nueva fuente.
  let fondo: Float32Array | null = null
  let tFondo = 1
  // Cuerpo que la cámara persigue (clic lo fija, R o clic al vacío lo suelta).
  let seguido: string | null = null

  /** Cuerpo bajo el cursor (rayo-esfera sobre los últimos centros). */
  function cuerpoBajoCursor(e: MouseEvent): string | null {
    const rect = lienzo.getBoundingClientRect()
    const w = lienzo.clientWidth || 800
    const h = lienzo.clientHeight || 600
    const inv = invertir(multiplicar(matrizProyeccion(w / h), matrizVista(cam)))
    const rayo = rayoDesdePantalla(e.clientX - rect.left, e.clientY - rect.top, w, h, inv)
    let mejor: string | null = null
    let mejorT = Infinity
    visuales.forEach((v, i) => {
      const centro: [number, number, number] = [ultimosCentros[i * 4], ultimosCentros[i * 4 + 1], ultimosCentros[i * 4 + 2]]
      const t = tocaEsfera(rayo, centro, radios[i] ?? 1)
      if (t !== null && t < mejorT) {
        mejorT = t
        mejor = v.id
      }
    })
    return mejor
  }

  function avisarSeleccion(id: string | null): void {
    seleccionado = id
    seguido = id // la cámara persigue al seleccionado (clic al vacío la suelta)
    window.dispatchEvent(new CustomEvent('fractal-seleccion', { detail: { id } }))
  }

  // Clic = seleccionar (si no fue arrastre); doble clic = centrar cámara.
  let downX = 0
  let downY = 0
  const alDown = (e: PointerEvent): void => {
    downX = e.clientX
    downY = e.clientY
  }
  const alClick = (e: MouseEvent): void => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return
    avisarSeleccion(cuerpoBajoCursor(e))
  }
  const alDoble = (e: MouseEvent): void => {
    const id = cuerpoBajoCursor(e)
    if (id === null) return
    const i = visuales.findIndex((v) => v.id === id)
    if (i < 0) return
    cam.objetivo = [ultimosCentros[i * 4], ultimosCentros[i * 4 + 1], ultimosCentros[i * 4 + 2]]
    avisarSeleccion(id)
  }
  // R resetea la pose en camara.ts: aquí además se suelta el perseguido.
  const alTecla = (e: KeyboardEvent): void => {
    if (e.key === 'r' || e.key === 'R') seguido = null
  }
  lienzo.addEventListener('pointerdown', alDown)
  lienzo.addEventListener('click', alClick)
  lienzo.addEventListener('dblclick', alDoble)
  window.addEventListener('keydown', alTecla)

  // Servidor: interpola entre fotogramas binarios si hay historial válido.
  let bloques: Float32Array[] | null = fuente && fuente.bloques.length >= 2 ? fuente.bloques : null
  let escalaFuente = fuente?.escala ?? 1
  // Último bloque del bucle: primera órbita completa del cuerpo 1 alrededor
  // del 0 (detectada por ángulo). Loopear ahí es física continua hacia
  // adelante: sin saltos y sin viajes en el tiempo.
  let limiteBucle = 0

  function detectarBucle(): number {
    return detectarLimiteBucle(bloques ?? [], visuales.length)
  }

  function rangoFuente(): { ini: number; fin: number } {
    if (!bloques || bloques.length < 2) return { ini: 0, fin: 0 }
    const fin = bloques[Math.min(limiteBucle, bloques.length - 1)][0]
    return { ini: bloques[0][0], fin }
  }

  // El bucle se calcula una vez por fuente (montaje y cada fijarFuente).
  limiteBucle = detectarBucle()
  // Si se monta YA con servidor, el fondo es el círculo demo (ángulo 0):
  // el primer segundo interpola demo→física real, sin salto único.
  if (bloques) {
    fondo = centros.slice()
    tFondo = 0
  }

  /** Escribe en `c` los centros interpolados del instante `t` (segundos sim). */
  function centrosServidor(c: Float32Array, t: number): void {
    if (!bloques) return
    const b = interpolarBloque(bloques, limiteBucle, t)
    if (!b) return
    visuales.forEach((_v, i) => {
      const base = 1 + i * 6
      // Misma convención que normalizarPosiciones: [x, z, y] × escala.
      c[i * 4] = b[base] * escalaFuente
      c[i * 4 + 1] = b[base + 2] * escalaFuente
      c[i * 4 + 2] = b[base + 1] * escalaFuente
    })
  }

  function cuadro(): void {
    if (!vivo) return
    requestAnimationFrame(cuadro)
    const ahora = performance.now()
    const dtMs = Math.min(ahora - ultimoMs, 100)
    ultimoMs = ahora
    const w = lienzo.clientWidth || 800
    const h = lienzo.clientHeight || 600
    if (lienzo.width !== w || lienzo.height !== h) {
      lienzo.width = w; lienzo.height = h
      texProf.destroy?.()
      texProf = device.createTexture({ size: [w, h], sampleCount: 1, format: 'depth24plus', usage: TU.RENDER_ATTACHMENT })
      vistaProf = texProf.createView()
      necesitaVista = true
    }
    if (!pausado) angulo += 0.002 * velocidad
    const c = new Float32Array(centros)
    const { ini: tIni, fin: tFin } = rangoFuente()
    const hayServidor = bloques !== null && tFin > tIni
    if (hayServidor) {
      // Física real hacia adelante: el bucle cierra una órbita completa
      // (ver detectarBucle), así el reinicio es invisible.
      const span = tFin - tIni
      const avance = !pausado ? (dtMs / 1000) * velocidad * (span / 20) : 0
      tiempoFuente += avance
      spinSim += avance
      const t = tIni + ((tiempoFuente % span) + span) % span
      centrosServidor(c, t)
    } else {
      // Demo local sin servidor: 1440 s sim por segundo real (la tierra
      // completa su día en ~60 s a 1x); órbitas circulares simples.
      if (!pausado) spinSim += (dtMs / 1000) * velocidad * 1440
      // Demo local sin servidor: rotación simple de cuerpos no centrales.
      visuales.forEach((v, i) => {
        if (i === 0) return
        const p0 = posMundo.get(v.id) ?? [10, 0, 0]
        const r = Math.hypot(p0[0], p0[2])
        const a = angulo * (10 / r)
        c[i * 4] = Math.cos(a) * r
        c[i * 4 + 2] = Math.sin(a) * r
      })
    }
    // Fundido de empalme: mezcla la foto previa durante ~1 s.
    // La estela registra la física CRUDA (pre-fundido): si no, cada empalme
    // dibuja un rizo fantasma en la trayectoria.
    const cCruda = c.slice()
    if (tFondo < 1 && fondo && fondo.length === c.length) {
      tFondo = Math.min(1, tFondo + dtMs / 1000)
      const s = tFondo * tFondo * (3 - 2 * tFondo)
      for (let i = 0; i < c.length; i++) c[i] = fondo[i] + (c[i] - fondo[i]) * s
      if (tFondo >= 1) fondo = null
    }
    device.queue.writeBuffer(bufCentros, 0, c)
    ultimosCentros = c

    // Explosiones: proximidad entre cuerpos (radios visuales) con cooldown.
    if (!pausado) {
      const mundo: Array<[number, number, number]> = visuales.map((_v, i) => [
        ultimosCentros[i * 4],
        ultimosCentros[i * 4 + 1],
        ultimosCentros[i * 4 + 2],
      ])
      const ahora = performance.now()
      for (const golpe of detectarImpactos(mundo, visuales.map((v) => v.radioVisual))) {
        const clave = `${Math.min(golpe.a, golpe.b)}-${Math.max(golpe.a, golpe.b)}`
        if (puedeExplotar(ultimasChispas, clave, ahora, 3000)) {
          explotar(chispas, golpe.punto, 150, 6)
        }
      }
      actualizar(chispas, Math.min(dtMs / 1000, 0.1))
    }

    // Estelas: un punto cada 2 frames (~20 s de historia a 60 fps).
    // Se registra la física cruda (sin fundido) con su marca temporal.
    tikEstela += 1
    if (!pausado && tikEstela % 2 === 0) {
      const ahoraEstela = performance.now()
      visuales.forEach((_v, i) => {
        empujarEstela(estelas[i], [cCruda[i * 4], cCruda[i * 4 + 1], cCruda[i * 4 + 2]], ahoraEstela)
      })
    }
    const vertsEstela: number[] = []
    visuales.forEach((v, i) => {
      const e = estelas[i]
      if (e && e.puntos.length >= 2) vertsEstela.push(...aSegmentos(e, v.color))
    })
    const cuentaEstela = vertsEstela.length / 7
    if (cuentaEstela > 0) {
      device.queue.writeBuffer(bufEstelas, 0, new Float32Array(vertsEstela))
    }

    // Seguimiento: el objetivo persigue al cuerpo seleccionado cada frame.
    if (seguido !== null) {
      const i = visuales.findIndex((v) => v.id === seguido)
      if (i >= 0) {
        cam.objetivo = [ultimosCentros[i * 4], ultimosCentros[i * 4 + 1], ultimosCentros[i * 4 + 2]]
      } else {
        seguido = null
      }
    }

    const vista = matrizVista(cam)
    const proj = matrizProyeccion(w / h)
    const vp = multiplicar(proj, vista)
    const ojo = ojoDeCamara(cam)
    const uni = new Float32Array(32)
    uni.set(vp, 0)
    uni.set([0.6, 0.8, 1.0], 16)
    uni[19] = (performance.now() - t0) / 1000 // tiempo (nubes, pulso sol)
    uni.set(ojo, 20) // camPos
    uni[23] = seleccionado ? 1.2 : 1.0 // brillo
    uni[24] = spinSim // rotación propia en segundos sim (respeta pausa)
    device.queue.writeBuffer(bufUni, 0, uni)

    const cod: any = device.createCommandEncoder()
    const paso: any = cod.beginRenderPass({
      colorAttachments: [{ view: contexto.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0.02, g: 0.02, b: 0.08, a: 1 }, storeOp: 'store' }],
      depthStencilAttachment: { view: vistaProf, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    })
    paso.setPipeline(pipePuntos)
    paso.setBindGroup(0, grupoPuntos)
    paso.setVertexBuffer(0, bufEstrellas)
    paso.draw(1500, 1, 0, 0)
    const chispaBytes = aIntercalado(chispas)
    if (chispaBytes.length > 0) {
      device.queue.writeBuffer(bufChispas, 0, chispaBytes)
      paso.setVertexBuffer(0, bufChispas)
      paso.draw(chispaBytes.length / 7, 1, 0, 0)
    }
    paso.setPipeline(pipeOrbita)
    paso.setBindGroup(0, grupoOrbita)
    if (cuentaEstela > 0) {
      paso.setVertexBuffer(0, bufEstelas)
      paso.draw(cuentaEstela, 1, 0, 0)
    }
    paso.setPipeline(pipePlaneta)
    paso.setBindGroup(0, grupoPlaneta)
    paso.setVertexBuffer(0, bufVert)
    paso.setVertexBuffer(1, bufNor)
    paso.setVertexBuffer(2, bufUV)
    paso.setIndexBuffer(bufIdx, 'uint16')
    paso.drawIndexed(esfera.indices.length, n, 0, 0, 0)
    paso.end()
    device.queue.submit([cod.finish()])
    necesitaVista = false
    cuadros += 1
    // OK honesto: solo si no hubo ningún error de GPU antes.
    const aviso = document.getElementById('aviso')
    if (cuadros === 30 && aviso && !aviso.dataset.error) {
      document.title = `${tituloBase} · ULTRA OK`
    }
  }
  requestAnimationFrame(cuadro)

  return {
    alternarPausa: () => { pausado = !pausado },
    fijarVelocidad: (v: number) => { velocidad = v },
    seleccionar: (id: string | null) => { seleccionado = id },
    fijarFuente: (f: FuenteEstados | null, limpiar = true) => {
      // Fundido SOLO al Lanzar o montar (limpiar=true: cambió el escenario).
      // En encadenados la semilla ES el estado actual interpolado: el primer
      // fotograma del tramo nuevo coincide con el último pintado, así que
      // fundir solo metería un frenazo fantasma de 1 s (más visible a alta
      // velocidad, donde pasa mucho tiempo sim durante el fundido).
      if (limpiar) {
        // Foto previa para el fundido de empalme (~1 s, sin saltos).
        fondo = ultimosCentros.slice()
        tFondo = 0
      } else {
        fondo = null
        tFondo = 1
      }
      bloques = f && f.bloques.length >= 2 ? f.bloques : null
      escalaFuente = f?.escala ?? 1
      tiempoFuente = 0
      limiteBucle = detectarBucle()
      // Solo al Lanzar se limpia: en encadenados la estela continúa.
      if (limpiar) for (const e of estelas) e.puntos.length = 0
    },
    leerSeleccion: () => seleccionado,
    leerTiempo: () => spinSim,
    leerBloqueActual: () => {
      if (!bloques || bloques.length < 2) return null
      const { ini, fin } = rangoFuente()
      const span = fin - ini
      if (span <= 0) return null
      const t = ini + ((tiempoFuente % span) + span) % span
      return interpolarBloque(bloques, limiteBucle, t)
    },
    leerPosicionesActuales: () => {
      // Deshace el mapeo mundo [x*e, z*e, y*e] → SI. En demo la escala es
      // la del escenario; con servidor, la de la fuente.
      const e = bloques ? escalaFuente : escalaMundo(visuales)
      if (!(e > 0)) return null
      const salida: number[] = []
      visuales.forEach((_v, i) => {
        salida.push(ultimosCentros[i * 4] / e, ultimosCentros[i * 4 + 2] / e, ultimosCentros[i * 4 + 1] / e)
      })
      return salida
    },
    leerProgreso: () => {
      const { ini, fin } = rangoFuente()
      const span = fin - ini
      if (bloques === null || span <= 0) return 0
      return Math.min(Math.max(tiempoFuente / span, 0), 1)
    },
    destruir: () => {
      vivo = false
      desconectar()
      lienzo.removeEventListener('pointerdown', alDown)
      lienzo.removeEventListener('click', alClick)
      lienzo.removeEventListener('dblclick', alDoble)
      window.removeEventListener('keydown', alTecla)
    },
  }
}
