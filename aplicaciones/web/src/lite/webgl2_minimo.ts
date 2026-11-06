/**
 * LITE: WebGL2 mínimo con esferas + órbitas.
 * Sin motores. Un draw por cuerpo (N pequeño en LITE).
 */

import { anguloRotacion, aVisual, cargarEscenario, escalaMundo, normalizarPosiciones, slotTextura, tipoPlaneta, NUM_TEXTURAS, TEXTURAS_POR_ID, VELOCIDAD_ROTACION, type ModoEscala } from '../escenario'
import { camaraInicial, conectarControles, matrizProyeccion, matrizVista, multiplicar, type EstadoCamara } from '../camara'
import { aSegmentos, crearEstela, generarEstrellas, limpiarEstela, PASO_ESTELA_SIM, RaspaFlotantes, RegistroEstela, type Estela } from '../estelas'
import { crearSistema, actualizar as actualizarChispas, aIntercalado as chispasIntercaladas, explotar as explotarChispas, puedeExplotar as puedeExplotarChispas } from '../particulas'
import { detectarImpactos } from '../mecanica'
import type { FuenteEstados } from '../api'
import type { FotoMedicion } from '../medicion'
import { NucleoReproduccion } from '../nucleo-reproduccion'

const VS = `#version 300 es
precision mediump float;
layout(location=0) in vec3 p;
layout(location=1) in vec3 n;
layout(location=2) in vec2 uv;
uniform mat4 uVP;
uniform vec3 uCentro;
uniform vec3 uColor;
uniform float uRadio;
uniform float uTipo;
uniform float uGiro;
out vec3 vN; out vec3 vC; out vec2 vUV;
vec3 rotY(vec3 q, float a){ float c = cos(a); float s = sin(a); return vec3(c*q.x + s*q.z, q.y, -s*q.x + c*q.z); }
void main(){
  // El ángulo llega ya acotado a [0, 2π) desde la CPU, con el período real de
  // cada cuerpo (antes se multiplicaba el tiempo sim absoluto aquí y todas las
  // rotaciones usaban 24 h).
  float g = uGiro;
  vec3 pr = rotY(p, g);
  vec3 mundo = pr*uRadio+uCentro; vN=rotY(n, g); vC=uColor; vUV=uv; gl_Position=uVP*vec4(mundo,1.0);
}`

const FS = `#version 300 es
precision mediump float;
in vec3 vN; in vec3 vC; in vec2 vUV; out vec4 o;
uniform float uTipo;
uniform int uSlot;
uniform sampler2D uTex0;
uniform sampler2D uTex1;
uniform sampler2D uTex2;
uniform sampler2D uTex3;
uniform sampler2D uTex4;
uniform sampler2D uTex5;
uniform sampler2D uTex6;
uniform sampler2D uTex7;
uniform sampler2D uTex8;
uniform sampler2D uTex9;
vec3 muestra(int s, vec2 uv){
  if (s == 1) return texture(uTex1, uv).rgb;
  if (s == 2) return texture(uTex2, uv).rgb;
  if (s == 3) return texture(uTex3, uv).rgb;
  if (s == 4) return texture(uTex4, uv).rgb;
  if (s == 5) return texture(uTex5, uv).rgb;
  if (s == 6) return texture(uTex6, uv).rgb;
  if (s == 7) return texture(uTex7, uv).rgb;
  if (s == 8) return texture(uTex8, uv).rgb;
  if (s == 9) return texture(uTex9, uv).rgb;
  return texture(uTex0, uv).rgb;
}
void main(){
  vec3 n = normalize(vN);
  vec3 base = vC;
  if (uSlot >= 0) {
    base = muestra(uSlot, vUV);
  }
  if (uTipo < 0.5) {
    o = vec4(base*1.4 + vec3(0.35,0.12,0.02), 1.0); // sol emissive
  } else {
    float d = max(dot(n, normalize(vec3(0.6,0.8,1.0))), 0.0);
    o = vec4(base*(0.35 + 0.75*d), 1.0);
  }
}`

const VS_ORB = `#version 300 es
precision mediump float;
layout(location=0) in vec3 p;
layout(location=1) in float a;
uniform mat4 uVP;
out float vA;
void main(){ vA = a; gl_Position=uVP*vec4(p,1.0); }`

const FS_ORB = `#version 300 es
precision mediump float;
uniform vec3 uColor; uniform float uAlpha; in float vA; out vec4 o;
void main(){ o=vec4(uColor, vA*uAlpha); }`

