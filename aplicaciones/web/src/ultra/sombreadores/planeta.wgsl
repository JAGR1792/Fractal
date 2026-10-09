// Planeta ULTRA: vertex mínimo con fresnel placeholder.
// TODO Etapa 2: PBR + terminator día/noche + atmósfera.
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  var p = array<vec4<f32>, 3>(
    vec4<f32>(-0.5, -0.5, 0.0, 1.0),
    vec4<f32>(0.5, -0.5, 0.0, 1.0),
    vec4<f32>(0.0, 0.5, 0.0, 1.0),
  );
  return p[i];
}

@fragment
fn fs() -> @location(0) vec4<f32> {
  return vec4<f32>(0.2, 0.4, 0.9, 1.0);
}
