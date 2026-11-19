//! Texturas planetarias desde `aplicaciones/web/public/texturas/`.
//!
//! Usa los PNG del repo (mapas equirectangulares). Solo cae a procedural si
//! el fichero falta o no se puede leer.

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
        "mars" | "marte" | "a" | "cuerpo_a" => "marte",
        "jupiter" | "b" | "cuerpo_b" => "jupiter",
        "saturn" | "saturno" => "saturno",
        "uranus" | "urano" => "urano",
        "neptune" | "neptuno" | "c" | "cuerpo_c" => "neptuno",
        other => other,
    }
}

/// Directorios candidatos (crate → cwd).
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
    let w = 128usize;
    let h = 128usize;
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

/// Proyecta un disco esférico muestreando un mapa equirectangular (lon/lat).
fn cargar_mapa_esfera(path: &Path) -> Result<ColorImage, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?.into_rgba8();
    let tw = img.width() as f32;
    let th = img.height() as f32;
    let w = 160usize;
    let h = 160usize;
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
            // Equirectangular: u = lon, v = lat.
            let lon = nx.atan2(nz);
            let lat = ny.asin();
            let u = ((lon / (2.0 * std::f32::consts::PI)) + 0.5).rem_euclid(1.0);
            let v = (0.5 - lat / std::f32::consts::PI).clamp(0.0, 1.0);
            let px = (u * (tw - 1.0)) as u32;
            let py = (v * (th - 1.0)) as u32;
            let p = img.get_pixel(px, py);
            let luz = (0.35 + 0.75 * (0.55 * nz - 0.25 * nx + 0.35 * (-ny)).clamp(0.0, 1.0))
                .clamp(0.2, 1.0);
            let a = ((1.0 - r2) * 6.0).clamp(0.0, 1.0);
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

fn aviso_dirs() {
    static UNA_VEZ: OnceLock<()> = OnceLock::new();
    UNA_VEZ.get_or_init(|| {
        let dirs = directorios_texturas();
        if dirs.is_empty() {
            eprintln!(
                "aviso: no se encontró aplicaciones/web/public/texturas — se usará procedural"
            );
        } else {
            eprintln!("texturas: buscando en {}", dirs[0].display());
        }
    });
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
        aviso_dirs();
        let clave = alias_textura(id).to_string();
        if let Some(h) = self.handles.get(&clave) {
            return h.clone();
        }
        let imagen = match buscar_fichero(id) {
            Some(ruta) => match cargar_mapa_esfera(&ruta) {
                Ok(img) => {
                    eprintln!("textura cargada: {} → {}", id, ruta.display());
                    img
                }
                Err(err) => {
                    eprintln!("aviso textura {}: {err} — procedural", ruta.display());
                    imagen_procedural(id, indice)
                }
            },
            None => {
                eprintln!(
                    "aviso: sin fichero para '{id}' (alias {}) — procedural",
                    alias_textura(id)
                );
                imagen_procedural(id, indice)
            }
        };
        let handle = ctx.load_texture(format!("planeta-{clave}"), imagen, TextureOptions::LINEAR);
        self.handles.insert(clave, handle.clone());
        handle
    }
}
