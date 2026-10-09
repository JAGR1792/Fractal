// Planeta ULTRA: esfera instanciada con luz direccional + fresnel atmosférico.
// Instancias: centro (vec3) + radio (f32) + color (vec3) vía storage.
// Vértices: esfera unitaria generada en CPU (pos + normal).

struct Uniformes {
  viewProj: mat4x4<f32>,
  luzDir: vec3<f32>,
  tiempo: f32,
  brillo: f32,
}

@group(0) @binding(0) var<uniform> u: Uniformes;
@group(0) @binding(1) var<storage, read> centros: array<vec3<f32>>;
@group(0) @binding(2) var<storage, read> datos: array<vec4<f32>>; // x=radio, yzw=color

struct Salida {
  @builtin(position) pos: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) vista: vec3<f32>,
}

@vertex
fn vs(
  @location(0) vertice: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @builtin(instance_index) inst: u32,
) -> Salida {
  let c = centros[inst];
  let d = datos[inst];
  let mundo = vec3<f32>(vertice * d.x + c);
  var s: Salida;
  s.pos = u.viewProj * vec4<f32>(mundo, 1.0);
  s.normal = normal;
  s.color = d.yzw;
  s.vista = mundo;
  return s;
}

@fragment
fn fs(e: Salida) -> @location(0) vec4<f32> {
  let n = normalize(e.normal);
  let l = normalize(u.luzDir);
  let difuso = max(dot(n, l), 0.0);
  // Terminator suave día/noche
  let dia = smoothstep(-0.08, 0.25, dot(n, l));
  let ambiente = 0.12;
  var col = e.color * (ambiente + dia * 0.95) * u.brillo;
  // Fresnel atmosférico en el borde
  let borde = pow(1.0 - abs(dot(n, normalize(vec3<f32>(0.0, 0.0, 1.0)))), 2.5);
  col += vec3<f32>(0.3, 0.55, 1.0) * borde * 0.35 * dia;
  return vec4<f32>(col, 1.0);
}
