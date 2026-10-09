/* eslint-disable @typescript-eslint/no-explicit-any */
import { camaraInicial, conectarControles, matrizProyeccion, matrizVista, multiplicar, ojoDeCamara, type EstadoCamara } from '../camara'
import { aVisual, cargarEscenario, normalizarPosiciones, tipoPlaneta, urlTextura, type CuerpoVisual } from '../escenario'
import planetaWGSL from './sombreadores/planeta.wgsl?raw'
import orbitaWGSL from './sombreadores/orbita.wgsl?raw'

/**
 * ULTRA: WebGPU nativo + instancing + órbitas merged.
 * Sin motores. 1 draw de planetas + 1 draw de órbitas.
 */

export interface ControlUltra {
  alternarPausa: () => void
  fijarVelocidad: (v: number) => void
  seleccionar: (id: string | null) => void
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
      // UV equirect: v=0 en el polo norte (primera fila de la imagen)
      uvs.push(j / lon, i / lat)
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
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const mapaBits = await createImageBitmap(await res.blob())
    const textura: any = device.createTexture({
      size: [mapaBits.width, mapaBits.height],
      format: 'rgba8unorm',
      // Dawn exige RENDER_ATTACHMENT para copyExternalImageToTexture.
      // GPUTextureUsage: TEXTURE_BINDING=0x10, COPY_DST=0x08, RENDER_ATTACHMENT=0x40.
      usage: 0x10 | 0x08 | 0x40,
    })
    device.queue.copyExternalImageToTexture({ source: mapaBits }, { texture: textura }, [mapaBits.width, mapaBits.height])
    return textura
  } catch (e) {
    console.warn(`[fractal/ultra] sin textura ${url}, uso color plano:`, e)
    const reserva: any = device.createTexture({ size: [2, 2], format: 'rgba8unorm', usage: 0x10 | 0x08 })
    device.queue.writeTexture(
      { texture: reserva },
      new Uint8Array(colorFondo.map((v) => Math.round(v * 255))),
      { bytesPerRow: 8 },
      [2, 2],
    )
    return reserva
  }
}

export async function montarUltra(lienzo: HTMLCanvasElement, urlEscenario = '/datos/dos_cuerpos.json'): Promise<ControlUltra> {
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

  // Uniformes: viewProj(64) + luzDir(12)+tiempo(4) + camPos(12)+brillo(4) = 96 bytes
  const bufUni: any = device.createBuffer({ size: 96, usage: 0x40 | 0x8 })
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

  // Órbitas: círculos aproximados en plano XZ
  const vertsOrbita: number[] = []
  const SEG = 128
  visuales.forEach((c, i) => {
    if (i === 0) return
    const p = posMundo.get(c.id) ?? [10, 0, 0]
    const r = Math.hypot(p[0], p[2])
    for (let s = 0; s < SEG; s++) {
      const a0 = (s / SEG) * Math.PI * 2
      const a1 = ((s + 1) / SEG) * Math.PI * 2
      const fade = 0.25 + 0.55 * (s / SEG)
      vertsOrbita.push(Math.cos(a0) * r, 0, Math.sin(a0) * r, 0.45, 0.5, 0.6, fade)
      vertsOrbita.push(Math.cos(a1) * r, 0, Math.sin(a1) * r, 0.45, 0.5, 0.6, fade)
    }
  })
  const arrOrbita = new Float32Array(vertsOrbita)
  const bufOrbita: any = device.createBuffer({ size: Math.max(arrOrbita.byteLength, 4), usage: 0x20 | 0x8, mappedAtCreation: true })
  new Float32Array(bufOrbita.getMappedRange()).set(arrOrbita.length ? arrOrbita : new Float32Array([0]))
  bufOrbita.unmap()
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
  let texProf: any = device.createTexture({ size: [lienzo.width || 800, lienzo.height || 600], sampleCount: 1, format: 'depth24plus', usage: 0x40 })
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

  let pausado = false
  let velocidad = 1
  let seleccionado: string | null = null
  let angulo = 0
  let vivo = true
  let cuadros = 0
  const tituloBase = document.title
  const t0 = performance.now()

  function cuadro(): void {
    if (!vivo) return
    requestAnimationFrame(cuadro)
    const w = lienzo.clientWidth || 800
    const h = lienzo.clientHeight || 600
    if (lienzo.width !== w || lienzo.height !== h) {
      lienzo.width = w; lienzo.height = h
      texProf.destroy?.()
      texProf = device.createTexture({ size: [w, h], sampleCount: 1, format: 'depth24plus', usage: 0x40 })
      vistaProf = texProf.createView()
      necesitaVista = true
    }
    if (!pausado) angulo += 0.002 * velocidad
    // Rotación simple de cuerpos no centrales (demo sin servidor aún)
    const c = new Float32Array(centros)
    visuales.forEach((v, i) => {
      if (i === 0) return
      const p0 = posMundo.get(v.id) ?? [10, 0, 0]
      const r = Math.hypot(p0[0], p0[2])
      const a = angulo * (10 / r)
      c[i * 4] = Math.cos(a) * r
      c[i * 4 + 2] = Math.sin(a) * r
    })
    device.queue.writeBuffer(bufCentros, 0, c)

    const vista = matrizVista(cam)
    const proj = matrizProyeccion(w / h)
    const vp = multiplicar(proj, vista)
    const ojo = ojoDeCamara(cam)
    const uni = new Float32Array(24)
    uni.set(vp, 0)
    uni.set([0.6, 0.8, 1.0], 16)
    uni[19] = (performance.now() - t0) / 1000 // tiempo (nubes, pulso sol)
    uni.set(ojo, 20) // camPos
    uni[23] = seleccionado ? 1.2 : 1.0 // brillo
    device.queue.writeBuffer(bufUni, 0, uni)

    const cod: any = device.createCommandEncoder()
    const paso: any = cod.beginRenderPass({
      colorAttachments: [{ view: contexto.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0.02, g: 0.02, b: 0.08, a: 1 }, storeOp: 'store' }],
      depthStencilAttachment: { view: vistaProf, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    })
    paso.setPipeline(pipeOrbita)
    paso.setBindGroup(0, grupoOrbita)
    paso.setVertexBuffer(0, bufOrbita)
    paso.draw(arrOrbita.length / 7, 1, 0, 0)
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
    if (cuadros === 30) document.title = `${tituloBase} · ULTRA OK`
  }
  requestAnimationFrame(cuadro)

  return {
    alternarPausa: () => { pausado = !pausado },
    fijarVelocidad: (v: number) => { velocidad = v },
    seleccionar: (id: string | null) => { seleccionado = id },
    leerSeleccion: () => seleccionado,
    destruir: () => { vivo = false; desconectar() },
  }
}
