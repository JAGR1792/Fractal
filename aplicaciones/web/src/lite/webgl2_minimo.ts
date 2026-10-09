/**
 * LITE: WebGL2 mínimo con esferas + órbitas.
 * Sin motores. Un draw por cuerpo (N pequeño en LITE).
 */

import { aVisual, cargarEscenario, normalizarPosiciones, tipoPlaneta, urlTextura } from '../escenario'
import { camaraInicial, conectarControles, matrizProyeccion, matrizVista, multiplicar, type EstadoCamara } from '../camara'

const VS = `#version 300 es
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
layout(location=0) in vec3 p;
uniform mat4 uVP;
void main(){ gl_Position=uVP*vec4(p,1.0); }`

const FS_ORB = `#version 300 es
precision mediump float;
uniform vec3 uColor; out vec4 o;
void main(){ o=vec4(uColor,1.0); }`

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
  leerTiempo: () => number
  destruir: () => void
}

export function montarLite(lienzo: HTMLCanvasElement, urlEscenario = '/datos/dos_cuerpos.json'): ControlLite {
  const glRaw = lienzo.getContext('webgl2')
  if (!glRaw) throw new Error('sin WebGL2')
  const gl: WebGL2RenderingContext = glRaw
  const cam: EstadoCamara = camaraInicial(60)
  const desconectar = conectarControles(lienzo, cam, () => undefined)

  const prog = programa(gl, VS, FS)
  const progOrb = programa(gl, VS_ORB, FS_ORB)
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
  const bufOrb = gl.createBuffer()!

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
  }).catch(() => undefined)

  let pausado = false
  let velocidad = 1
  let angulo = 0
  let vivo = true
  let spinLite = 0
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
    if (!pausado) angulo += 0.004 * velocidad
    if (!pausado) spinLite += dtS * velocidad * 1440 // segundos sim (ver periodo en GLSL)
    gl.clearColor(0.03, 0.03, 0.1, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)

    const vp = multiplicar(matrizProyeccion(w / h), matrizVista(cam))

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
      const p0 = posMundo.get(c.id) ?? [10, 0, 0]
      let x = p0[0]
      let z = p0[2]
      if (i > 0) {
        const r = Math.max(Math.hypot(p0[0], p0[2]), 1)
        const a = angulo * (12 / r)
        x = Math.cos(a) * r
        z = Math.sin(a) * r
      }
      gl.uniform3f(locCentro, x, p0[1], z)
      gl.uniform1f(locRadio, c.radioVisual)
      gl.uniform3f(locColor, c.color[0], c.color[1], c.color[2])
      gl.uniform1f(locTipo, tipoPlaneta(c.id))
      gl.drawElements(gl.TRIANGLES, esf.idx.length, gl.UNSIGNED_SHORT, 0)
    })
    gl.bindVertexArray(null)

    // Órbitas: círculos en XZ
    gl.useProgram(progOrb)
    gl.uniformMatrix4fv(locVPOrb, false, vp)
    gl.uniform3f(locColorOrb, 0.45, 0.5, 0.65)
    gl.bindVertexArray(vaoOrb)
    visuales.forEach((c, i) => {
      if (i === 0) return
      const p0 = posMundo.get(c.id) ?? [10, 0, 0]
      const r = Math.max(Math.hypot(p0[0], p0[2]), 1)
      const pts = new Float32Array(129 * 3)
      for (let s = 0; s <= 128; s++) {
        const a = (s / 128) * Math.PI * 2
        pts[s * 3] = Math.cos(a) * r
        pts[s * 3 + 1] = 0
        pts[s * 3 + 2] = Math.sin(a) * r
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, bufOrb)
      gl.bufferData(gl.ARRAY_BUFFER, pts, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
      gl.drawArrays(gl.LINE_STRIP, 0, 129)
    })
    gl.bindVertexArray(null)
  }
  requestAnimationFrame(cuadro)

  return {
    alternarPausa: () => { pausado = !pausado },
    fijarVelocidad: (v: number) => { velocidad = v },
    leerTiempo: () => spinLite,
    destruir: () => { vivo = false; desconectar() },
  }
}
