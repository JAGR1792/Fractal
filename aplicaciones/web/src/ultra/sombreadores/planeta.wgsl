// Planeta ULTRA: esfera instanciada con texturas NASA + luz + fresnel.
// Instancias: centro (vec3) + tipo (f32) + radio (f32) + color (vec3) vía storage.
// Vértices: esfera unitaria generada en CPU (pos + normal + uv equirect).
//
// Tipos (ver escenario.ts tipoPlaneta): 0=sol emissive, 1=tierra (textura),
// 2=luna (textura), 3=genérico (color plano + luz, fallback procedural).

struct Uniformes {
  viewProj: mat4x4<f32>,
  luzDir: vec3<f32>,
  tiempo: f32,
  camPos: vec3<f32>,
  brillo: f32,
  spin: f32,
  relleno: vec3<f32>,
}

@group(0) @binding(0) var<uniform> u: Uniformes;
@group(0) @binding(1) var<storage, read> centros: array<vec4<f32>>; // xyz=centro, w=tipo
@group(0) @binding(2) var<storage, read> datos: array<vec4<f32>>; // x=radio, yzw=color
@group(0) @binding(3) var texTierra: texture_2d<f32>;
@group(0) @binding(4) var texLuna: texture_2d<f32>;
@group(0) @binding(5) var muestreador: sampler;

struct Salida {
  @builtin(position) pos: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) vista: vec3<f32>,
  @location(3) tipo: f32,
  @location(4) uv: vec2<f32>,
}

@vertex
fn vs(
  @location(0) vertice: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @builtin(instance_index) inst: u32,
) -> Salida {
  let c = centros[inst];
  let d = datos[inst];
  // Rotación propia: una vuelta de la tierra cada 60 s a 1x (ver tasaSpin).
  let giro = u.spin * tasaSpin(c.w);
  let mundo = vec3<f32>(rotY(vertice, giro) * d.x + c.xyz);
  var s: Salida;
  s.pos = u.viewProj * vec4<f32>(mundo, 1.0);
  s.normal = rotY(normal, giro);
  s.color = d.yzw;
  s.vista = mundo;
  s.tipo = c.w;
  s.uv = uv;
  return s;
}

/// Rota un vector alrededor del eje Y (rotación propia de los cuerpos).
fn rotY(p: vec3<f32>, a: f32) -> vec3<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec3<f32>(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

/// Vueltas por segundo de spin (rad/s): tierra 1/60 s, luna 1/27 días, resto lento.
fn tasaSpin(tipo: f32) -> f32 {
  if (tipo < 0.5) {
    return 0.01;
  }
  if (tipo < 1.5) {
    return 0.1047;
  }
  if (tipo < 2.5) {
    return 0.0038;
  }
  return 0.0524;
}

@fragment
fn fs(e: Salida) -> @location(0) vec4<f32> {
  let n = normalize(e.normal);
  let l = normalize(u.luzDir);
  let haciaVista = normalize(u.camPos - e.vista);
  let dia = smoothstep(-0.08, 0.25, dot(n, l));
  let ambiente = 0.35;

  // Muestreo en flujo uniforme (sin returns previos): WGSL lo exige.
  let texT = textureSample(texTierra, muestreador, e.uv).rgb;
  let texL = textureSample(texLuna, muestreador, e.uv).rgb;
  var base = e.color;
  if (e.tipo > 0.5 && e.tipo < 1.5) {
    base = texT;
  }
  if (e.tipo > 1.5 && e.tipo < 2.5) {
    base = texL;
  }
  var col = base * (ambiente + dia * 0.85) * u.brillo;
  // Fresnel atmosférico en el borde, con vista real (gris en la luna).
  let borde = pow(1.0 - max(dot(n, haciaVista), 0.0), 2.5);
  let esLuna = step(1.5, e.tipo) * (1.0 - step(2.5, e.tipo));
  let tinte = mix(vec3<f32>(0.3, 0.55, 1.0), vec3<f32>(0.7), esLuna);
  col += tinte * borde * 0.4 * (0.25 + 0.75 * dia);

  // Sol emissive sin noche: mezcla final, sin returns tempranos.
  let pulso = 0.92 + 0.08 * sin(u.tiempo * 2.0 + e.vista.x);
  let colSol = e.color * 1.5 * pulso * u.brillo + vec3<f32>(0.35, 0.12, 0.02);
  col = mix(col, colSol, 1.0 - step(0.5, e.tipo));
  return vec4<f32>(col, 1.0);
}
