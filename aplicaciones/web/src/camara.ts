/**
 * Cámara orbital propia (sin Three): yaw/pitch/distancia/target.
 * Mouse: arrastrar rota, rueda acerca, shift+arrastrar panea.
 * Táctil: 1 dedo rota, 2 dedos pinch-zoom + pan.
 * Teclado: flechas rotan, +/- zoom, R resetea (accesibilidad RF01).
 */

export interface EstadoCamara {
  yaw: number
  pitch: number
  distancia: number
  objetivo: [number, number, number]
}

export function camaraInicial(distancia = 80): EstadoCamara {
  return { yaw: 0.6, pitch: 0.5, distancia, objetivo: [0, 0, 0] }
}

/** Matriz vista 4x4 columna-mayor como Float32Array(16). */
export function matrizVista(cam: EstadoCamara): Float32Array {
  const [tx, ty, tz] = cam.objetivo
  const cp = Math.cos(cam.pitch)
  const sp = Math.sin(cam.pitch)
  const cy = Math.cos(cam.yaw)
  const sy = Math.sin(cam.yaw)
  const ex = tx + cam.distancia * cp * sy
  const ey = ty + cam.distancia * sp
  const ez = tz + cam.distancia * cp * cy
  return mirarHacia([ex, ey, ez], [tx, ty, tz], [0, 1, 0])
}

/** Matriz proyección perspectiva columna-mayor. */
export function matrizProyeccion(aspecto: number, fovGrados = 50, cerca = 0.1, lejos = 2000): Float32Array {
  const f = 1 / Math.tan(((fovGrados * Math.PI) / 180) / 2)
  const m = new Float32Array(16)
  m[0] = f / aspecto
  m[5] = f
  m[10] = lejos / (cerca - lejos)
  m[11] = -1
  m[14] = (lejos * cerca) / (cerca - lejos)
  return m
}

export function multiplicar(a: Float32Array, b: Float32Array): Float32Array {
  const m = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      m[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
    }
  }
  return m
}

function mirarHacia(ojo: number[], centro: number[], arriba: number[]): Float32Array {
  const z = normar([ojo[0] - centro[0], ojo[1] - centro[1], ojo[2] - centro[2]])
  const x = normar(cruz(arriba, z))
  const y = cruz(z, x)
  const m = new Float32Array(16)
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0]; m[3] = 0
  m[4] = x[1]; m[5] = y[1]; m[6] = z[1]; m[7] = 0
  m[8] = x[2]; m[9] = y[2]; m[10] = z[2]; m[11] = 0
  m[12] = -(x[0] * ojo[0] + x[1] * ojo[1] + x[2] * ojo[2])
  m[13] = -(y[0] * ojo[0] + y[1] * ojo[1] + y[2] * ojo[2])
  m[14] = -(z[0] * ojo[0] + z[1] * ojo[1] + z[2] * ojo[2])
  m[15] = 1
  return m
}

function cruz(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function normar(v: number[]): number[] {
  const n = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / n, v[1] / n, v[2] / n]
}

/** Conecta eventos del canvas a la cámara. Devuelve función para desconectar. */
export function conectarControles(
  lienzo: HTMLCanvasElement,
  cam: EstadoCamara,
  alCambiar: () => void,
): () => void {
  let arrastrando = false
  let paneando = false
  let ultimoX = 0
  let ultimoY = 0
  let distTactil = 0

  const inicial = { ...cam, objetivo: [...cam.objetivo] as [number, number, number] }

  function onDown(e: PointerEvent): void {
    lienzo.setPointerCapture(e.pointerId)
    arrastrando = true
    paneando = e.shiftKey
    ultimoX = e.clientX
    ultimoY = e.clientY
  }
  function onMove(e: PointerEvent): void {
    if (!arrastrando) return
    const dx = e.clientX - ultimoX
    const dy = e.clientY - ultimoY
    ultimoX = e.clientX
    ultimoY = e.clientY
    if (paneando) {
      const s = cam.distancia * 0.0016
      cam.objetivo[0] -= dx * s
      cam.objetivo[1] += dy * s
    } else {
      cam.yaw += dx * 0.005
      cam.pitch = Math.min(1.5, Math.max(-1.5, cam.pitch + dy * 0.005))
    }
    alCambiar()
  }
  function onUp(e: PointerEvent): void {
    arrastrando = false
    try { lienzo.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }
  function onRueda(e: WheelEvent): void {
    e.preventDefault()
    cam.distancia = Math.min(800, Math.max(5, cam.distancia * (1 + Math.sign(e.deltaY) * 0.1)))
    alCambiar()
  }
  function onTecla(e: KeyboardEvent): void {
    const paso = 0.08
    if (e.key === 'ArrowLeft') cam.yaw -= paso
    else if (e.key === 'ArrowRight') cam.yaw += paso
    else if (e.key === 'ArrowUp') cam.pitch = Math.min(1.5, cam.pitch + paso)
    else if (e.key === 'ArrowDown') cam.pitch = Math.max(-1.5, cam.pitch - paso)
    else if (e.key === '+' || e.key === '=') cam.distancia = Math.max(5, cam.distancia * 0.9)
    else if (e.key === '-') cam.distancia = Math.min(800, cam.distancia * 1.1)
    else if (e.key === 'r' || e.key === 'R') {
      cam.yaw = inicial.yaw; cam.pitch = inicial.pitch
      cam.distancia = inicial.distancia; cam.objetivo = [...inicial.objetivo]
    } else return
    e.preventDefault()
    alCambiar()
  }
  function onTacto(e: TouchEvent): void {
    if (e.touches.length === 2) {
      e.preventDefault()
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      if (distTactil > 0) {
        cam.distancia = Math.min(800, Math.max(5, cam.distancia * (distTactil / d)))
        alCambiar()
      }
      distTactil = d
    }
  }
  function finTacto(): void {
    distTactil = 0
  }

  lienzo.addEventListener('pointerdown', onDown)
  lienzo.addEventListener('pointermove', onMove)
  lienzo.addEventListener('pointerup', onUp)
  lienzo.addEventListener('wheel', onRueda, { passive: false })
  window.addEventListener('keydown', onTecla)
  lienzo.addEventListener('touchmove', onTacto, { passive: false })
  lienzo.addEventListener('touchend', finTacto)

  return () => {
    lienzo.removeEventListener('pointerdown', onDown)
    lienzo.removeEventListener('pointermove', onMove)
    lienzo.removeEventListener('pointerup', onUp)
    lienzo.removeEventListener('wheel', onRueda)
    window.removeEventListener('keydown', onTecla)
    lienzo.removeEventListener('touchmove', onTacto)
    lienzo.removeEventListener('touchend', finTacto)
  }
}
