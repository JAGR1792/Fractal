/**
 * ULTRA: inicialización WebGPU.
 * Crea device, contexto, formato y pipeline mínimo.
 * Shaders reales en ./sombreadores/*.wgsl (Etapa 2 completa).
 */
export async function montarUltra(lienzo: HTMLCanvasElement): Promise<void> {
  const nav = navigator as unknown as {
    gpu?: {
      requestAdapter: () => Promise<{ requestDevice: () => Promise<unknown> } | null>
      getPreferredCanvasFormat: () => string
    }
  }
  if (!nav.gpu) throw new Error('sin WebGPU')
  const adapter = await nav.gpu.requestAdapter()
  if (!adapter) throw new Error('sin adapter WebGPU')
  const device = await adapter.requestDevice()
  const contexto = lienzo.getContext('webgpu') as unknown as {
    configure: (opts: { device: unknown; format: string; alphaMode: string }) => void
  } | null
  if (!contexto) throw new Error('sin contexto webgpu')
  const formato = nav.gpu.getPreferredCanvasFormat()
  contexto.configure({ device, format: formato, alphaMode: 'opaque' })
  // TODO Etapa 2: pipelines instanciado + órbitas + compute (ver renderizador.md)
  console.info('[fractal/ultra] WebGPU listo, formato:', formato)
}
