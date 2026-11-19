//! Fondo espacial sobrio: negro profundo y estrellas finas (sin nebulosas).

use eframe::egui::{Color32, Pos2, Rect, Vec2};
use std::sync::OnceLock;

#[derive(Clone, Copy)]
struct Estrella {
    u: f32,
    v: f32,
    brillo: f32,
    tam: f32,
}

fn catalogo() -> &'static [Estrella] {
    static CAT: OnceLock<Vec<Estrella>> = OnceLock::new();
    CAT.get_or_init(|| {
        let mut s: u32 = 0xA11CE;
        let mut rnd = || {
            s = s.wrapping_mul(1664525).wrapping_add(1013904223);
            (s >> 8) as f32 / (0x00FF_FFFF as f32)
        };
        let mut out = Vec::with_capacity(280);
        for _ in 0..280 {
            let b = rnd();
            out.push(Estrella {
                u: rnd() * 2.0 - 1.0,
                v: rnd() * 2.0 - 1.0,
                brillo: 0.2 + b * 0.75,
                tam: if b > 0.92 {
                    1.35
                } else if b > 0.7 {
                    1.0
                } else {
                    0.65
                },
            });
        }
        out
    })
}

/// Cielo limpio: casi negro + puntos de luz. Paralaje muy leve con pan.
pub fn dibujar(painter: &egui::Painter, rect: Rect, pan: Vec2, yaw: f32) {
    painter.rect_filled(rect, 0.0, Color32::from_rgb(3, 4, 10));

    let cx = rect.center().x;
    let cy = rect.center().y;
    let w = rect.width();
    let h = rect.height();
    let drift = Vec2::new(-pan.x * 0.02 + yaw * 4.0, -pan.y * 0.02);

    for e in catalogo() {
        let p = Pos2::new(cx + e.u * w * 0.5 + drift.x, cy + e.v * h * 0.5 + drift.y);
        if !rect.contains(p) {
            continue;
        }
        let a = (e.brillo * 220.0).clamp(30.0, 220.0) as u8;
        painter.circle_filled(p, e.tam, Color32::from_rgba_unmultiplied(220, 228, 255, a));
    }
}