const VS_PTS = `#version 300 es
precision mediump float;
layout(location=0) in vec3 p;
layout(location=1) in float b;
layout(location=2) in vec3 col;
uniform mat4 uVP;
out float vB; out vec3 vC;
void main(){ vB = b; vC = col; gl_Position=uVP*vec4(p,1.0); gl_PointSize=3.0; }`

const FS_PTS = `#version 300 es
precision mediump float;
in float vB; in vec3 vC; out vec4 o;
void main(){ o=vec4(vC*vB, vB); }`

function programa(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const comp = (t: number, src: string): WebGLShader => {
    const s = gl.createShader(t)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(String(gl.getShaderInfoLog(s)))
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, comp(gl.VERTEX_SHADER, vs))
  gl.attachShader(p, comp(gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(String(gl.getProgramInfoLog(p)))
  return p
}

function esferaCPU(lat = 20, lon = 14): { pos: Float32Array; nor: Float32Array; uvs: Float32Array; idx: Uint16Array } {
  const pos: number[] = []
  const nor: number[] = []
  const uvs: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= lat; i++) {
    const th = (i / lat) * Math.PI
    for (let j = 0; j <= lon; j++) {
      const ph = (j / lon) * Math.PI * 2
      const x = Math.sin(th) * Math.cos(ph)
      const y = Math.cos(th)
      const z = Math.sin(th) * Math.sin(ph)
      pos.push(x, y, z)
      nor.push(x, y, z)
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
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uvs: new Float32Array(uvs), idx: new Uint16Array(idx) }
}

/** Carga una textura local con placeholder hasta que llegue la imagen. */
function cargarTexturaGL(gl: WebGL2RenderingContext, url: string, reserva: [number, number, number]): WebGLTexture {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([reserva[0], reserva[1], reserva[2], 255]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  const img = new Image()
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.generateMipmap(gl.TEXTURE_2D)
  }
  img.onerror = () => console.warn(`[fractal/lite] sin textura ${url}`)
  img.src = url
  return tex
}

export interface ControlLite {
  alternarPausa: () => void
  fijarVelocidad: (v: number) => void
  /** Segundos sim por segundo de pared a 1x, según el escenario. */
  fijarRitmo: (ritmo: number) => void
  /** Ritmo de reproducción vigente. */
  leerRitmo: () => number
  /** Cambia la fuente (`limpiar=false` conserva estelas en encadenados). */
  fijarFuente: (f: FuenteEstados | null, limpiar?: boolean) => void
  /** Añade bloques del stream (sin resetear el reloj). */
  anexarBloques: (nuevos: Float32Array[]) => void
  /** Poda bloques con t < `mantenerDesde` (memoria acotada). */
  podar: (mantenerDesde: number) => void
  /** Segundos simulados actuales (`NaN` en `cargando`: la barra pinta '—'). */
  leerTiempo: () => number
  leerBloqueActual: () => Float32Array | null
  leerPosicionesActuales: () => number[] | null
  /** Foto de rendimiento para el overlay (Fase 0: medir antes de optimizar). */
  leerMedicion: () => FotoMedicion
  destruir: () => void
}

export async function montarLite(
  lienzo: HTMLCanvasElement,
  urlEscenario = '/datos/dos_cuerpos.json',
  fuente: FuenteEstados | null = null,
  periodoSim: number | null = null,
  modo: ModoEscala = 'exagerado',
): Promise<ControlLite> {
  const glRaw = lienzo.getContext('webgl2')
  if (!glRaw) throw new Error('sin WebGL2')
  const gl: WebGL2RenderingContext = glRaw
  const cam: EstadoCamara = camaraInicial(60)
  const desconectar = conectarControles(lienzo, cam, () => undefined)

  const prog = programa(gl, VS, FS)
  const progOrb = programa(gl, VS_ORB, FS_ORB)
  const progPts = programa(gl, VS_PTS, FS_PTS)
  const locVP = gl.getUniformLocation(prog, 'uVP')
  const locCentro = gl.getUniformLocation(prog, 'uCentro')
  const locRadio = gl.getUniformLocation(prog, 'uRadio')
  const locColor = gl.getUniformLocation(prog, 'uColor')
  const locTipo = gl.getUniformLocation(prog, 'uTipo')
  const locGiro = gl.getUniformLocation(prog, 'uGiro')
  const locSlot = gl.getUniformLocation(prog, 'uSlot')
  const locTex: Array<WebGLUniformLocation | null> = []
  for (let k = 0; k < NUM_TEXTURAS; k++) locTex.push(gl.getUniformLocation(prog, `uTex${k}`))
  const locVPOrb = gl.getUniformLocation(progOrb, 'uVP')
  const locColorOrb = gl.getUniformLocation(progOrb, 'uColor')
  const locAlphaOrb = gl.getUniformLocation(progOrb, 'uAlpha')
  const locVPPts = gl.getUniformLocation(progPts, 'uVP')

  const esf = esferaCPU()
  const bufPos = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, bufPos)
  gl.bufferData(gl.ARRAY_BUFFER, esf.pos, gl.STATIC_DRAW)
  const bufNor = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, bufNor)
  gl.bufferData(gl.ARRAY_BUFFER, esf.nor, gl.STATIC_DRAW)
  const bufUV = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, bufUV)
  gl.bufferData(gl.ARRAY_BUFFER, esf.uvs, gl.STATIC_DRAW)
  const bufIdx = gl.createBuffer()!
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, esf.idx, gl.STATIC_DRAW)
  const vaoEsfera = gl.createVertexArray()!
  gl.bindVertexArray(vaoEsfera)
  gl.bindBuffer(gl.ARRAY_BUFFER, bufPos)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, bufNor)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, bufUV)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx)
  gl.bindVertexArray(null)

  // Texturas del catálogo por slot (ver TEXTURAS_POR_ID y LEEME.md).
  // Van a las unidades 0..N-1 una sola vez; por cuerpo solo cambia uSlot.
  const entradasTex = Object.values(TEXTURAS_POR_ID).sort((a, b) => a.slot - b.slot)
  const texPorSlot: WebGLTexture[] = entradasTex.map(
    (e) => cargarTexturaGL(gl, e.url, [128, 128, 140]),
  )
  for (let k = 0; k < texPorSlot.length; k++) {
    gl.activeTexture(gl.TEXTURE0 + k)
    gl.bindTexture(gl.TEXTURE_2D, texPorSlot[k])
  }

  const vaoOrb = gl.createVertexArray()!

  // Estrellas fijas + estelas recientes por cuerpo.
  const posEstrellas = generarEstrellas(800, 7, 900)
  const arrEstrellas = new Float32Array(800 * 7)
  for (let i = 0; i < 800; i++) {
    const b = 0.3 + 0.7 * (((i * 2654435761) >>> 0) / 4294967296)
    arrEstrellas.set([posEstrellas[i * 3], posEstrellas[i * 3 + 1], posEstrellas[i * 3 + 2], b, 0.85, 0.9, 1.0], i * 7)
  }
  const bufPts = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, bufPts)
  gl.bufferData(gl.ARRAY_BUFFER, arrEstrellas, gl.STATIC_DRAW)
  const vaoPts = gl.createVertexArray()!
  gl.bindVertexArray(vaoPts)
  gl.bindBuffer(gl.ARRAY_BUFFER, bufPts)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 28, 12)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16)
  gl.bindVertexArray(null)
  // Chispas de explosión (mismo layout intercalado, buffer dinámico).
  const bufChispas = gl.createBuffer()!
  const chispas = crearSistema(800)
  const ultimasChispas = new Map<string, number>()
  const estelas: Estela[] = []
  const registroEstela = new RegistroEstela(PASO_ESTELA_SIM, 600)
  const bufEstela = gl.createBuffer()!
  /** Scratch por cuerpo + subida reutilizada: cero allocs por cuadro. */
  const raspaSegs: number[][] = []
  const raspaFloat = new RaspaFlotantes()
  /** Época del vuelo: avanza al sembrar una fuente nueva (ver ULTRA/estelas.ts). */
  let epoca = 0

  let visuales = aVisual({
    id: 'demo', nombre: 'Demo', descripcion: '', cuerpos: [
      { id: 'sol', nombre: 'Sol', masa: 1.989e30, radio: 6.957e8, posicion: [0, 0, 0], velocidad: [0, 0, 0] },
      { id: 'tierra', nombre: 'Tierra', masa: 5.972e24, radio: 6.371e6, posicion: [1.496e11, 0, 0], velocidad: [0, 29780, 0] },
    ],
  })
  // El escenario se espera ANTES del primer cuadro (igual que ULTRA): así N
  // queda fijo y no hay flash de demo ni mutaciones a mitad del vuelo.
  try {
    const esc = await cargarEscenario(urlEscenario)
    visuales = aVisual(esc, modo)
  } catch { /* sin escenario: demo interna */ }
  const posMundo = normalizarPosiciones(visuales)
  if (visuales.length > 3) cam.distancia = 120

  // Núcleo común de reproducción (experimento): único dueño del reloj, la
  // fuente, el ritmo y los centros. Sin demo falsa ni fundidos.
  const semilla = new Float32Array(visuales.length * 4)
  visuales.forEach((c, i) => {
    const p0 = posMundo.get(c.id) ?? [10, 0, 0]
    semilla.set([p0[0], p0[1], p0[2], 0], i * 4)
  })
  const nucleo = new NucleoReproduccion(visuales.length, periodoSim, fuente, semilla)
  for (const _ of visuales) {
    estelas.push(crearEstela(600))
    raspaSegs.push([])
  }
  /** Posiciones mundo reutilizadas (del núcleo, cero allocs). No retener. */
  const pos: Array<[number, number, number]> = visuales.map(() => [0, 0, 0])
  for (let i = 0; i < pos.length; i++) {
    pos[i][0] = semilla[i * 4]
    pos[i][1] = semilla[i * 4 + 1]
    pos[i][2] = semilla[i * 4 + 2]
  }
  /** Scratch reutilizado para el registro de estelas (cero allocs). */
  const raspaPos: [number, number, number] = [0, 0, 0]

  let pausado = false
  let velocidad = 1
  let vivo = true
  /** Reloj propio de la rotación, en tiempo de pared (segundos reales). */
  let relojRotacion = 0
  let ultimoMs = performance.now()

  function cuadro(): void {
    if (!vivo) return
    requestAnimationFrame(cuadro)
    const ahora = performance.now()
    const dtS = Math.min((ahora - ultimoMs) / 1000, 0.1)
    ultimoMs = ahora
    const w = lienzo.clientWidth || 800
    const h = lienzo.clientHeight || 600
    if (lienzo.width !== w || lienzo.height !== h) {
      lienzo.width = w
      lienzo.height = h
    }
    gl.viewport(0, 0, lienzo.width, lienzo.height)
    const estado = nucleo.avanzarCuadro(dtS, velocidad, pausado)
    // `pos` reutiliza las tuplas (cero allocs): el núcleo ya escribió centros.
    {
      const q = nucleo.centros
      for (let i = 0; i < pos.length; i++) {
        pos[i][0] = q[i * 4]
        pos[i][1] = q[i * 4 + 1]
        pos[i][2] = q[i * 4 + 2]
      }
    }
    gl.clearColor(0.03, 0.03, 0.1, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)

    const vp = multiplicar(matrizProyeccion(w / h), matrizVista(cam))
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // Estrellas: un draw de puntos fijos.
    gl.useProgram(progPts)
    gl.uniformMatrix4fv(locVPPts, false, vp)
    gl.bindVertexArray(vaoPts)
    gl.drawArrays(gl.POINTS, 0, 800)
    gl.bindVertexArray(null)

    // Explosiones por proximidad (radios visuales) con cooldown.
    if (!pausado) {
      const mundo: Array<[number, number, number]> = pos.map((p) => [p[0], p[1], p[2]])
      const ahora = performance.now()
      for (const golpe of detectarImpactos(mundo, visuales.map((v) => v.radioVisual))) {
        const clave = `${Math.min(golpe.a, golpe.b)}-${Math.max(golpe.a, golpe.b)}`
        if (puedeExplotarChispas(ultimasChispas, clave, ahora, 3000)) {
          explotarChispas(chispas, golpe.punto, 150, 6)
        }
      }
      actualizarChispas(chispas, dtS)
    }
    const chispasArr = chispasIntercaladas(chispas)
    if (chispasArr.length > 0) {
      gl.useProgram(progPts)
      gl.uniformMatrix4fv(locVPPts, false, vp)
      gl.bindBuffer(gl.ARRAY_BUFFER, bufChispas)
      gl.bufferData(gl.ARRAY_BUFFER, chispasArr, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0)
      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 28, 12)
      gl.enableVertexAttribArray(2)
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 28, 16)
      gl.drawArrays(gl.POINTS, 0, chispasArr.length / 7)
    }

    // Planetas: un draw por cuerpo (samplers fijos, solo cambia uSlot).
    gl.useProgram(prog)
    gl.uniformMatrix4fv(locVP, false, vp)
    for (let k = 0; k < locTex.length; k++) gl.uniform1i(locTex[k], k)
    gl.bindVertexArray(vaoEsfera)
    // Rotación propia: reloj de PARED propio, avanzado solo si no está pausado.
    if (!pausado) relojRotacion += dtS
    visuales.forEach((c, i) => {
      const [x, y, z] = pos[i] ?? [10, 0, 0]
      gl.uniform3f(locCentro, x, y, z)
      gl.uniform1f(locRadio, c.radioVisual)
      // Ángulo por cuerpo con su período real (ver `anguloRotacion`).
      gl.uniform1f(locGiro, anguloRotacion(c, relojRotacion))
      gl.uniform3f(locColor, c.color[0], c.color[1], c.color[2])
      gl.uniform1f(locTipo, tipoPlaneta(c.id))
      gl.uniform1i(locSlot, slotTextura(c.id))
      gl.drawElements(gl.TRIANGLES, esf.idx.length, gl.UNSIGNED_SHORT, 0)
    })
    gl.bindVertexArray(null)

    // Sin círculos decorativos: solo estelas vivas (trayectoria recorrida).
    gl.useProgram(progOrb)
    gl.uniformMatrix4fv(locVPOrb, false, vp)
    gl.uniform1f(locAlphaOrb, 1)
    gl.bindVertexArray(vaoOrb)
    // Estelas: solo con fuente viva se muestrean en tiempo SIM con paso fijo
    // (curva real, no cuerdas). En `cargando` no hay reloj que muestrear.
    if (!pausado && estado === 'vivo') {
      const tFuente = nucleo.tiempo
      visuales.forEach((_c, i) => {
        registroEstela.registrar(estelas[i], tFuente, epoca, (ts) =>
          nucleo.posicionEn(ts, i, raspaPos) ? raspaPos : null,
        )
      })
    }
    // Line-list, no strip: así los cortes de la estela (hueco, época, salto
    // imposible) son huecos de verdad. La lógica de corte vive en `aSegmentos`
    // (compartida con ULTRA) y está cubierta por tests.
    visuales.forEach((c, i) => {
      const e = estelas[i]
      if (!e || e.cantidad < 2) return
      const segs = raspaSegs[i]
      segs.length = 0
      aSegmentos(e, c.color, estado === 'vivo' ? PASO_ESTELA_SIM : 0, segs)
      if (segs.length < 14) return
      gl.uniform3f(locColorOrb, c.color[0], c.color[1], c.color[2])
      const vista = raspaFloat.vista(segs.length)
      vista.set(segs)
      gl.bindBuffer(gl.ARRAY_BUFFER, bufEstela)
      gl.bufferData(gl.ARRAY_BUFFER, vista, gl.DYNAMIC_DRAW)
      nucleo.medidor.sumarBytes(vista.byteLength)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0)
      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 28, 24)
      gl.drawArrays(gl.LINES, 0, segs.length / 7)
    })
    gl.bindVertexArray(null)
    gl.disable(gl.BLEND)
    nucleo.medidor.marco(performance.now() - ahora)
  }
  requestAnimationFrame(cuadro)

  return {
    alternarPausa: () => { pausado = !pausado },
    fijarVelocidad: (v: number) => { velocidad = v },
    fijarRitmo: (r: number) => nucleo.fijarRitmo(r),
    leerRitmo: () => nucleo.leerRitmo(),
    fijarFuente: (f: FuenteEstados | null, limpiar = true) => {
      nucleo.fijarFuente(f)
      // El muestreo en tiempo sim parte de cero en cada fuente.
      registroEstela.reiniciar()
      if (limpiar) {
        for (const e of estelas) limpiarEstela(e)
      } else {
        // Resembrado: la estela es historia real, pero de otro vuelo. Se marca
        // época nueva para no unir los dos tramos con una recta.
        epoca += 1
      }
    },
    leerTiempo: () => nucleo.leerTiempo(),
    leerMedicion: () => nucleo.medir(),
    anexarBloques: (nuevos: Float32Array[]) => { nucleo.anexarBloques(nuevos) },
    podar: (mantenerDesde: number) => { nucleo.podar(mantenerDesde) },
    leerBloqueActual: () => nucleo.leerBloqueActual(),
    leerPosicionesActuales: () => {
      const salida = nucleo.leerPosicionesSI(escalaMundo(visuales))
      return salida ? [...salida] : null
    },
    destruir: () => { vivo = false; desconectar() },
  }
}
