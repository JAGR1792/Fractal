// Planeta ULTRA: esfera instanciada con luz direccional + fresnel atmosférico.
// Instancias: centro (vec3) + tipo (f32) + radio (f32) + color (vec3) vía storage.
// Vértices: esfera unitaria generada en CPU (pos + normal).
//
// Tipos (ver escenario.ts tipoPlaneta): 0=sol emissive, 1=tierra procedural,
// 2=luna con cráteres, 3=genérico (color plano + luz).

struct Uniformes {
  viewProj: mat4x4<f32>,
  luzDir: vec3<f32>,
  tiempo: f32,
  camPos: vec3<f32>,
  brillo: f32,
}

@group(0) @binding(0) var<uniform> u: Uniformes;
@group(0) @binding(1) var<storage, read> centros: array<vec4<f32>>; // xyz=centro, w=tipo
@group(0) @binding(2) var<storage, read> datos: array<vec4<f32>>; // x=radio, yzw=color

struct Salida {
  @builtin(position) pos: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) vista: vec3<f32>,
  @location(3) tipo: f32,
}

@vertex
fn vs(
  @location(0) vertice: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @builtin(instance_index) inst: u32,
) -> Salida {
  let c = centros[inst];
  let d = datos[inst];
  let mundo = vec3<f32>(vertice * d.x + c.xyz);
  var s: Salida;
  s.pos = u.viewProj * vec4<f32>(mundo, 1.0);
  s.normal = normal;
  s.color = d.yzw;
  s.vista = mundo;
  s.tipo = c.w;
  return s;
}

fn hash3(p: vec3<f32>) -> f32 {
  return fract(sin(dot(p, vec3<f32>(12.9898, 78.233, 37.719))) * 43758.5453);
}

fn ruido3(p: vec3<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3<f32>(1.0, 0.0, 0.0)), w.x),
        mix(hash3(i + vec3<f32>(0.0, 1.0, 0.0)), hash3(i + vec3<f32>(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash3(i + vec3<f32>(0.0, 0.0, 1.0)), hash3(i + vec3<f32>(1.0, 0.0, 1.0)), w.x),
        mix(hash3(i + vec3<f32>(0.0, 1.0, 1.0)), hash3(i + vec3<f32>(1.0, 1.0, 1.0)), w.x), w.y), w.z);
}

// Tierra: océano + continentes + casquetes + nubes a la deriva.
fn tierra(n: vec3<f32>) -> vec3<f32> {
  let oceano = vec3<f32>(0.12, 0.3, 0.75);
  let verde = vec3<f32>(0.25, 0.5, 0.2);
  let tierra_sec = vec3<f32>(0.55, 0.45, 0.3);
  let cont = ruido3(n * 3.0);
  let mascara = smoothstep(0.45, 0.55, cont);
  let variacion = ruido3(n * 6.0);
  var sup = mix(oceano, mix(verde, tierra_sec, smoothstep(0.35, 0.7, variacion)), mascara);
  let hielo = smoothstep(0.72, 0.85, abs(n.y) + 0.1 * (variacion - 0.5));
  sup = mix(sup, vec3<f32>(0.9, 0.93, 0.96), hielo);
  let nubes = smoothstep(0.55, 0.75, ruido3(n * 4.0 + vec3<f32>(u.tiempo * 0.05, 0.0, u.tiempo * 0.03)));
  sup = mix(sup, vec3<f32>(1.0), nubes * 0.55);
  return sup;
}

// Luna: gris con cráteres y mares oscuros.
fn luna(n: vec3<f32>) -> vec3<f32> {
  let base = vec3<f32>(0.62, 0.62, 0.66);
  let grano = 0.8 + 0.4 * ruido3(n * 10.0);
  let crater = step(0.82, hash3(floor(n * 16.0))) * 0.3;
  let mar = smoothstep(0.2, 0.5, ruido3(n * 2.0 + vec3<f32>(3.7))) * 0.18;
  return base * grano - vec3<f32>(crater + mar);
}

@fragment
fn fs(e: Salida) -> @location(0) vec4<f32> {
  let n = normalize(e.normal);
  let l = normalize(u.luzDir);
  let haciaVista = normalize(u.camPos - e.vista);
  let dia = smoothstep(-0.08, 0.25, dot(n, l));
  let ambiente = 0.35;

  // Sol: emissive, sin noche.
  if (e.tipo < 0.5) {
    let pulso = 0.92 + 0.08 * sin(u.tiempo * 2.0 + e.vista.x);
    var col = e.color * 1.5 * pulso * u.brillo;
    col += vec3<f32>(0.35, 0.12, 0.02);
    return vec4<f32>(col, 1.0);
  }

  var base = e.color;
  if (e.tipo > 0.5 && e.tipo < 1.5) {
    base = tierra(n);
  } else if (e.tipo > 1.5 && e.tipo < 2.5) {
    base = luna(n);
  }
  var col = base * (ambiente + dia * 0.85) * u.brillo;
  // Fresnel atmosférico en el borde, con vista real (gris en la luna).
  let borde = pow(1.0 - max(dot(n, haciaVista), 0.0), 2.5);
  let esLuna = step(1.5, e.tipo) * (1.0 - step(2.5, e.tipo));
  let tinte = mix(vec3<f32>(0.3, 0.55, 1.0), vec3<f32>(0.7), esLuna);
  col += tinte * borde * 0.4 * (0.25 + 0.75 * dia);
  return vec4<f32>(col, 1.0);
}
