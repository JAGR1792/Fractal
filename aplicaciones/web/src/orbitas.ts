/**
 * Fuente analítica de diseño: órbitas keplerianas perfectas (sin servidor).
 *
 * Para grabar vídeo del diseño gráfico sin exponer los problemas de la
 * integración N-body: cada cuerpo sigue su elipse de dos cuerpos osculadora
 * (calculada desde las condiciones iniciales del escenario). El servidor no
 * interviene: la fuente se genera en el navegador.
 */
import { G, cuerpoCentral } from './mecanica'
import type { CuerpoVisual } from './escenario'
import { escalaMundo } from './escenario'
import { cadaNPara } from './api'
import type { FuenteEstados } from './api'

type Vec3 = [number, number, number]

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s]
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}
function norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2])
}
function normalize(a: Vec3): Vec3 {
  const n = norm(a)
  return n > 0 ? scale(a, 1 / n) : [0, 0, 0]
}

function resolverKepler(M: number, e: number): number {
  let E = M
  for (let i = 0; i < 60; i++) {
    const f = E - e * Math.sin(E) - M
    const fp = 1 - e * Math.cos(E)
    if (Math.abs(fp) < 1e-15) break
    E -= f / fp
    if (Math.abs(f) < 1e-13) break
  }
  return E
}

interface ResultadoPropagacion {
  pos: Vec3
  vel: Vec3
}

/**
 * Propaga la órbita de dos cuerpos: posición/velocidad relativas del secundario
 * respecto al primario al tiempo `t`, partiendo de r0, v0 iniciales.
 */
export function propagar(r0: Vec3, v0: Vec3, mu: number, t: number): ResultadoPropagacion {
  const r0mag = norm(r0)
  const v0mag2 = dot(v0, v0)
  if (!(mu > 0) || r0mag <= 0) {
    return { pos: [...r0], vel: [...v0] }
  }
  const h = cross(r0, v0)
  const hmag = norm(h)
  const evec = sub(scale(cross(v0, h), 1 / mu), scale(r0, 1 / r0mag))
  const e = norm(evec)
  const denom = 2 / r0mag - v0mag2 / mu
  if (!(denom > 0)) {
    // No ligada: movimiento rectilíneo uniforme.
    const pos: Vec3 = [r0[0] + v0[0] * t, r0[1] + v0[1] * t, r0[2] + v0[2] * t]
    return { pos, vel: [...v0] }
  }
  const a = 1 / denom
  const n = Math.sqrt(mu / (a * a * a))

  const hunit: Vec3 = hmag > 0 ? scale(h, 1 / hmag) : [0, 0, 1]
  let p: Vec3
  if (e > 1e-12) p = scale(evec, 1 / e)
  else p = normalize(r0)
  const q = cross(hunit, p)

  let cosNu0 = 1
  let sinNu0 = 0
  if (e > 1e-12) {
    cosNu0 = dot(evec, r0) / (e * r0mag)
    const cr = cross(evec, r0)
    sinNu0 = dot(cr, hunit) / (e * r0mag)
  }
  const E0 = Math.atan2(Math.sqrt(Math.max(0, 1 - e * e)) * sinNu0, e + cosNu0)
  const M0 = E0 - e * Math.sin(E0)
  const M = M0 + n * t
  const E = resolverKepler(M, e)
  const cosE = Math.cos(E)
  const sinE = Math.sin(E)
  const r = a * (1 - e * cosE)
  const cosNu = (cosE - e) / (1 - e * cosE)
  const sinNu = (Math.sqrt(Math.max(0, 1 - e * e)) * sinE) / (1 - e * cosE)

  const pos: Vec3 = [
    p[0] * (r * cosNu) + q[0] * (r * sinNu),
    p[1] * (r * cosNu) + q[1] * (r * sinNu),
    p[2] * (r * cosNu) + q[2] * (r * sinNu),
  ]
  const factor = Math.sqrt(mu * a) / r
  const vel: Vec3 = [
    p[0] * (factor * -sinE) + q[0] * (factor * (Math.sqrt(Math.max(0, 1 - e * e)) * cosE)),
    p[1] * (factor * -sinE) + q[1] * (factor * (Math.sqrt(Math.max(0, 1 - e * e)) * cosE)),
    p[2] * (factor * -sinE) + q[2] * (factor * (Math.sqrt(Math.max(0, 1 - e * e)) * cosE)),
  ]
  return { pos, vel }
}

