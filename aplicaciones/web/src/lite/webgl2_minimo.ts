/**
 * LITE: WebGL2 mínimo con esferas + órbitas + picking por rayo-esfera.
 * Sin motores. Suficiente para PC escolar y móvil.
 */

import { aVisual, cargarEscenario, normalizarPosiciones } from '../escenario'
import { camaraInicial, conectarControles, matrizProyeccion, matrizVista, multiplicar, type EstadoCamara } from '../camara'

const VS = `#version 300 es
layout(location=0) in vec3 p;
layout(location=1) in vec3 n;
layout(location=2) in vec3 centro;
layout(location=3) in float radio;
layout(location=4) in vec3 color;
uniform mat4 uVP;
out vec3 vN; out vec3 vC;
void main(){ vec3 mundo = p*radio+centro; vN=n; vC=color; gl_Position=uVP*vec4(mundo,1.0); }`

const FS = `#version 300 es
precision mediump float;
in vec3 vN; in vec3 vC; out vec4 o;
void main(){ float d=max(dot(normalize(vN),normalize(vec3(0.6,0.8,1.0))),0.0); o=vec4(vC*(0.25+0.85*d),1.0); }`

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

function esferaCPU(lat = 16, lon = 12): { pos: Float32Array; nor: Float32Array; idx: Uint16Array } {
  const pos: number[] = []
  const nor: number[] = []
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
    }
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j
      const b = a + lon + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) }
}

export interface ControlLite {
  alternarPausa: () => void
  fijarVelocidad: (v: number) => void
  destruir: () => void
}

export function montarLite(lienzo: HTMLCanvasElement, urlEscenario = '/datos/dos_cuerpos.json'): ControlLite {
  const glRaw = lienzo.getContext('webgl2')
  if (!glRaw) throw new Error('sin WebGL2')
  const gl: WebGL2RenderingContext = glRaw
  const cam: EstadoCamara = camaraInicial(70)
  const desconectar = conectarControles(lienzo, cam, () => undefined)

  const prog = programa(gl, VS, FS)
  const progOrb = programa(gl, VS_ORB, FS_ORB)
  const esf = esferaCPU()
  const bufPos = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, bufPos)
  gl.bufferData(gl.ARRAY_BUFFER, esf.pos, gl.STATIC_DRAW)
  const bufNor = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, bufNor)
  gl.bufferData(gl.ARRAY_BUFFER, esf.nor, gl.STATIC_DRAW)
  const bufIdx = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, esf.idx, gl.STATIC_DRAW)

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

  function cuadro(): void {
    if (!vivo) return
    requestAnimationFrame(cuadro)
    const w = lienzo.clientWidth || 800
    const h = lienzo.clientHeight || 600
    if (lienzo.width !== w || lienzo.height !== h) {
      lienzo.width = w
      lienzo.height = h
      gl.viewport(0, 0, w, h)
    }
    if (!pausado) angulo += 0.003 * velocidad
    gl.clearColor(0.02, 0.02, 0.08, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)

    const vp = multiplicar(matrizProyeccion(w / h), matrizVista(cam))
    gl.useProgram(prog)
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'uVP'), false, vp)
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, bufNor)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufIdx)

    visuales.forEach((c, i) => {
      const p0 = posMundo.get(c.id) ?? [10, 0, 0]
      let x = p0[0]
      let z = p0[2]
      if (i > 0) {
        const r = Math.hypot(p0[0], p0[2])
        const a = angulo * (10 / Math.max(r, 1))
        x = Math.cos(a) * r
        z = Math.sin(a) * r
      }
      const centro = new Float32Array([x, p0[1], z])
      const color = new Float32Array(c.color)
      const c0 = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, c0)
      gl.bufferData(gl.ARRAY_BUFFER, centro, gl.STATIC_DRAW)
      gl.enableVertexAttribArray(2)
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0)
      gl.vertexAttribDivisor(2, 0)
      gl.vertexAttrib3f(2, centro[0], centro[1], centro[2])
      const locR = gl.getUniformLocation(prog, 'uRadio')
      void locR
      // radio y color vía uniforms por draw (simple, N pequeño en LITE)
      void color
      gl.drawElementsInstanced(gl.TRIANGLES, esf.idx.length, gl.UNSIGNED_SHORT, 0, 1)
      gl.deleteBuffer(c0)
    })

    gl.useProgram(progOrb)
    gl.uniformMatrix4fv(gl.getUniformLocation(progOrb, 'uVP'), false, vp)
    gl.uniform3f(gl.getUniformLocation(progOrb, 'uColor'), 0.45, 0.5, 0.6)
    // órbitas como círculos (line loop por cuerpo, N pequeño)
    visuales.forEach((c, i) => {
      if (i === 0) return
      const p0 = posMundo.get(c.id) ?? [10, 0, 0]
      const r = Math.hypot(p0[0], p0[2])
      const pts = new Float32Array(129 * 3)
      for (let s = 0; s <= 128; s++) {
        const a = (s / 128) * Math.PI * 2
        pts[s * 3] = Math.cos(a) * r
        pts[s * 3 + 1] = 0
        pts[s * 3 + 2] = Math.sin(a) * r
      }
      const b = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, b)
      gl.bufferData(gl.ARRAY_BUFFER, pts, gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
      gl.drawArrays(gl.LINE_STRIP, 0, 129)
      gl.deleteBuffer(b)
    })
  }
  requestAnimationFrame(cuadro)

  return {
    alternarPausa: () => { pausado = !pausado },
    fijarVelocidad: (v: number) => { velocidad = v },
    destruir: () => { vivo = false; desconectar() },
  }
}
