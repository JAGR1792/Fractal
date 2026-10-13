/**
 * LITE: WebGL2 mínimo con esferas + órbitas.
 * Sin motores. Un draw por cuerpo (N pequeño en LITE).
 */

import { aVisual, cargarEscenario, escalaMundo, normalizarPosiciones, tipoPlaneta, urlTextura } from '../escenario'
import { camaraInicial, conectarControles, matrizProyeccion, matrizVista, multiplicar, type EstadoCamara } from '../camara'
import { aSegmentos, crearEstela, empujarEstela, generarEstrellas, PASO_ESTELA_SIM, RegistroEstela, type Estela } from '../estelas'
import { crearSistema, actualizar as actualizarChispas, aIntercalado as chispasIntercaladas, explotar as explotarChispas, puedeExplotar as puedeExplotarChispas } from '../particulas'
import { detectarImpactos } from '../mecanica'
import { interpolarBloque } from '../binario'
import { avanzar, bloqueActual, crearFrontera, instanteDe, reanclar } from '../frontera'
import type { FuenteEstados } from '../api'

const VS = `#version 300 es
precision mediump float;
layout(location=0) in vec3 p;
layout(location=1) in vec3 n;
layout(location=2) in vec2 uv;
uniform mat4 uVP;
uniform vec3 uCentro;
uniform float uRadio;
uniform float uTipo;
uniform float uSpin;
out vec3 vN; out vec3 vC; out vec2 vUV;
uniform vec3 uColor;
vec3 rotY(vec3 q, float a){ float c = cos(a); float s = sin(a); return vec3(c*q.x + s*q.z, q.y, -s*q.x + c*q.z); }
float periodo(float t){ if (t < 0.5) return 2160000.0; if (t < 1.5) return 86164.0; if (t < 2.5) return 2360448.0; return 86400.0; }
void main(){
  float g = uSpin * 6.2831853 / periodo(uTipo);
  vec3 pr = rotY(p, g);
  vec3 mundo = pr*uRadio+uCentro; vN=rotY(n, g); vC=uColor; vUV=uv; gl_Position=uVP*vec4(mundo,1.0);
}`

