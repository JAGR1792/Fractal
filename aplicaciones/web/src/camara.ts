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

/** Posición del ojo de la cámara en mundo (para fresnel y brillos especulares). */
export function ojoDeCamara(cam: EstadoCamara): [number, number, number] {
  const [tx, ty, tz] = cam.objetivo
  const cp = Math.cos(cam.pitch)
  const sp = Math.sin(cam.pitch)
  const cy = Math.cos(cam.yaw)
  const sy = Math.sin(cam.yaw)
  return [
    tx + cam.distancia * cp * sy,
    ty + cam.distancia * sp,
    tz + cam.distancia * cp * cy,
  ]
}

/** Matriz vista 4x4 columna-mayor como Float32Array(16). */
export function matrizVista(cam: EstadoCamara): Float32Array {
  const [tx, ty, tz] = cam.objetivo
  const [ex, ey, ez] = ojoDeCamara(cam)
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

/** Inversa de una matriz 4x4 columna-mayor (para picking por rayo). */
export function invertir(m: Float32Array): Float32Array {
  // Gauss-Jordan sobre [M | I] en filas (doble precisión, sin cofactores).
  const a: number[][] = []
  for (let r = 0; r < 4; r++) {
    a.push([
      m[r], m[4 + r], m[8 + r], m[12 + r],
      r === 0 ? 1 : 0, r === 1 ? 1 : 0, r === 2 ? 1 : 0, r === 3 ? 1 : 0,
    ])
  }
  for (let c = 0; c < 4; c++) {
    let piv = c
    for (let r = c + 1; r < 4; r++) {
      if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r
    }
    if (Math.abs(a[piv][c]) < 1e-12) return new Float32Array(16)
    const tmp = a[c]
    a[c] = a[piv]
    a[piv] = tmp
    const d = a[c][c]
    for (let k = 0; k < 8; k++) a[c][k] /= d
    for (let r = 0; r < 4; r++) {
      if (r === c) continue
      const f = a[r][c]
      for (let k = 0; k < 8; k++) a[r][k] -= f * a[c][k]
    }
  }
  const inv = new Float32Array(16)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) inv[c * 4 + r] = a[r][4 + c]
  }
  return inv
}

export interface Rayo {
  origen: [number, number, number]
  direccion: [number, number, number]
}

/** Rayo en mundo desde un píxel del canvas (para picking). */
export function rayoDesdePantalla(px: number, py: number, ancho: number, alto: number, invVP: Float32Array): Rayo {
  const ndc: [number, number] = [(px / ancho) * 2 - 1, 1 - (py / alto) * 2]
  const desproyectar = (z: number): [number, number, number] => {
    const x = ndc[0], y = ndc[1]
    const w = invVP[3] * x + invVP[7] * y + invVP[11] * z + invVP[15]
    const s = w !== 0 ? 1 / w : 1
    return [
      (invVP[0] * x + invVP[4] * y + invVP[8] * z + invVP[12]) * s,
      (invVP[1] * x + invVP[5] * y + invVP[9] * z + invVP[13]) * s,
      (invVP[2] * x + invVP[6] * y + invVP[10] * z + invVP[14]) * s,
    ]
  }
  const cerca = desproyectar(-1)
  const lejos = desproyectar(1)
  const dx = lejos[0] - cerca[0], dy = lejos[1] - cerca[1], dz = lejos[2] - cerca[2]
  const n = Math.hypot(dx, dy, dz) || 1
  return { origen: cerca, direccion: [dx / n, dy / n, dz / n] }
}

/** Intersección rayo-esfera: distancia `t` al impacto o `null` si no toca. */
export function tocaEsfera(rayo: Rayo, centro: [number, number, number], radio: number): number | null {
  const ox = rayo.origen[0] - centro[0]
  const oy = rayo.origen[1] - centro[1]
  const oz = rayo.origen[2] - centro[2]
  const dx = rayo.direccion[0], dy = rayo.direccion[1], dz = rayo.direccion[2]
  const b = ox * dx + oy * dy + oz * dz
  const c = ox * ox + oy * oy + oz * oz - radio * radio
  const h = b * b - c
  if (h < 0) return null
  const t = -b - Math.sqrt(h)
  return t > 0 ? t : null
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
