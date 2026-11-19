//! Texturas planetarias reales para Fractal Local.
//!
//! Origen preferido: `aplicaciones/local/texturas/` (mapas equirectangulares
//! JPL/Celestia vía GMAT). Espejo opcional en `aplicaciones/web/public/texturas/`.
//!
//! Si el fichero falta o no pasa el umbral de calidad, cae a procedural
//! (y el HUD lo marca en rojo).

use eframe::egui::{self, Color32, ColorImage, TextureHandle, TextureOptions};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// Alias de id de cuerpo → nombre de fichero sin extensión.
fn alias_textura(id: &str) -> &str {
    match id {
        "earth" | "tierra" => "tierra",
        "moon" | "luna" => "luna",
        "sun" | "sol" => "sol",
        "mercury" | "mercurio" => "mercurio",
        "venus" => "venus",
        "mars" | "marte" | "a" | "cuerpo_a" | "leader" => "marte",
        "jupiter" | "b" | "cuerpo_b" | "follower" => "jupiter",
        "saturn" | "saturno" => "saturno",
        "uranus" | "urano" => "urano",
        "neptune" | "neptuno" | "c" | "cuerpo_c" => "neptuno",
        "sat" | "sonda" => "tierra",
        other => other,
    }
}

/// Directorios candidatos. El primero existente gana al buscar.
pub fn directorios_texturas() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // 1) Texturas propias de la app de escritorio (canónicas en AppEscritorio).
    let local = manifest.join("texturas");
    if local.is_dir() {
        dirs.push(local);
    }
    // 2) Espejo web del monorepo.
    let web = manifest.join("../web/public/texturas");
    if web.is_dir() {
        dirs.push(web);
    }
    // 3) Rutas relativas al cwd (si lanzas el binario desde la raíz del repo).
    for rel in [
        "aplicaciones/local/texturas",
        "aplicaciones/web/public/texturas",
        "texturas",
        "public/texturas",
    ] {
        let p = PathBuf::from(rel);
        if p.is_dir() && !dirs.iter().any(|d| same_dir(d, &p)) {
            dirs.push(p);
        }
    }
    dirs
}

fn same_dir(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(aa), Ok(bb)) => aa == bb,
        _ => a == b,
    }
}

