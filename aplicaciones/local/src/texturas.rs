//! Carga texturas planetarias desde `aplicaciones/web/public/texturas/` si existen.
//! Fallback: colores procedurales (sin dependencia de ficheros).

use eframe::egui::{self, Color32, ColorImage, TextureHandle, TextureOptions};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Alias de id de cuerpo → nombre de fichero sin extensión.
fn alias_textura(id: &str) -> &str {
    match id {
        "earth" | "tierra" => "tierra",
        "moon" | "luna" => "luna",
        "sun" | "sol" => "sol",
        "mercury" | "mercurio" => "mercurio",
        "venus" => "venus",
        "mars" | "marte" => "marte",
        "jupiter" => "jupiter",
        "saturn" | "saturno" => "saturno",
        "uranus" | "urano" => "urano",
        "neptune" | "neptuno" => "neptuno",
        other => other,
    }
}

/// Directorios candidatos para texturas del web.
pub fn directorios_texturas() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let desde_crate = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../web/public/texturas");
    if desde_crate.is_dir() {
        dirs.push(desde_crate);
    }
    for rel in ["aplicaciones/web/public/texturas", "../web/public/texturas", "public/texturas"] {
        let p = PathBuf::from(rel);
        if p.is_dir() && !dirs.iter().any(|d| d == &p) {
            dirs.push(p);
        }
    }
    dirs
}

fn buscar_fichero(id: &str) -> Option<PathBuf> {
    let nombre = alias_textura(id);
    let exts = ["png", "jpg", "jpeg", "webp"];
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
    let w = 64usize;
    let h = 64usize;
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
            // Sombreado lambertiano simple (luz desde arriba-izquierda).
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

fn cargar_png_rgba(path: &Path) -> Result<ColorImage, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?.into_rgba8();
    // Disco sombreado muestreando el mapa (evita quads rectangulares).
    let tw = img.width() as f32;
    let th = img.height() as f32;
    let w = 64usize;
    let h = 64usize;
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
            let u = ((nx * 0.5 + 0.5) * (tw - 1.0)).clamp(0.0, tw - 1.0) as u32;
            let v = ((ny * 0.5 + 0.5) * (th - 1.0)).clamp(0.0, th - 1.0) as u32;
            let p = img.get_pixel(u, v);
            let luz = (-0.45 * nx - 0.35 * ny + 0.75).clamp(0.28, 1.0);
            let a = ((1.0 - r2) * 5.0).clamp(0.0, 1.0);
            pixels.push(Color32::from_rgba_unmultiplied(
                (p[0] as f32 * luz) as u8,
                (p[1] as f32 * luz) as u8,
                (p[2] as f32 * luz) as u8,
                (p[3] as f32 * a) as u8,
            ));
        }
    }
    Ok(ColorImage { size: [w, h], pixels })
}

/// Caché de texturas egui por id de cuerpo.
pub struct CatalogoTexturas {
    handles: HashMap<String, TextureHandle>,
}

impl CatalogoTexturas {
    pub fn nuevo() -> Self {
        Self { handles: HashMap::new() }
    }

    pub fn obtener(&mut self, ctx: &egui::Context, id: &str, indice: usize) -> TextureHandle {
        if let Some(h) = self.handles.get(id) {
            return h.clone();
        }
        let imagen = match buscar_fichero(id) {
            Some(ruta) => match cargar_png_rgba(&ruta) {
                Ok(img) => img,
                Err(err) => {
                    eprintln!("aviso textura {}: {err}", ruta.display());
                    imagen_procedural(id, indice)
                }
            },
            None => imagen_procedural(id, indice),
        };
        let handle = ctx.load_texture(format!("planeta-{id}"), imagen, TextureOptions::LINEAR);
        self.handles.insert(id.to_string(), handle.clone());
        handle
    }
}