function padres(vis: CuerpoVisual[]): (number | null)[] {
  const n = vis.length
  const p = vis.map((_, i) => cuerpoCentral(vis, i))
  // Resolver ciclos de dos cuerpos: el más masivo es la raíz.
  for (let i = 0; i < n; i++) {
    const j = p[i]
    if (j !== null && j !== undefined && p[j] === i) {
      if (vis[i].masa >= vis[j].masa) p[i] = null
      else p[j] = null
    }
  }
  return p
}

/**
 * Genera una fuente de estados con órbitas keplerianas perfectas.
 * No usa red: todo se calcula en el navegador.
 */
export function fuenteAnalitica(vis: CuerpoVisual[], dt: number): FuenteEstados {
  const n = vis.length
  const cada = cadaNPara(dt)
  const paso = dt * cada
  const numBloques = 20000
  const bloques: Float32Array[] = []

  // Orden descendente por masa: las raíces (Sol) se calculan primero.
  const orden = vis.map((_, i) => i).sort((a, b) => vis[b].masa - vis[a].masa)

  const esBinario = n === 2

  let baryPos0: Vec3 = [0, 0, 0]
  let baryVel0: Vec3 = [0, 0, 0]
  let muBin = 0
  let r0rel: Vec3 = [0, 0, 0]
  let v0rel: Vec3 = [0, 0, 0]
  if (esBinario) {
    const m0 = vis[0].masa
    const m1 = vis[1].masa
    const M = m0 + m1
    muBin = G * M
    r0rel = sub(vis[1].posicion, vis[0].posicion)
    v0rel = sub(vis[1].velocidad, vis[0].velocidad)
    baryPos0 = scale(add(scale(vis[0].posicion, m0), scale(vis[1].posicion, m1)), 1 / M)
    baryVel0 = scale(add(scale(vis[0].velocidad, m0), scale(vis[1].velocidad, m1)), 1 / M)
  }

  const parents = padres(vis)
  const root = orden[0]

  for (let k = 0; k < numBloques; k++) {
    const t = k * paso
    const pos: Vec3[] = vis.map((c) => [...c.posicion] as Vec3)
    const vel: Vec3[] = vis.map((c) => [...c.velocidad] as Vec3)

    if (esBinario) {
      const bary: Vec3 = add(baryPos0, scale(baryVel0, t))
      const rel = propagar(r0rel, v0rel, muBin, t)
      const m0 = vis[0].masa
      const m1 = vis[1].masa
      const M = m0 + m1
      pos[0] = sub(bary, scale(rel.pos, m1 / M))
      vel[0] = sub(baryVel0, scale(rel.vel, m1 / M))
      pos[1] = add(bary, scale(rel.pos, m0 / M))
      vel[1] = add(baryVel0, scale(rel.vel, m0 / M))
    } else {
      // Raíz fija (Sol).
      pos[root] = [...vis[root].posicion]
      vel[root] = [...vis[root].velocidad]
      for (const i of orden) {
        if (i === root) continue
        const parent = parents[i]
        if (parent === null || parent === undefined) {
          pos[i] = [...vis[i].posicion]
          vel[i] = [...vis[i].velocidad]
          continue
        }
        const rel = propagar(
          sub(vis[i].posicion, vis[parent].posicion),
          sub(vis[i].velocidad, vis[parent].velocidad),
          G * vis[parent].masa,
          t,
        )
        pos[i] = add(pos[parent], rel.pos)
        vel[i] = add(vel[parent], rel.vel)
      }
    }

    const block = new Float32Array(1 + n * 6)
    block[0] = t
    for (let i = 0; i < n; i++) {
      const o = 1 + i * 6
      block[o] = pos[i][0]
      block[o + 1] = pos[i][1]
      block[o + 2] = pos[i][2]
      block[o + 3] = vel[i][0]
      block[o + 4] = vel[i][1]
      block[o + 5] = vel[i][2]
    }
    bloques.push(block)
  }

  return { bloques, escala: escalaMundo(vis), tCalculoMs: 0 }
}
