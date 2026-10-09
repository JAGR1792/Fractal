/**
 * ULTRA: pools de GPUBuffer reutilizables. Cero allocs por frame.
 * TODO Etapa 2: uniform/storage buffers para viewProj, cuerpos e índices visibles.
 */
export function crearPoolBytes(n: number): Uint8Array {
  return new Uint8Array(n)
}
