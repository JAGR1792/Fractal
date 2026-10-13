// Planeta ULTRA: esfera instanciada con texturas NASA + luz + fresnel.
// Instancias: centro (vec3) + tipo (f32) + radio (f32) + color (vec3) vía
// storage, más slot de textura (u32, 0xffffffff = procedural).
// Vértices: esfera unitaria generada en CPU (pos + normal + uv equirect).
//
// Tipos (ver escenario.ts tipoPlaneta): 0=sol emissive, 1=tierra, 2=luna,
// 3=genérico. Los slots salen del catálogo TEXTURAS_POR_ID (0=tierra,
// 1=luna, 2=mercurio, 3=venus, 4=marte, 5=júpiter, 6=saturno, 7=urano,
// 8=neptuno, 9=sol).

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
@group(0) @binding(3) var tex0: texture_2d<f32>;
@group(0) @binding(4) var tex1: texture_2d<f32>;
@group(0) @binding(5) var tex2: texture_2d<f32>;
@group(0) @binding(6) var tex3: texture_2d<f32>;
@group(0) @binding(7) var tex4: texture_2d<f32>;
@group(0) @binding(8) var tex5: texture_2d<f32>;
@group(0) @binding(9) var tex6: texture_2d<f32>;
@group(0) @binding(10) var tex7: texture_2d<f32>;
@group(0) @binding(11) var tex8: texture_2d<f32>;
@group(0) @binding(12) var tex9: texture_2d<f32>;
@group(0) @binding(13) var muestreador: sampler;
@group(0) @binding(14) var<storage, read> texSlots: array<u32>;
// Ángulo de rotación propia por cuerpo, ya acotado a [0, 2π) en la CPU.
// Va al final para no renumerar los bindings de las texturas.
@group(0) @binding(15) var<storage, read> giros: array<f32>;

struct Salida {
  @builtin(position) pos: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) color: vec3<f32>,
  @location(2) vista: vec3<f32>,
  @location(3) tipo: f32,
  @location(4) uv: vec2<f32>,
  @location(5) @interpolate(flat) slot: u32,
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
  // Rotación propia: el ángulo ya viene calculado en la CPU (f64) y acotado a
  // [0, 2π) por cuerpo, así que aquí no se multiplica tiempo por frecuencia.
  // Cada cuerpo tiene su período real (Venus 243 días retrógrados, Júpiter
  // 9,9 h) en vez de las 24 h que se aplicaban a todos.
  let giro = giros[inst];
  let mundo = vec3<f32>(rotY(vertice, giro) * d.x + c.xyz);
  var s: Salida;
  s.pos = u.viewProj * vec4<f32>(mundo, 1.0);
  s.normal = rotY(normal, giro);
  s.color = d.yzw;
  s.vista = mundo;
  s.tipo = c.w;
  s.uv = uv;
  s.slot = texSlots[inst];
  return s;
}

/// Rota un vector alrededor del eje Y (rotación propia de los cuerpos).
fn rotY(p: vec3<f32>, a: f32) -> vec3<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec3<f32>(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

// Elige la muestra según el slot. OJO: no muestrea aquí dentro — WGSL
// exige textureSample en flujo uniforme, así que el llamador muestrea las
// 10 arriba y esta función solo selecciona.
fn eligeMuestra(
  slot: u32,
  m0: vec3<f32>,
  m1: vec3<f32>,
  m2: vec3<f32>,
  m3: vec3<f32>,
  m4: vec3<f32>,
  m5: vec3<f32>,
  m6: vec3<f32>,
  m7: vec3<f32>,
  m8: vec3<f32>,
  m9: vec3<f32>,
) -> vec3<f32> {
  var m = m0;
  if (slot == 1u) {
    m = m1;
  }
  if (slot == 2u) {
    m = m2;
  }
  if (slot == 3u) {
    m = m3;
  }
  if (slot == 4u) {
    m = m4;
  }
  if (slot == 5u) {
    m = m5;
  }
  if (slot == 6u) {
    m = m6;
  }
  if (slot == 7u) {
    m = m7;
  }
  if (slot == 8u) {
    m = m8;
  }
  if (slot == 9u) {
    m = m9;
  }
  return m;
}

@fragment
fn fs(e: Salida) -> @location(0) vec4<f32> {
  let n = normalize(e.normal);
  let l = normalize(u.luzDir);
  let haciaVista = normalize(u.camPos - e.vista);
  let dia = smoothstep(-0.08, 0.25, dot(n, l));
  let ambiente = 0.35;

  // Muestreo incondicional en flujo uniforme (WGSL lo exige: e.slot varía
  // por instancia y no vale dentro de ramas).
  let m0 = textureSample(tex0, muestreador, e.uv).rgb;
  let m1 = textureSample(tex1, muestreador, e.uv).rgb;
  let m2 = textureSample(tex2, muestreador, e.uv).rgb;
  let m3 = textureSample(tex3, muestreador, e.uv).rgb;
  let m4 = textureSample(tex4, muestreador, e.uv).rgb;
  let m5 = textureSample(tex5, muestreador, e.uv).rgb;
  let m6 = textureSample(tex6, muestreador, e.uv).rgb;
  let m7 = textureSample(tex7, muestreador, e.uv).rgb;
  let m8 = textureSample(tex8, muestreador, e.uv).rgb;
  let m9 = textureSample(tex9, muestreador, e.uv).rgb;
  var base = e.color;
  if (e.slot < 10u) {
    base = eligeMuestra(e.slot, m0, m1, m2, m3, m4, m5, m6, m7, m8, m9);
  }
  var col = base * (ambiente + dia * 0.85) * u.brillo;
  // Fresnel atmosférico en el borde, con vista real (gris en la luna).
  let borde = pow(1.0 - max(dot(n, haciaVista), 0.0), 2.5);
  let esLuna = step(1.5, e.tipo) * (1.0 - step(2.5, e.tipo));
  let tinte = mix(vec3<f32>(0.3, 0.55, 1.0), vec3<f32>(0.7), esLuna);
  col += tinte * borde * 0.4 * (0.25 + 0.75 * dia);

  // Sol emissive sin noche: mezcla final, sin returns tempranos.
  let pulso = 0.92 + 0.08 * sin(u.tiempo * 2.0 + e.vista.x);
  let colSol = base * 1.5 * pulso * u.brillo + vec3<f32>(0.35, 0.12, 0.02);
  col = mix(col, colSol, 1.0 - step(0.5, e.tipo));
  return vec4<f32>(col, 1.0);
}