const FS = `#version 300 es
precision mediump float;
in vec3 vN; in vec3 vC; in vec2 vUV; out vec4 o;
uniform float uTipo;
uniform sampler2D uTexTierra;
uniform sampler2D uTexLuna;
void main(){
  vec3 n = normalize(vN);
  vec3 base = vC;
  if (uTipo > 0.5 && uTipo < 1.5) {
    base = texture(uTexTierra, vUV).rgb;
  } else if (uTipo > 1.5 && uTipo < 2.5) {
    base = texture(uTexLuna, vUV).rgb;
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
  /** Cambia la fuente (`limpiar=false` conserva estelas en encadenados). */
  fijarFuente: (f: FuenteEstados | null, limpiar?: boolean) => void
  /** Añade bloques del stream (sin resetear el reloj). */
  anexarBloques: (nuevos: Float32Array[]) => void
  /** Poda bloques con t < `mantenerDesde` (memoria acotada). */
  podar: (mantenerDesde: number) => void
  /** Segundos simulados actuales (para el reloj de la barra). */
  leerTiempo: () => number
  leerBloqueActual: () => Float32Array | null
  leerPosicionesActuales: () => number[] | null
  destruir: () => void
}

export function montarLite(
  lienzo: HTMLCanvasElement,
  urlEscenario = '/datos/dos_cuerpos.json',
  fuente: FuenteEstados | null = null,
): ControlLite {
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
  const locSpin = gl.getUniformLocation(prog, 'uSpin')
  const locTexTierra = gl.getUniformLocation(prog, 'uTexTierra')
  const locTexLuna = gl.getUniformLocation(prog, 'uTexLuna')
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

  // Texturas del catálogo (ver public/texturas/LEEME.md)
  const texTierra = cargarTexturaGL(gl, urlTextura('tierra') ?? '', [31, 77, 191])
  const texLuna = cargarTexturaGL(gl, urlTextura('luna') ?? '', [158, 158, 168])

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
  let tikEstela = 0
  let estelasDe = -1
  /** Época del vuelo: avanza al sembrar una fuente nueva (ver ULTRA/estelas.ts). */
  let epoca = 0

  let visuales = aVisual({
    id: 'demo', nombre: 'Demo', descripcion: '', cuerpos: [
      { id: 'sol', nombre: 'Sol', masa: 1.989e30, radio: 6.957e8, posicion: [0, 0, 0], velocidad: [0, 0, 0] },
      { id: 'tierra', nombre: 'Tierra', masa: 5.972e24, radio: 6.371e6, posicion: [1.496e11, 0, 0], velocidad: [0, 29780, 0] },
    ],
  })
  let posMundo = normalizarPosiciones(visuales)
  cargarEscenario(urlEscenario).then((esc) => {
    visuales = aVisual(esc)
    posMundo = normalizarPosiciones(visuales)
    if (visuales.length > 3) cam.distancia = 120
  }).catch(() => undefined)

  let pausado = false
  let velocidad = 1
  let angulo = 0
  let vivo = true
  let spinLite = 0
  let ultimoMs = performance.now()

  // Fuente del servidor (igual que ULTRA): interpola fotogramas binarios.
  // Sin módulo ni bucle: persigue la frontera y espera en el borde.
  const RITMO_SIM = 120000
  let escalaFuente = fuente?.escala ?? 1
  const fro = crearFrontera(fuente && fuente.bloques.length >= 2 ? fuente.bloques : null)
  // Fundido de empalme (~1 s) sobre las posiciones del frame previo.
  // Si se monta YA con servidor, el fondo es el círculo demo (ángulo 0).
  let fondoPos: Array<[number, number, number]> | null = fro.bloques
    ? visuales.map((c) => {
        const p0 = posMundo.get(c.id) ?? [10, 0, 0]
        return [p0[0], p0[1], p0[2]]
      })
    : null
  let ultimaPos: Array<[number, number, number]> = []
  let tFondo = fro.bloques ? 0 : 1

  /** Posiciones mundo de todos los cuerpos este frame (servidor o demo). */
  function posiciones(t: number): Array<[number, number, number]> {
    if (fro.bloques) {
      const b = interpolarBloque(fro.bloques, fro.bloques.length - 1, t)
      if (b) {
        return visuales.map((_v, i) => {
          const o = 1 + i * 6
          return [b[o] * escalaFuente, b[o + 2] * escalaFuente, b[o + 1] * escalaFuente]
        })
      }
    }
    return visuales.map((c, i) => {
      const p0 = posMundo.get(c.id) ?? [10, 0, 0]
      if (i === 0) return [p0[0], p0[1], p0[2]]
      const r = Math.max(Math.hypot(p0[0], p0[2]), 1)
      const a = angulo * (12 / r)
      return [Math.cos(a) * r, p0[1], Math.sin(a) * r]
    })
  }

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
    if (!pausado) angulo += 0.004 * velocidad
    const hayServidor = fro.bloques !== null && fro.bloques.length >= 2
    let t = 0
    if (hayServidor) {
      t = avanzar(fro, dtS, velocidad, RITMO_SIM, pausado)
      spinLite = t
    } else if (!pausado) {
      spinLite += dtS * velocidad * 1440 // segundos sim (ver periodo en GLSL)
    }
    const pos = posiciones(t)
    // La estela registra la física cruda (pre-fundido).
    const posCruda = pos.map((p) => [p[0], p[1], p[2]] as [number, number, number])
    if (tFondo < 1 && fondoPos && fondoPos.length === pos.length) {
      tFondo = Math.min(1, tFondo + dtS)
      const s = tFondo * tFondo * (3 - 2 * tFondo)
      for (let i = 0; i < pos.length; i++) {
        pos[i] = [
          fondoPos[i][0] + (pos[i][0] - fondoPos[i][0]) * s,
          fondoPos[i][1] + (pos[i][1] - fondoPos[i][1]) * s,
          fondoPos[i][2] + (pos[i][2] - fondoPos[i][2]) * s,
        ]
      }
      if (tFondo >= 1) fondoPos = null
    }
    ultimaPos = pos.map((p) => [p[0], p[1], p[2]] as [number, number, number])
    gl.clearColor(0.03, 0.03, 0.1, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)

    const vp = multiplicar(matrizProyeccion(w / h), matrizVista(cam))
    // Si cambió el escenario, las estelas viejas mentirían: se limpian.
    if (estelasDe !== visuales.length) {
      estelasDe = visuales.length
      estelas.length = 0
    }
    while (estelas.length < visuales.length) estelas.push(crearEstela(600))
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

    // Planetas: un draw por cuerpo
    gl.useProgram(prog)
    gl.uniformMatrix4fv(locVP, false, vp)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texTierra)
    gl.uniform1i(locTexTierra, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, texLuna)
    gl.uniform1i(locTexLuna, 1)
    gl.uniform1f(locSpin, spinLite)
    gl.bindVertexArray(vaoEsfera)
    visuales.forEach((c, i) => {
      const [x, y, z] = pos[i] ?? [10, 0, 0]
      gl.uniform3f(locCentro, x, y, z)
      gl.uniform1f(locRadio, c.radioVisual)
      gl.uniform3f(locColor, c.color[0], c.color[1], c.color[2])
      gl.uniform1f(locTipo, tipoPlaneta(c.id))
      gl.drawElements(gl.TRIANGLES, esf.idx.length, gl.UNSIGNED_SHORT, 0)
    })
    gl.bindVertexArray(null)

    // Sin círculos decorativos: solo estelas vivas (trayectoria recorrida).
    gl.useProgram(progOrb)
    gl.uniformMatrix4fv(locVPOrb, false, vp)
    gl.uniform1f(locAlphaOrb, 1)
    gl.bindVertexArray(vaoOrb)
    tikEstela += 1
    // Estelas: con servidor se muestrean en tiempo SIM con paso fijo (curva
    // real, no cuerdas); en demo local no hay reloj sim que muestrear, así que
    // se registra por fotograma como antes.
    if (!pausado && hayServidor) {
      const bl = fro.bloques
      if (bl) {
        visuales.forEach((_c, i) => {
          registroEstela.registrar(estelas[i], fro.tiempo, epoca, (ts) => {
            const b = interpolarBloque(bl, bl.length - 1, ts)
            if (!b) return null
            const o = 1 + i * 6
            return [b[o] * escalaFuente, b[o + 2] * escalaFuente, b[o + 1] * escalaFuente]
          })
        })
      }
    } else if (!pausado && tikEstela % 2 === 0) {
      const ahoraEstela = performance.now()
      visuales.forEach((_c, i) => {
        const p = posCruda[i] ?? [10, 0, 0]
        const e = estelas[i]
        if (e) empujarEstela(e, [p[0], p[1], p[2]], spinLite, epoca, ahoraEstela)
      })
    }
    // Line-list, no strip: así los cortes de la estela (hueco, época, salto
    // imposible) son huecos de verdad. La lógica de corte vive en `aSegmentos`
    // (compartida con ULTRA) y está cubierta por tests.
    visuales.forEach((c, i) => {
      const e = estelas[i]
      if (!e || e.puntos.length < 2) return
      const segs = aSegmentos(e, c.color, hayServidor ? PASO_ESTELA_SIM : 0)
      if (segs.length < 14) return
      gl.uniform3f(locColorOrb, c.color[0], c.color[1], c.color[2])
      gl.bindBuffer(gl.ARRAY_BUFFER, bufEstela)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(segs), gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0)
      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 28, 24)
      gl.drawArrays(gl.LINES, 0, segs.length / 7)
    })
    gl.bindVertexArray(null)
    gl.disable(gl.BLEND)
  }
  requestAnimationFrame(cuadro)

  return {
    alternarPausa: () => { pausado = !pausado },
    fijarVelocidad: (v: number) => { velocidad = v },
    fijarFuente: (f: FuenteEstados | null, limpiar = true) => {
      // Fundido SOLO al bifurcar (limpiar=true: cambió el escenario).
      if (limpiar) {
        fondoPos = ultimaPos.map((p) => [p[0], p[1], p[2]] as [number, number, number])
        tFondo = 0
      } else {
        fondoPos = null
        tFondo = 1
      }
      // COPIA, no referencia (ver ULTRA: compartir duplicaba y sobrepodaba).
      reanclar(fro, f && f.bloques.length >= 2 ? [...f.bloques] : null)
      escalaFuente = f?.escala ?? 1
      // El muestreo en tiempo sim parte de cero en cada fuente.
      registroEstela.reiniciar()
      if (limpiar) {
        for (const e of estelas) e.puntos.length = 0
      } else {
        // Resembrado: la estela es historia real, pero de otro vuelo. Se marca
        // época nueva para no unir los dos tramos con una recta.
        epoca += 1
      }
    },
    leerTiempo: () => spinLite,
    anexarBloques: (nuevos: Float32Array[]) => {
      if (!fro.bloques || nuevos.length === 0) return
      fro.bloques.push(...nuevos)
    },
    podar: (mantenerDesde: number) => {
      const b = fro.bloques
      if (!b || b.length === 0) return
      let cortar = 0
      while (cortar < b.length - 2 && b[cortar][0] < mantenerDesde) cortar++
      if (cortar > 0) b.splice(0, cortar)
    },
    leerBloqueActual: () => bloqueActual(fro),
    leerPosicionesActuales: () => {
      // Deshace el mapeo mundo [x*e, z*e, y*e] → SI (igual en demo y servidor,
      // porque posMundo usa la misma convención que la fuente).
      const e = fro.bloques ? escalaFuente : escalaMundo(visuales)
      if (!(e > 0)) return null
      const salida: number[] = []
      for (const [x, y, z] of posiciones(instanteDe(fro))) salida.push(x / e, z / e, y / e)
      return salida
    },
    destruir: () => { vivo = false; desconectar() },
  }
}
