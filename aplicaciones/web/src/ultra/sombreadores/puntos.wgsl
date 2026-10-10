// Estrellas ULTRA: puntos fijos en un cascarón lejano (1 px, sin textura).
// Un solo draw de point-list; el brillo varía por vértice.

struct Uniformes {
  viewProj: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> u: Uniformes;

struct Salida {
  @builtin(position) pos: vec4<f32>,
  @location(0) brillo: f32,
}

@vertex
fn vs(@location(0) p: vec3<f32>, @location(1) b: f32) -> Salida {
  var s: Salida;
  s.pos = u.viewProj * vec4<f32>(p, 1.0);
  s.brillo = b;
  return s;
}

@fragment
fn fs(e: Salida) -> @location(0) vec4<f32> {
  return vec4<f32>(vec3<f32>(0.85, 0.9, 1.0) * e.brillo, 1.0);
}
