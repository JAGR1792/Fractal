//! Fractal Local — escritorio egui/eframe con física in-process.
//!
//! Sin Axum, sin Vue, sin WASM: `fractal-fisica` corre en el mismo proceso.
//! Escenario por defecto: tres cuerpos figure-8 + malla gravitatoria.

mod escenario;

use eframe::egui::{self, Color32, Pos2, Rect, Sense, Stroke, Vec2};
use fractal_fisica::prelude::*;

fn main() -> eframe::Result {
    let opciones = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1100.0, 720.0])
            .with_title("Fractal Local — tres cuerpos"),
        ..Default::default()
    };
    eframe::run_native(
        "Fractal Local",
        opciones,
        Box::new(|cc| Ok(Box::new(AppFractal::nueva(cc)))),
    )
}

struct AppFractal {
    cuerpos: Vec<Cuerpo>,
    estelas: Vec<Vec<Pos2>>,
    tiempo: f64,
    pausado: bool,
    velocidad: f32,
    mostrar_malla: bool,
    dt: f64,
    escala: f64,
    colores: [Color32; 3],
}

impl AppFractal {
    fn nueva(_cc: &eframe::CreationContext<'_>) -> Self {
        let cuerpos = escenario::tres_cuerpos_figure8();
        let n = cuerpos.len();
        Self {
            cuerpos,
            estelas: vec![Vec::new(); n],
            tiempo: 0.0,
            pausado: false,
            velocidad: 1.0,
            mostrar_malla: true,
            dt: escenario::dt_recomendado(),
            escala: escenario::escala_espacial(),
            colores: [
                Color32::from_rgb(255, 120, 80),
                Color32::from_rgb(80, 180, 255),
                Color32::from_rgb(140, 220, 120),
            ],
        }
    }

    fn reiniciar(&mut self) {
        self.cuerpos = escenario::tres_cuerpos_figure8();
        self.estelas = vec![Vec::new(); self.cuerpos.len()];
        self.tiempo = 0.0;
    }

    fn avanzar(&mut self, pasos: usize) {
        for _ in 0..pasos {
            paso_velocity_verlet(&mut self.cuerpos, self.dt);
            self.tiempo += self.dt;
        }
        self.registrar_estela();
    }

    fn registrar_estela(&mut self) {
        const MAX: usize = 900;
        for (i, c) in self.cuerpos.iter().enumerate() {
            // Guardamos en coords mundo (m); se proyectan al pintar.
            let p = Pos2::new(c.posicion.x as f32, c.posicion.y as f32);
            self.estelas[i].push(p);
            if self.estelas[i].len() > MAX {
                let sobra = self.estelas[i].len() - MAX;
                self.estelas[i].drain(0..sobra);
            }
        }
    }
}

impl eframe::App for AppFractal {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        if !self.pausado {
            // ~60 fps × velocidad: varios subpasos por fotograma.
            let subpasos = ((8.0 * self.velocidad).round() as usize).clamp(1, 64);
            self.avanzar(subpasos);
            ctx.request_repaint();
        }

        egui::TopBottomPanel::top("barra").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.heading("Fractal Local");
                ui.separator();
                if ui.button(if self.pausado { "▶ Continuar" } else { "⏸ Pausar" }).clicked() {
                    self.pausado = !self.pausado;
                }
                if ui.button("↺ Reiniciar").clicked() {
                    self.reiniciar();
                }
                ui.separator();
                ui.label("Velocidad");
                ui.add(egui::Slider::new(&mut self.velocidad, 0.1..=4.0).logarithmic(false));
                ui.checkbox(&mut self.mostrar_malla, "Malla gravitatoria");
                ui.separator();
                ui.monospace(format!("t = {:.3e} s", self.tiempo));
                let e = energia_total(&self.cuerpos);
                ui.monospace(format!("E = {:.6e} J", e));
            });
        });

        egui::CentralPanel::default().show(ctx, |ui| {
            let (respuesta, painter) = ui.allocate_painter(ui.available_size(), Sense::hover());
            let rect = respuesta.rect;
            self.dibujar_escena(&painter, rect);
        });

        // Atajos
        ctx.input(|i| {
            if i.key_pressed(egui::Key::Space) {
                self.pausado = !self.pausado;
            }
            if i.key_pressed(egui::Key::G) {
                self.mostrar_malla = !self.mostrar_malla;
            }
            if i.key_pressed(egui::Key::R) {
                self.reiniciar();
            }
        });
    }
}

