/**
 * Detector de capacidad GPU.
 *
 * ULTRA = WebGPU disponible. LITE = fallback WebGL2.
 * En móvil se prefiere LITE aunque haya WebGPU (batería/temperatura).
 */
export type PerfilRender = 'ultra' | 'lite'

export async function tieneWebGPU(): Promise<boolean> {
  const nav = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }
  if (!nav.gpu) return false
  try {
    const adapter = await nav.gpu.requestAdapter()
    return adapter !== null
  } catch {
    return false
  }
}

export function esMovil(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 2
}

export async function elegirPerfil(forzar?: PerfilRender): Promise<PerfilRender> {
  if (forzar) return forzar
  if (esMovil()) return 'lite'
  return (await tieneWebGPU()) ? 'ultra' : 'lite'
}
