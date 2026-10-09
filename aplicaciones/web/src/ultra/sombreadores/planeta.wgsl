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
  let mundo = vec3<f32>(vertice * d.x + c.xyz);
  var s: Salida;
  s.pos = u.viewProj * vec4<f32>(mundo, 1.0);
  s.normal = normal;
  s.color = d.yzw;
  s.vista = mundo;
  s.tipo = c.w;
  s.uv = uv;
  return s;
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
    base = textureSample(texTierra, muestreador, e.uv).rgb;
  } else if (e.tipo > 1.5 && e.tipo < 2.5) {
    base = textureSample(texLuna, muestreador, e.uv).rgb;
  }
  var col = base * (ambiente + dia * 0.85) * u.brillo;
  // Fresnel atmosférico en el borde, con vista real (gris en la luna).
  let borde = pow(1.0 - max(dot(n, haciaVista), 0.0), 2.5);
  let esLuna = step(1.5, e.tipo) * (1.0 - step(2.5, e.tipo));
  let tinte = mix(vec3<f32>(0.3, 0.55, 1.0), vec3<f32>(0.7), esLuna);
  col += tinte * borde * 0.4 * (0.25 + 0.75 * dia);
  return vec4<f32>(col, 1.0);
}
