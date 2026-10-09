// Órbitas ULTRA: líneas con color por vértice + fading de trail.
// Un solo vertex buffer merged para todas las órbitas (ver gpu.ts).

struct Uniformes {
  viewProj: mat4x4<f32>,
  luzDir: vec3<f32>,
  tiempo: f32,
  camPos: vec3<f32>,
  brillo: f32,
}

@group(0) @binding(0) var<uniform> u: Uniformes;

struct Salida {
  @builtin(position) pos: vec4<f32>,
  @location(0) color: vec3<f32>,
  @location(1) alpha: f32,
}

@vertex
fn vs(
  @location(0) p: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) alpha: f32,
) -> Salida {
  var s: Salida;
  s.pos = u.viewProj * vec4<f32>(p, 1.0);
  s.color = color;
  s.alpha = alpha;
  return s;
}

@fragment
fn fs(e: Salida) -> @location(0) vec4<f32> {
  return vec4<f32>(e.color * u.brillo, e.alpha);
}
