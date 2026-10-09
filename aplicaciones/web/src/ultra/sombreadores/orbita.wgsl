// Órbitas ULTRA: línea con degradado placeholder.
// TODO Etapa 2: buffer merged con color por vértice + fading de trail.
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  var p = array<vec4<f32>, 2>(
    vec4<f32>(-1.0, 0.0, 0.0, 1.0),
    vec4<f32>(1.0, 0.0, 0.0, 1.0),
  );
  return p[i];
}

@fragment
fn fs() -> @location(0) vec4<f32> {
  return vec4<f32>(0.8, 0.8, 0.8, 1.0);
}
