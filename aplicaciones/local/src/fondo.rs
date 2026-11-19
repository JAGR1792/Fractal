//! Fondo espacial: degradado, nebulosa suave y campo de estrellas con paralaje.

use eframe::egui::{self, Color32, Pos2, Rect, Vec2};
use std::sync::OnceLock;

#[derive(Clone, Copy)]
struct Estrella {
    /// Posición normalizada en [-1, 1] del plano de fondo.
    u: f32,
    v: f32,
    brillo: f32,
    capa: u8, // 0 = lejos (poco paralaje), 2 = cerca
    tono: u8, // 0 blanco, 1 azulado, 2 cálido
}

fn catalogo_estrellas() -> &'static [Estrella] {
    static CAT: OnceLock<Vec<Estrella>> = OnceLock::new();
    CAT.get_or_init(|| {
        let mut out = Vec::with_capacity(420);
        // LCG determinista — mismo cielo cada ejecución.
        let mut s: u32 = 0xC0FFEE;
        let mut rnd = || {
            s = s.wrapping_mul(1664525).wrapping_add(1013904223);
            (s >> 8) as f32 / (0x00FF_FFFF as f32)
        };
        for i in 0..420 {
            let capa = if i < 180 {
                0
            } else if i < 320 {
                1
            } else {
                2
            };
            out.push(Estrella {
                u: rnd() * 2.0 - 1.0,
                v: rnd() * 2.0 - 1.0,
                brillo: match capa {
                    0 => 0.25 + rnd() * 0.35,
                    1 => 0.45 + rnd() * 0.4,
                    _ => 0.55 + rnd() * 0.45,
                },
                capa,
                tono: (rnd() * 3.0) as u8,
            });
        }
        // Unas pocas “brillantes” tipo Venus/Sirius.
        for _ in 0..12 {
            out.push(Estrella {
                u: rnd() * 2.0 - 1.0,
                v: rnd() * 2.0 - 1.0,
                brillo: 0.92 + rnd() * 0.08,
                capa: 2,
                tono: 0,
            });
        }
        out
    })
}

fn color_estrella(e: &Estrella) -> Color32 {
    let a = (e.brillo * 255.0).clamp(40.0, 255.0) as u8;
    match e.tono {
        1 => Color32::from_rgba_unmultiplied(180, 200, 255, a),
        2 => Color32::from_rgba_unmultiplied(255, 220, 180, a),
        _ => Color32::from_rgba_unmultiplied(235, 240, 255, a),
    }
}

/// Cielo profundo + nebulosa + estrellas (paralaje con pan/yaw).
pub fn dibujar(painter: &egui::Painter, rect: Rect, pan: Vec2, yaw: f32, pitch: f32, zoom: f32) {
    // Base: negro azulado con viñeta.
    painter.rect_filled(rect, 0.0, Color32::from_rgb(4, 6, 14));

    let cx = rect.center().x;
    let cy = rect.center().y;
    let w = rect.width();
    let h = rect.height();

    // Nebulosas: manchas suaves (varias elipses translúcidas).
    let nebulosas = [
        (0.28_f32, -0.12_f32, 0.55_f32, Color32::from_rgba_unmultiplied(40, 30, 90, 28)),
        (-0.35, 0.22, 0.48, Color32::from_rgba_unmultiplied(20, 50, 80, 24)),
        (0.05, 0.35, 0.40, Color32::from_rgba_unmultiplied(70, 25, 55, 20)),
        (-0.15, -0.40, 0.35, Color32::from_rgba_unmultiplied(25, 40, 70, 18)),
    ];
    let neb_shift = Vec2::new(-pan.x * 0.04 + yaw * 18.0, -pan.y * 0.04 - pitch * 12.0);
    for (nu, nv, escala, col) in nebulosas {
        let c = Pos2::new(cx + nu * w * 0.5 + neb_shift.x, cy + nv * h * 0.5 + neb_shift.y);
        let rx = w * escala * 0.5;
        let ry = h * escala * 0.35;
        // Aproximamos elipse con círculos concéntricos de alpha decreciente.
        for k in 0..5 {
            let t = 1.0 - k as f32 / 5.0;
            let a = (col.a() as f32 * t * t) as u8;
            painter.circle_filled(
                c,
                (rx + ry) * 0.5 * (0.45 + 0.55 * t),
                Color32::from_rgba_unmultiplied(col.r(), col.g(), col.b(), a),
            );
        }
    }

    // Banda tipo Vía Láctea (diagonal suave).
    let milky_a = Color32::from_rgba_unmultiplied(90, 100, 140, 16);
    for i in 0..7 {
        let t = i as f32 / 6.0;
        let p = Pos2::new(
            rect.left() + w * (0.1 + t * 0.8) + neb_shift.x * 0.5,
            rect.top() + h * (0.15 + t * 0.7) + neb_shift.y * 0.5,
        );
        painter.circle_filled(p, w * 0.08, milky_a);
    }

    // Estrellas con paralaje por capa.
    let zoom_f = (zoom.ln().max(-2.0) * 2.0).clamp(-6.0, 12.0);
    for e in catalogo_estrellas() {
        let par = match e.capa {
            0 => 0.015,
            1 => 0.045,
            _ => 0.09,
        };
        let drift = Vec2::new(
            -pan.x * par + yaw * (8.0 + e.capa as f32 * 6.0) + zoom_f * e.u * 0.3,
            -pan.y * par - pitch * (6.0 + e.capa as f32 * 4.0) + zoom_f * e.v * 0.2,
        );
        let p = Pos2::new(cx + e.u * w * 0.52 + drift.x, cy + e.v * h * 0.52 + drift.y);
        if !rect.expand(4.0).contains(p) {
            continue;
        }
        let r = match e.capa {
            0 => 0.7,
            1 => 1.05,
            _ => 1.35 + e.brillo * 0.6,
        };
        let col = color_estrella(e);
        painter.circle_filled(p, r, col);
        // Destello en las más brillantes.
        if e.brillo > 0.85 && e.capa == 2 {
            let a = (e.brillo * 90.0) as u8;
            let ray = Color32::from_rgba_unmultiplied(col.r(), col.g(), col.b(), a);
            painter.line_segment(
                [p + Vec2::new(-r * 3.5, 0.0), p + Vec2::new(r * 3.5, 0.0)],
                egui::Stroke::new(1.0_f32, ray),
            );
            painter.line_segment(
                [p + Vec2::new(0.0, -r * 3.5), p + Vec2::new(0.0, r * 3.5)],
                egui::Stroke::new(1.0_f32, ray),
            );
        }
    }

    // Viñeta periférica (profundidad).
    let vignette = Color32::from_rgba_unmultiplied(0, 0, 0, 55);
    let m = w.min(h) * 0.08;
    painter.rect_filled(
        Rect::from_min_max(rect.left_top(), Pos2::new(rect.right(), rect.top() + m)),
        0.0,
        vignette,
    );
    painter.rect_filled(
        Rect::from_min_max(Pos2::new(rect.left(), rect.bottom() - m), rect.right_bottom()),
        0.0,
        vignette,
    );
}
