/* eslint-disable @typescript-eslint/no-explicit-any */
import { camaraInicial, conectarControles, invertir, matrizProyeccion, matrizVista, multiplicar, ojoDeCamara, rayoDesdePantalla, tocaEsfera, type EstadoCamara } from '../camara'
import { anguloRotacion, aVisual, cargarEscenario, escalaMundo, normalizarPosiciones, slotTextura, tipoPlaneta, NUM_TEXTURAS, TEXTURAS_POR_ID, VELOCIDAD_ROTACION, type CuerpoVisual, type ModoEscala } from '../escenario'
import type { FuenteEstados } from '../api'
import type { FotoMedicion } from '../medicion'
import { NucleoReproduccion } from '../nucleo-reproduccion'
import planetaWGSL from './sombreadores/planeta.wgsl?raw'
import orbitaWGSL from './sombreadores/orbita.wgsl?raw'
import puntosWGSL from './sombreadores/puntos.wgsl?raw'
import { aSegmentos, crearEstela, generarEstrellas, limpiarEstela, PASO_ESTELA_SIM, RaspaFlotantes, RegistroEstela, type Estela } from '../estelas'
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
  /**
   * Segundos sim por segundo de pared a velocidad 1x. Se fija según el
   * escenario (ver `ritmoParaPeriodo`): un ritmo único hacía que los planetas
   * exteriores del Sistema Solar parecieran congelados.
   */
  fijarRitmo: (ritmo: number) => void
  /** Ritmo de reproducción vigente. */
  leerRitmo: () => number
  seleccionar: (id: string | null) => void
  /** Cambia la fuente (bifurcación o primera conexión; `limpiar` rige estelas). */
  fijarFuente: (f: FuenteEstados | null, limpiar?: boolean) => void
  /** Añade bloques del stream (sin resetear el reloj). */
  anexarBloques: (nuevos: Float32Array[]) => void
  /** Poda bloques con t < `mantenerDesde` (memoria acotada). */
  podar: (mantenerDesde: number) => void
  /** Segundos simulados actuales (`NaN` en `cargando`: la barra pinta '—'). */
  leerTiempo: () => number
  /** Posiciones SI actuales (para bifurcar sin saltos). `null` si no hay. */
  leerPosicionesActuales: () => number[] | null
  /** Bloque completo interpolado al instante actual (t + xyz + vxvyvz). */
  leerBloqueActual: () => Float32Array | null
  /** Foto de rendimiento para el overlay (Fase 0: medir antes de optimizar). */
  leerMedicion: () => FotoMedicion
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
  periodoSim: number | null = null,
  modo: ModoEscala = 'exagerado',
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
  contexto.configure({ device, format: formato, alphaMode: 'premultiplied' })

  const escenario = await cargarEscenario(urlEscenario).catch(() => null)
  const visuales: CuerpoVisual[] = escenario
    ? aVisual(escenario, modo)
    : [
        { id: 'sol', nombre: 'Sol', masa: 1.989e30, radio: 6.957e8, posicion: [0, 0, 0], velocidad: [0, 0, 0], radioVisual: 5, color: [1, 0.85, 0.2] },
        { id: 'tierra', nombre: 'Tierra', masa: 5.972e24, radio: 6.371e6, posicion: [1.496e11, 0, 0], velocidad: [0, 29780, 0], radioVisual: 1.6, color: [0.2, 0.45, 0.95] },
      ]
  const posMundo = normalizarPosiciones(visuales)

  // Sistemas grandes (p. ej. 9 cuerpos) arrancan más lejos para encuadrar.
  const cam: EstadoCamara = camaraInicial(visuales.length > 3 ? 130 : 70)
  // Los controles mutan `cam`; la matriz de vista se recalcula cada fotograma
  // (ver `const vista = matrizVista(cam)` en el bucle), así que no hace falta
  // ninguna invalidación diferida aquí.
  const desconectar = conectarControles(lienzo, cam, () => undefined)

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

  // Texturas vendorizadas por slot (ver TEXTURAS_POR_ID en escenario.ts
  // y public/texturas/LEEME.md). El orden del arreglo es el slot.
  const entradas = Object.values(TEXTURAS_POR_ID).sort((a, b) => a.slot - b.slot)
  if (entradas.length !== NUM_TEXTURAS) {
    console.warn(`[fractal/ultra] catálogo con ${entradas.length} texturas, se esperaban ${NUM_TEXTURAS}`)
  }
  const texturas: any[] = []
  for (const e of entradas) {
    texturas.push(await cargarTextura(device, e.url, [0.5, 0.5, 0.55, 1]))
  }
  const muestreador: any = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'clamp-to-edge' })

  // Storage: centros (xyz + tipo visual) + datos (radio + color) + slots
  const n = visuales.length
  const centros = new Float32Array(n * 4)
  const datos = new Float32Array(n * 4)
  const slots = new Uint32Array(n)
  visuales.forEach((c, i) => {
    const p = posMundo.get(c.id) ?? [0, 0, 0]
    centros.set([p[0], p[1], p[2], tipoPlaneta(c.id)], i * 4)
    datos.set([c.radioVisual, c.color[0], c.color[1], c.color[2]], i * 4)
    slots[i] = slotTextura(c.id) < 0 ? 0xffffffff : slotTextura(c.id)
  })
  const bufCentros: any = device.createBuffer({ size: centros.byteLength, usage: 0x8 | 0x80, mappedAtCreation: true })
  new Float32Array(bufCentros.getMappedRange()).set(centros)
  bufCentros.unmap()
  const bufDatos: any = device.createBuffer({ size: datos.byteLength, usage: 0x8 | 0x80, mappedAtCreation: true })
  new Float32Array(bufDatos.getMappedRange()).set(datos)
  bufDatos.unmap()
  const bufSlots: any = device.createBuffer({ size: Math.max(slots.byteLength, 4), usage: 0x8 | 0x80, mappedAtCreation: true })
  new Uint32Array(bufSlots.getMappedRange()).set(slots.length ? slots : new Uint32Array([0xffffffff]))
  bufSlots.unmap()

  // Ángulo de rotación propia por cuerpo. Se recalcula cada fotograma desde el
  // tiempo sim con el período REAL de cada cuerpo (ver `anguloRotacion`), en
  // f64 y acotado a [0, 2π): antes el shader multiplicaba el tiempo absoluto y
  // el argumento del coseno perdía precisión en f32.
  const giros = new Float32Array(n)
  const bufGiros: any = device.createBuffer({ size: Math.max(giros.byteLength, 4), usage: 0x8 | 0x80 | 0x10 })

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

  const vistasTex: any[] = texturas.map((t: any) => t.createView())
  const grupoPlaneta: any = device.createBindGroup({ layout: pipePlaneta.getBindGroupLayout(0), entries: [
    { binding: 0, resource: { buffer: bufUni } },
    { binding: 1, resource: { buffer: bufCentros } },
    { binding: 2, resource: { buffer: bufDatos } },
    ...vistasTex.map((vista: any, k: number) => ({ binding: 3 + k, resource: vista })),
    { binding: 3 + vistasTex.length, resource: muestreador },
    { binding: 4 + vistasTex.length, resource: { buffer: bufSlots } },
    { binding: 5 + vistasTex.length, resource: { buffer: bufGiros } },
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
  // Se muestrean en tiempo SIM (ver `PASO_ESTELA_SIM`): registrar por fotograma
  // de pared hacía que a alta velocidad cada arista cruzara la órbita en recta.
  const LARGO_ESTELA = 600
  const estelas: Estela[] = visuales.map(() => crearEstela(LARGO_ESTELA))
  /** Scratch reutilizados: ni el merged ni su subida crean por cuadro. */
  const raspaEstela: number[] = []
  const raspaFloat = new RaspaFlotantes()
  const registroEstela = new RegistroEstela(PASO_ESTELA_SIM, LARGO_ESTELA)  /**
   * Época del vuelo. Avanza en cada siembra de fuente: una bifurcación es un
   * camino NUEVO, no la continuación del anterior. La posición puede ser
   * continua, pero la física no, y la estela no debe unir los dos vuelos
   * (esa era la recta y la cúspide que cruzaban la pantalla).
   */
  let epoca = 0
  const bufEstelas: any = device.createBuffer({ size: Math.max(n * LARGO_ESTELA * 2 * 7 * 4, 16), usage: 0x20 | 0x8 })

  let pausado = false
  let velocidad = 1
  let seleccionado: string | null = null
  let vivo = true
  let cuadros = 0
  const tituloBase = document.title
  const t0 = performance.now()
  let ultimoMs = t0
  /** Reloj propio de la rotación, en tiempo de pared (segundos reales). */
  let relojRotacion = 0
  const radios = visuales.map((c) => c.radioVisual * 1.2)
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
      const centro: [number, number, number] = [nucleo.centros[i * 4], nucleo.centros[i * 4 + 1], nucleo.centros[i * 4 + 2]]
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
    cam.objetivo = [nucleo.centros[i * 4], nucleo.centros[i * 4 + 1], nucleo.centros[i * 4 + 2]]
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

  // Núcleo común de reproducción (experimento): único dueño del reloj, la
  // fuente, el ritmo y los centros. Sin demo falsa ni fundidos: sin fuente el
  // estado es `cargando` y el diorama queda congelado (honesto, sin saltos).
  // El ritmo se ajusta al sistema (`ritmoParaPeriodo`): con uno fijo, los
  // planetas exteriores del Sistema Solar parecían congelados.
  const nucleo = new NucleoReproduccion(n, periodoSim, fuente, centros)
  /** Scratch reutilizado para el registro de estelas (cero allocs). */
  const raspaPos: [number, number, number] = [0, 0, 0]

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
    }
    const estado = nucleo.avanzarCuadro(dtMs / 1000, velocidad, pausado)
    // Referencia reutilizada del núcleo (cero allocs): no retener.
    const c = nucleo.centros
    device.queue.writeBuffer(bufCentros, 0, c)
    nucleo.medidor.sumarBytes(c.byteLength)

    // Explosiones: proximidad entre cuerpos (radios visuales) con cooldown.
    if (!pausado) {
      const mundo: Array<[number, number, number]> = visuales.map((_v, i) => [
        c[i * 4],
        c[i * 4 + 1],
        c[i * 4 + 2],
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

    // Estelas: muestreo de paso fijo en tiempo SIM (curva real, no cuerdas).
    // La posición la da el núcleo (mismos números que el dibujo) en un
    // scratch reutilizado; el registro la clona al guardar.
    if (!pausado && estado === 'vivo') {
      const tFuente = nucleo.tiempo
      visuales.forEach((_v, i) => {
        registroEstela.registrar(estelas[i], tFuente, epoca, (t) =>
          nucleo.posicionEn(t, i, raspaPos) ? raspaPos : null,
        )
      })
    }
    raspaEstela.length = 0
    visuales.forEach((v, i) => {
      const e = estelas[i]
      if (e && e.cantidad >= 2) aSegmentos(e, v.color, PASO_ESTELA_SIM, raspaEstela)
    })
    const cuentaEstela = raspaEstela.length / 7
    if (cuentaEstela > 0) {
      const vista = raspaFloat.vista(raspaEstela.length)
      vista.set(raspaEstela)
      device.queue.writeBuffer(bufEstelas, 0, vista)
      nucleo.medidor.sumarBytes(vista.byteLength)
    }

    // Seguimiento: el objetivo persigue al cuerpo seleccionado cada frame.
    if (seguido !== null) {
      const i = visuales.findIndex((v) => v.id === seguido)
      if (i >= 0) {
        cam.objetivo = [c[i * 4], c[i * 4 + 1], c[i * 4 + 2]]
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
    const tSpin = nucleo.leerTiempo()
    uni[24] = Number.isFinite(tSpin) ? tSpin : 0 // 0 en `cargando` (sin NaN a GPU)
    device.queue.writeBuffer(bufUni, 0, uni)

    // Rotación propia: reloj de PARED propio (ver `anguloRotacion`), avanzado
    // solo si no está pausado. Se sube cada fotograma.
    if (!pausado) relojRotacion += dtMs / 1000
    visuales.forEach((c, i) => {
      giros[i] = anguloRotacion(c, relojRotacion)
    })
    device.queue.writeBuffer(bufGiros, 0, giros)

    const cod: any = device.createCommandEncoder()
    const paso: any = cod.beginRenderPass({
      colorAttachments: [{ view: contexto.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0.02, g: 0.02, b: 0.08, a: 0 }, storeOp: 'store' }],
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
    cuadros += 1
    nucleo.medidor.marco(performance.now() - ahora)
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
    fijarRitmo: (r: number) => nucleo.fijarRitmo(r),
    leerRitmo: () => nucleo.leerRitmo(),
    seleccionar: (id: string | null) => { seleccionado = id },
    fijarFuente: (f: FuenteEstados | null, limpiar = true) => {
      nucleo.fijarFuente(f)
      // El muestreo en tiempo sim parte de cero en cada fuente.
      registroEstela.reiniciar()
      // Solo al bifurcar se limpia: en stream la estela es historia continua.
      if (limpiar) {
        for (const e of estelas) limpiarEstela(e)
      } else {
        // Resembrado: la estela se conserva (es historia real) pero se marca
        // una época nueva para que el empalme no se dibuje.
        epoca += 1
      }
    },
    leerSeleccion: () => seleccionado,
    leerTiempo: () => nucleo.leerTiempo(),
    leerBloqueActual: () => nucleo.leerBloqueActual(),
    leerMedicion: () => nucleo.medir(),
    anexarBloques: (nuevos: Float32Array[]) => { nucleo.anexarBloques(nuevos) },
    podar: (mantenerDesde: number) => { nucleo.podar(mantenerDesde) },
    leerPosicionesActuales: () => {
      // Deshace el mapeo mundo [x*e, z*e, y*e] → SI. En `cargando` la escala
      // es la del escenario; con fuente, la de la sesión.
      const salida = nucleo.leerPosicionesSI(escalaMundo(visuales))
      return salida ? [...salida] : null
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