fn buscar_fichero(id: &str) -> Option<PathBuf> {
    let nombre = alias_textura(id);
    // JPG primero: son las texturas reales (GMAT/JPL). PNG legacy = placeholders.
    let exts = ["jpg", "jpeg", "png", "webp"];
    for dir in directorios_texturas() {
        for ext in exts {
            let p = dir.join(format!("{nombre}.{ext}"));
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

/// Color de respaldo por id de cuerpo.
pub fn color_planeta(id: &str, indice: usize) -> Color32 {
    match alias_textura(id) {
        "sol" => Color32::from_rgb(255, 210, 80),
        "tierra" => Color32::from_rgb(70, 130, 220),
        "luna" => Color32::from_rgb(200, 200, 210),
        "marte" => Color32::from_rgb(200, 90, 50),
        "jupiter" => Color32::from_rgb(210, 170, 120),
        "saturno" => Color32::from_rgb(220, 200, 140),
        "venus" => Color32::from_rgb(230, 200, 150),
        "mercurio" => Color32::from_rgb(170, 160, 150),
        "urano" => Color32::from_rgb(140, 210, 220),
        "neptuno" => Color32::from_rgb(70, 100, 220),
        _ => {
            const COLORES: &[Color32] = &[
                Color32::from_rgb(255, 120, 80),
                Color32::from_rgb(80, 180, 255),
                Color32::from_rgb(140, 220, 120),
                Color32::from_rgb(240, 200, 90),
                Color32::from_rgb(200, 140, 255),
                Color32::from_rgb(90, 220, 200),
            ];
            COLORES[indice % COLORES.len()]
        }
    }
}

fn imagen_procedural(id: &str, indice: usize) -> ColorImage {
    let base = color_planeta(id, indice);
    let w = 192usize;
    let h = 192usize;
    let mut pixels = Vec::with_capacity(w * h);
    for y in 0..h {
        for x in 0..w {
            let nx = (x as f32 / w as f32) * 2.0 - 1.0;
            let ny = (y as f32 / h as f32) * 2.0 - 1.0;
            let r2 = nx * nx + ny * ny;
            if r2 > 1.0 {
                pixels.push(Color32::TRANSPARENT);
                continue;
            }
            let luz = (-0.5 * nx - 0.4 * ny + 0.7).clamp(0.25, 1.0);
            let a = ((1.0 - r2) * 4.0).clamp(0.0, 1.0);
            pixels.push(Color32::from_rgba_unmultiplied(
                (base.r() as f32 * luz) as u8,
                (base.g() as f32 * luz) as u8,
                (base.b() as f32 * luz) as u8,
                (255.0 * a) as u8,
            ));
        }
    }
    ColorImage { size: [w, h], pixels }
}

/// Heurística: rechaza los PNG placeholder antiguos (256×128 blob/rayas).
/// Sol/Urano de GMAT son casi uniformes pero a resolución ≥ 512 — se aceptan.
fn calidad_mapa_aceptable(rgba: &[u8], w: u32, h: u32, bytes_on_disk: usize) -> bool {
    if w < 128 || h < 64 || rgba.len() < (w as usize * h as usize * 4) {
        return false;
    }
    // Placeholders del repo eran exactamente 256×128 y < 20 KB.
    if w <= 256 && h <= 128 && bytes_on_disk < 20_000 {
        return false;
    }
    let mut hist = [0u32; 64];
    let step = ((w * h) / 4000).max(1);
    let mut i = 0usize;
    let total = (w * h) as usize;
    while i < total {
        let o = i * 4;
        let r = rgba[o] >> 6;
        let g = rgba[o + 1] >> 6;
        let b = rgba[o + 2] >> 6;
        let bin = ((r as usize) << 4) | ((g as usize) << 2) | (b as usize);
        hist[bin % 64] += 1;
        i += step as usize;
    }
    let ocupados = hist.iter().filter(|&&c| c > 0).count();
    // Mapas ricos (Tierra/Júpiter) o casi uniformes pero HD (Sol/Urano GMAT).
    ocupados >= 8 || (w >= 512 && h >= 256)
}

/// Proyecta un disco esférico muestreando un mapa equirectangular (lon/lat).
fn cargar_mapa_esfera(path: &Path) -> Result<ColorImage, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?.into_rgba8();
    let tw = img.width();
    let th = img.height();
    let raw = img.as_raw();
    if !calidad_mapa_aceptable(raw, tw, th, bytes.len()) {
        return Err(format!(
            "mapa de baja calidad / placeholder ({tw}x{th}, {} bytes)",
            bytes.len()
        ));
    }
    let tw_f = tw as f32;
    let th_f = th as f32;
    // Disco más denso → se nota el continente / bandas de Júpiter.
    let w = 256usize;
    let h = 256usize;
    let mut pixels = Vec::with_capacity(w * h);
    for y in 0..h {
        for x in 0..w {
            let nx = (x as f32 / w as f32) * 2.0 - 1.0;
            let ny = (y as f32 / h as f32) * 2.0 - 1.0;
            let r2 = nx * nx + ny * ny;
            if r2 > 1.0 {
                pixels.push(Color32::TRANSPARENT);
                continue;
            }
            let nz = (1.0 - r2).sqrt();
            let lon = nx.atan2(nz);
            let lat = ny.asin();
            let u = ((lon / (2.0 * std::f32::consts::PI)) + 0.5).rem_euclid(1.0);
            let v = (0.5 - lat / std::f32::consts::PI).clamp(0.0, 1.0);
            let px = (u * (tw_f - 1.0)) as u32;
            let py = (v * (th_f - 1.0)) as u32;
            let p = img.get_pixel(px, py);
            // Luz direccional suave (izquierda-arriba).
            let luz = (0.38 + 0.72 * (0.55 * nz - 0.28 * nx + 0.32 * (-ny)).clamp(0.0, 1.0))
                .clamp(0.22, 1.0);
            let borde = ((1.0 - r2) * 8.0).clamp(0.0, 1.0);
            pixels.push(Color32::from_rgba_unmultiplied(
                (p[0] as f32 * luz) as u8,
                (p[1] as f32 * luz) as u8,
                (p[2] as f32 * luz) as u8,
                (p[3] as f32 * borde) as u8,
            ));
        }
    }
    Ok(ColorImage { size: [w, h], pixels })
}

fn aviso_dirs() {
    static UNA_VEZ: OnceLock<()> = OnceLock::new();
    UNA_VEZ.get_or_init(|| {
        let dirs = directorios_texturas();
        if dirs.is_empty() {
            eprintln!("aviso: no se encontró aplicaciones/local/texturas — se usará procedural");
        } else {
            eprintln!("texturas: buscando en {}", dirs[0].display());
            for (i, d) in dirs.iter().enumerate().skip(1) {
                eprintln!("texturas: fallback[{i}] {}", d.display());
            }
        }
    });
}

/// Caché de texturas egui por id de cuerpo.
pub struct CatalogoTexturas {
    handles: HashMap<String, TextureHandle>,
    /// Ids (alias) cargados desde mapa real.
    reales: HashMap<String, bool>,
}

impl CatalogoTexturas {
    pub fn nuevo() -> Self {
        Self { handles: HashMap::new(), reales: HashMap::new() }
    }

    /// `(reales, total_en_caché)`.
    pub fn conteo(&self) -> (usize, usize) {
        let reales = self.reales.values().filter(|&&r| r).count();
        (reales, self.reales.len().max(self.handles.len()))
    }

    pub fn es_real(&self, id: &str) -> bool {
        self.reales.get(alias_textura(id)).copied().unwrap_or(false)
    }

    /// Rutas candidatas (para diagnóstico en HUD).
    pub fn ruta_de(&self, id: &str) -> Option<PathBuf> {
        buscar_fichero(id)
    }

    pub fn obtener(&mut self, ctx: &egui::Context, id: &str, indice: usize) -> TextureHandle {
        aviso_dirs();
        let clave = alias_textura(id).to_string();
        if let Some(h) = self.handles.get(&clave) {
            return h.clone();
        }
        let (imagen, real) = match buscar_fichero(id) {
            Some(ruta) => match cargar_mapa_esfera(&ruta) {
                Ok(img) => {
                    eprintln!("textura real: {} → {}", id, ruta.display());
                    (img, true)
                }
                Err(err) => {
                    eprintln!("ERROR textura {}: {err} — fallback procedural", ruta.display());
                    (imagen_procedural(id, indice), false)
                }
            },
            None => {
                eprintln!(
                    "ERROR: sin fichero para '{id}' (alias {}). dirs={:?}",
                    alias_textura(id),
                    directorios_texturas()
                );
                (imagen_procedural(id, indice), false)
            }
        };
        self.reales.insert(clave.clone(), real);
        let handle = ctx.load_texture(format!("planeta-{clave}"), imagen, TextureOptions::LINEAR);
        self.handles.insert(clave, handle.clone());
        handle
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::RgbaImage;

    #[test]
    fn encuentra_texturas_locales() {
        let dirs = directorios_texturas();
        assert!(!dirs.is_empty(), "debe existir aplicaciones/local/texturas");
        for id in ["tierra", "marte", "jupiter", "luna", "sol"] {
            let ruta = buscar_fichero(id).unwrap_or_else(|| panic!("falta textura para {id}"));
            assert!(ruta.is_file(), "{id} → {}", ruta.display());
            let meta = std::fs::metadata(&ruta).unwrap();
            // Placeholders viejos eran < 20 KB; mapas reales ≥ ~3 KB (sol/urano) o >> 20 KB.
            assert!(meta.len() > 2_000, "{id} demasiado pequeño ({})", meta.len());
        }
    }

    #[test]
    fn tierra_y_jupiter_no_son_placeholders() {
        for id in ["tierra", "jupiter", "marte"] {
            let ruta = buscar_fichero(id).expect(id);
            let bytes = std::fs::read(&ruta).unwrap();
            let img = image::load_from_memory(&bytes).unwrap().into_rgba8();
            assert!(
                calidad_mapa_aceptable(img.as_raw(), img.width(), img.height(), bytes.len()),
                "{id} no pasa el umbral de calidad real ({})",
                ruta.display()
            );
        }
    }

    #[test]
    fn proyecta_disco_esfera_y_escribe_preview() {
        let ruta = buscar_fichero("tierra").expect("tierra");
        let img = cargar_mapa_esfera(&ruta).expect("cargar tierra");
        assert_eq!(img.size, [256, 256]);
        // Debe haber píxeles opacos (el disco) y transparentes (esquinas).
        let opacos = img.pixels.iter().filter(|p| p.a() > 200).count();
        let trans = img.pixels.iter().filter(|p| p.a() == 0).count();
        assert!(opacos > 10_000, "disco demasiado vacío ({opacos})");
        assert!(trans > 5_000, "debe haber transparencia fuera del disco ({trans})");

        // Preview PNG para inspección visual en CI/local.
        let mut rgba = RgbaImage::new(256, 256);
        for y in 0..256u32 {
            for x in 0..256u32 {
                let p = img.pixels[(y as usize) * 256 + (x as usize)];
                rgba.put_pixel(x, y, image::Rgba([p.r(), p.g(), p.b(), p.a()]));
            }
        }
        let out =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("texturas/_preview_tierra_esfera.png");
        rgba.save(&out).expect("guardar preview");
        assert!(out.is_file());
        // Muestrear centro: Blue Marble no es un azul plano único.
        let centro = img.pixels[128 * 256 + 128];
        assert!(centro.a() > 200);
    }
}
