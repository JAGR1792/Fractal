// Cómputo ULTRA: interpolación entre snapshots + conteo de visibles.
// Lee t0/t1 (x,y,z por cuerpo), escribe posiciones interpoladas.
// El culling fino se hace en CPU con codigo/renderizado (espejo TS); aquí solo interpola.

@group(0) @binding(0) var<storage, read> snapA: array<vec3<f32>>;
@group(0) @binding(1) var<storage, read> snapB: array<vec3<f32>>;
@group(0) @binding(2) var<storage, read_write> salida: array<vec3<f32>>;
@group(0) @binding(3) var<uniform> t: f32;

@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= arrayLength(&salida)) {
    return;
  }
  salida[i] = mix(snapA[i], snapB[i], vec3<f32>(t, t, t));
}
