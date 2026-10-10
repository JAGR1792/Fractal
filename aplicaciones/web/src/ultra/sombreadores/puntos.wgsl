// Estrellas y chispas ULTRA: puntos con brillo y color por vértice.
// Un draw para estrellas fijas y otro para explosiones (mismo pipeline).

struct Uniformes {
  viewProj: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> u: Uniformes;

struct Salida {
  @builtin(position) pos: vec4<f32>,
  @location(0) brillo: f32,
  @location(1) color: vec3<f32>,
}

@vertex
fn vs(
  @location(0) p: vec3<f32>,
  @location(1) b: f32,
  @location(2) col: vec3<f32>,
) -> Salida {
  var s: Salida;
  s.pos = u.viewProj * vec4<f32>(p, 1.0);
  s.brillo = b;
  s.color = col;
  return s;
}

@fragment
fn fs(e: Salida) -> @location(0) vec4<f32> {
  return vec4<f32>(e.color * e.brillo, e.brillo);
}
