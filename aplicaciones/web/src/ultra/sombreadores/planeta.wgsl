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
  // Rotación propia atada al TIEMPO SIMULADO (u.spin en segundos):
  // la luna está acoplada por marea: gira una vez por órbita.
  let giro = u.spin * 6.2831853 / periodoRotacion(c.w);
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

/// Período de rotación propia en segundos sim (la luna: 27.32 días, acoplada).
fn periodoRotacion(tipo: f32) -> f32 {
  if (tipo < 0.5) {
    return 2160000.0;
  }
  if (tipo < 1.5) {
    return 86164.0;
  }
  if (tipo < 2.5) {
    return 2360448.0;
  }
  return 86400.0;
}

// Elige la muestra según el slot (flujo uniforme: se muestrean las 10).
fn muestraSlot(slot: u32, uv: vec2<f32>) -> vec3<f32> {
  var m = textureSample(tex0, muestreador, uv).rgb;
  if (slot == 1u) {
    m = textureSample(tex1, muestreador, uv).rgb;
  }
  if (slot == 2u) {
    m = textureSample(tex2, muestreador, uv).rgb;
  }
  if (slot == 3u) {
    m = textureSample(tex3, muestreador, uv).rgb;
  }
  if (slot == 4u) {
    m = textureSample(tex4, muestreador, uv).rgb;
  }
  if (slot == 5u) {
    m = textureSample(tex5, muestreador, uv).rgb;
  }
  if (slot == 6u) {
    m = textureSample(tex6, muestreador, uv).rgb;
  }
  if (slot == 7u) {
    m = textureSample(tex7, muestreador, uv).rgb;
  }
  if (slot == 8u) {
    m = textureSample(tex8, muestreador, uv).rgb;
  }
  if (slot == 9u) {
    m = textureSample(tex9, muestreador, uv).rgb;
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

  var base = e.color;
  if (e.slot < 10u) {
    base = muestraSlot(e.slot, e.uv);
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