impl AppFractal {
    fn proyectar(&self, mundo: Pos2, rect: Rect) -> Pos2 {
        let mitad = self.escala as f32 * 1.6;
        let cx = rect.center().x;
        let cy = rect.center().y;
        let sx = rect.width() * 0.45 / mitad;
        let sy = rect.height() * 0.45 / mitad;
        let s = sx.min(sy);
        Pos2::new(cx + mundo.x * s, cy - mundo.y * s)
    }

    fn dibujar_escena(&self, painter: &egui::Painter, rect: Rect) {
        painter.rect_filled(rect, 0.0, Color32::from_rgb(12, 14, 22));

        if self.mostrar_malla {
            self.dibujar_malla(painter, rect);
        }

        // Estelas
        for (i, estela) in self.estelas.iter().enumerate() {
            if estela.len() < 2 {
                continue;
            }
            let color = self.colores[i % self.colores.len()].gamma_multiply(0.55);
            let puntos: Vec<Pos2> = estela.iter().map(|p| self.proyectar(*p, rect)).collect();
            painter.add(egui::Shape::line(puntos, Stroke::new(1.5_f32, color)));
        }

        // Cuerpos
        for (i, c) in self.cuerpos.iter().enumerate() {
            let centro = self.proyectar(Pos2::new(c.posicion.x as f32, c.posicion.y as f32), rect);
            let radio_px = (rect.width().min(rect.height()) * 0.018).clamp(6.0, 18.0);
            let color = self.colores[i % self.colores.len()];
            painter.circle_filled(centro, radio_px, color);
            painter.circle_stroke(centro, radio_px, Stroke::new(1.5_f32, Color32::WHITE));
            painter.text(
                centro + Vec2::new(0.0, radio_px + 10.0),
                egui::Align2::CENTER_TOP,
                &c.nombre,
                egui::FontId::proportional(12.0),
                Color32::from_gray(200),
            );
        }

        // Pie de ayuda
        painter.text(
            rect.left_bottom() + Vec2::new(12.0, -14.0),
            egui::Align2::LEFT_BOTTOM,
            "Espacio: pausa · G: malla · R: reiniciar",
            egui::FontId::proportional(12.0),
            Color32::from_gray(140),
        );
    }

    /// Malla deformada hacia las masas (warp visual suavizado, legible a escala SI).
    fn dibujar_malla(&self, painter: &egui::Painter, rect: Rect) {
        let n = 28;
        let alcance = self.escala * 1.55;
        let soft = self.escala * 0.12;
        let amp = self.escala * 0.35;
        let max_disp = self.escala * 0.28;
        let stroke = Stroke::new(1.2_f32, Color32::from_rgba_unmultiplied(90, 140, 190, 120));

        let nodo = |ix: i32, iy: i32| -> Pos2 {
            let x = -alcance + (2.0 * alcance) * (ix as f64) / (n as f64);
            let y = -alcance + (2.0 * alcance) * (iy as f64) / (n as f64);
            // Atracción 1/r² suavizada (solo visual; la física real va por fractal-fisica).
            let mut dx = 0.0;
            let mut dy = 0.0;
            for c in &self.cuerpos {
                let rx = c.posicion.x - x;
                let ry = c.posicion.y - y;
                let r2 = rx * rx + ry * ry + soft * soft;
                let w = amp * (self.escala * self.escala) / r2;
                dx += rx * w / (r2.sqrt());
                dy += ry * w / (r2.sqrt());
            }
            let mag = (dx * dx + dy * dy).sqrt();
            if mag > max_disp {
                dx *= max_disp / mag;
                dy *= max_disp / mag;
            }
            self.proyectar(Pos2::new((x + dx) as f32, (y + dy) as f32), rect)
        };

        for iy in 0..=n {
            let mut fila = Vec::with_capacity((n + 1) as usize);
            for ix in 0..=n {
                fila.push(nodo(ix, iy));
            }
            painter.add(egui::Shape::line(fila, stroke));
        }
        for ix in 0..=n {
            let mut col = Vec::with_capacity((n + 1) as usize);
            for iy in 0..=n {
                col.push(nodo(ix, iy));
            }
            painter.add(egui::Shape::line(col, stroke));
        }
    }
}
