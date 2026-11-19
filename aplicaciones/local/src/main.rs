//! Fractal Local — escritorio egui/eframe con física in-process.
//!
//! Sin Axum, sin Vue, sin WASM: `fractal-fisica` corre en el mismo proceso.
//! Modos 2D (defecto) y 3D, malla que sigue al sistema, sandbox de masas/velocidades.

mod escenario;
mod texturas;

use eframe::egui::{self, Color32, Pos2, Rect, Sense, Stroke, Vec2};
use fractal_fisica::prelude::*;

use escenario::{EscenarioCargado, EscenarioMeta, baricentro, geometria_sistema};
use texturas::{CatalogoTexturas, color_planeta};

fn main() -> eframe::Result {
    let opciones = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1280.0, 780.0])
            .with_title("Fractal Local"),
        ..Default::default()
    };
    eframe::run_native(
        "Fractal Local",
        opciones,
        Box::new(|cc| Ok(Box::new(AppFractal::nueva(cc)))),
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ModoVista {
    DosD,
    TresD,
}

/// Punto de estela en el marco del baricentro (evita espirales por deriva del CM).
#[derive(Debug, Clone, Copy)]
struct PuntoEstela {
    x: f32,
    y: f32,
    z: f32,
}

struct AppFractal {
    catalogo: Vec<EscenarioMeta>,
    escenario_id: String,
    escenario_nombre: String,
    cuerpos: Vec<Cuerpo>,
    estelas: Vec<Vec<PuntoEstela>>,
    tiempo: f64,
    pausado: bool,
    velocidad: f32,
    mostrar_malla: bool,
    dt: f64,
    /// Escala de referencia del escenario (inicial).
    escala: f64,
    zoom: f32,
    pan: Vec2,
    modo: ModoVista,
    /// Ángulos de cámara 3D (radianes).
    yaw: f32,
    pitch: f32,
    /// Índice del cuerpo seleccionado en el sandbox (`None` = ninguno).
    seleccionado: Option<usize>,
    texturas: CatalogoTexturas,
    /// Suavizado de la semiextensión de la malla (evita saltos).
    span_suave: f64,
}

impl AppFractal {
    fn nueva(_cc: &eframe::CreationContext<'_>) -> Self {
        let catalogo = escenario::listar_escenarios();
        let preferido = catalogo
            .iter()
            .find(|m| m.id == "tres_cuerpos_caos")
            .or_else(|| catalogo.iter().find(|m| m.id == "tres_cuerpos"))
            .or_else(|| catalogo.first())
            .map(|m| m.id.clone())
            .unwrap_or_else(|| "tres_cuerpos".into());

        let cargado = escenario::cargar_por_id(&preferido, &catalogo)
            .unwrap_or_else(|_| escenario::tres_cuerpos_figure8());

        Self::desde_escenario(catalogo, cargado)
    }

    fn desde_escenario(catalogo: Vec<EscenarioMeta>, esc: EscenarioCargado) -> Self {
        let n = esc.cuerpos.len();
        let (_, span) = geometria_sistema(&esc.cuerpos);
        Self {
            catalogo,
            escenario_id: esc.id,
            escenario_nombre: esc.nombre,
            cuerpos: esc.cuerpos,
            estelas: vec![Vec::new(); n],
            tiempo: 0.0,
            pausado: false,
            velocidad: 1.0,
            mostrar_malla: true,
            dt: esc.dt,
            escala: esc.escala,
            zoom: 1.0,
            pan: Vec2::ZERO,
            modo: ModoVista::DosD,
            yaw: 0.55,
            pitch: 0.55,
            seleccionado: None,
            texturas: CatalogoTexturas::nuevo(),
            span_suave: span.max(esc.escala),
        }
    }

    fn aplicar_escenario(&mut self, esc: EscenarioCargado) {
        let (_, span) = geometria_sistema(&esc.cuerpos);
        self.escenario_id = esc.id;
        self.escenario_nombre = esc.nombre;
        self.cuerpos = esc.cuerpos;
        self.estelas = vec![Vec::new(); self.cuerpos.len()];
        self.tiempo = 0.0;
        self.dt = esc.dt;
        self.escala = esc.escala;
        self.zoom = 1.0;
        self.pan = Vec2::ZERO;
        self.seleccionado = None;
        self.span_suave = span.max(esc.escala);
    }

    fn reiniciar(&mut self) {
        match escenario::cargar_por_id(&self.escenario_id, &self.catalogo) {
            Ok(esc) => self.aplicar_escenario(esc),
            Err(err) => eprintln!("reinicio falló: {err}"),
        }
    }

    fn cargar_id(&mut self, id: &str) {
        match escenario::cargar_por_id(id, &self.catalogo) {
            Ok(esc) => self.aplicar_escenario(esc),
            Err(err) => eprintln!("carga falló: {err}"),
        }
    }

    fn avanzar(&mut self, pasos: usize) {
        for _ in 0..pasos {
            paso_velocity_verlet(&mut self.cuerpos, self.dt);
            self.tiempo += self.dt;
        }
        self.registrar_estela();
        self.actualizar_span_suave();
    }

    fn actualizar_span_suave(&mut self) {
        let (_, span) = geometria_sistema(&self.cuerpos);
        let objetivo = span.max(self.escala * 0.05);
        // EMA: reacciona rápido a expansión para que nadie se salga de la malla.
        let alfa = if objetivo > self.span_suave * 1.02 {
            0.28
        } else if objetivo < self.span_suave * 0.85 {
            0.06
        } else {
            0.10
        };
        self.span_suave = self.span_suave * (1.0 - alfa) + objetivo * alfa;
    }

    fn registrar_estela(&mut self) {
        const MAX: usize = 1200;
        let cm = baricentro(&self.cuerpos);
        for (i, c) in self.cuerpos.iter().enumerate() {
            let p = PuntoEstela {
                x: (c.posicion.x - cm.x) as f32,
                y: (c.posicion.y - cm.y) as f32,
                z: (c.posicion.z - cm.z) as f32,
            };
            self.estelas[i].push(p);
            if self.estelas[i].len() > MAX {
                let sobra = self.estelas[i].len() - MAX;
                self.estelas[i].drain(0..sobra);
            }
        }
    }

    fn reset_camara(&mut self) {
        self.zoom = 1.0;
        self.pan = Vec2::ZERO;
        self.yaw = 0.55;
        self.pitch = 0.55;
    }

    /// Semiextensión usada por proyección y malla (sigue al sistema).
    fn alcance_malla(&self) -> f64 {
        (self.span_suave * 1.7).max(1.0)
    }

    fn escenario_siguiente(&mut self, delta: isize) {
        if self.catalogo.is_empty() {
            return;
        }
        let actual = self.catalogo.iter().position(|m| m.id == self.escenario_id).unwrap_or(0);
        let n = self.catalogo.len() as isize;
        let nuevo = ((actual as isize + delta).rem_euclid(n)) as usize;
        let id = self.catalogo[nuevo].id.clone();
        self.cargar_id(&id);
    }
}

impl eframe::App for AppFractal {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        if !self.pausado {
            let subpasos = ((8.0 * self.velocidad).round() as usize).clamp(1, 64);
            self.avanzar(subpasos);
            ctx.request_repaint();
        }

        egui::TopBottomPanel::top("barra").show(ctx, |ui| {
            ui.horizontal_wrapped(|ui| {
                ui.heading("Fractal Local");
                ui.separator();

                let mut elegido = self.escenario_id.clone();
                egui::ComboBox::from_id_salt("escenario")
                    .selected_text(&self.escenario_nombre)
                    .width(210.0)
                    .show_ui(ui, |ui| {
                        for meta in &self.catalogo {
                            ui.selectable_value(&mut elegido, meta.id.clone(), &meta.nombre);
                        }
                    });
                if elegido != self.escenario_id {
                    self.cargar_id(&elegido);
                }

                ui.separator();
                if ui.button(if self.pausado { "▶ Continuar" } else { "⏸ Pausar" }).clicked() {
                    self.pausado = !self.pausado;
                }
                if ui.button("↺ Reiniciar").clicked() {
                    self.reiniciar();
                }
                if ui.button("⌖ Cámara").on_hover_text("Reset zoom/pan/órbita").clicked() {
                    self.reset_camara();
                }

                ui.separator();
                ui.label("Vista");
                ui.selectable_value(&mut self.modo, ModoVista::DosD, "2D");
                ui.selectable_value(&mut self.modo, ModoVista::TresD, "3D");

                ui.separator();
                ui.label("Velocidad");
                ui.add(egui::Slider::new(&mut self.velocidad, 0.1..=4.0));
                ui.checkbox(&mut self.mostrar_malla, "Malla gravitatoria");
                ui.separator();
                ui.monospace(format!("t = {:.3e} s", self.tiempo));
                let e = energia_total(&self.cuerpos);
                ui.monospace(format!("E = {:.6e} J", e));
                ui.monospace(format!("zoom {:.2}×", self.zoom));
            });
        });

        egui::SidePanel::right("sandbox").default_width(260.0).resizable(true).show(ctx, |ui| {
            ui.heading("Sandbox");
            ui.label("Clic en un cuerpo para editar masa y velocidad en vivo.");
            ui.separator();

                let nombres: Vec<(String, String)> =
                    self.cuerpos.iter().map(|c| (c.id.clone(), c.nombre.clone())).collect();
                for (i, (_id, nombre)) in nombres.iter().enumerate() {
                    let sel = self.seleccionado == Some(i);
                    let texto = if sel { format!("● {nombre}") } else { format!("○ {nombre}") };
                    if ui
                        .add_sized([ui.available_width(), 28.0], egui::Button::new(texto).selected(sel))
                        .clicked()
                    {
                        self.seleccionado = Some(i);
                    }
                }

            ui.separator();
            if let Some(idx) = self.seleccionado
                && idx < self.cuerpos.len()
            {
                let c = &mut self.cuerpos[idx];
                ui.strong(&c.nombre);
                ui.add_space(4.0);

                let mut log_masa = c.masa.max(1.0).log10() as f32;
                ui.label("Masa (log₁₀ kg)");
                if ui.add(egui::Slider::new(&mut log_masa, 18.0..=31.0)).changed() {
                    c.masa = 10f64.powf(log_masa as f64).max(1.0);
                }
                ui.monospace(format!("m = {:.4e} kg", c.masa));

                ui.add_space(6.0);
                ui.label("Velocidad (m/s)");
                let vel_speed = c.velocidad.norma().max(1.0) * 0.01 + 0.1;
                ui.horizontal(|ui| {
                    ui.label("vx");
                    ui.add(egui::DragValue::new(&mut c.velocidad.x).speed(vel_speed));
                });
                ui.horizontal(|ui| {
                    ui.label("vy");
                    ui.add(egui::DragValue::new(&mut c.velocidad.y).speed(vel_speed));
                });
                ui.horizontal(|ui| {
                    ui.label("vz");
                    ui.add(egui::DragValue::new(&mut c.velocidad.z).speed(vel_speed));
                });

                ui.add_space(8.0);
                if ui.button("Detener cuerpo (v = 0)").clicked() {
                    c.velocidad = Vec3::cero();
                }
                if ui.button("Quitar selección").clicked() {
                    self.seleccionado = None;
                }
            } else {
                ui.weak("Ningún cuerpo seleccionado.");
            }

            ui.add_space(12.0);
            ui.separator();
                ui.weak("Atajos: Espacio pausa · G malla · R reiniciar · 2/3 vista · [ ] escenario · F cámara");
        });

        egui::CentralPanel::default().show(ctx, |ui| {
            let (respuesta, painter) =
                ui.allocate_painter(ui.available_size(), Sense::click_and_drag());
            let rect = respuesta.rect;

            // Zoom con rueda.
            let scroll = respuesta.hover_pos().and_then(|_| {
                ui.input(|i| {
                    let d = i.smooth_scroll_delta.y;
                    if d.abs() > 0.0 { Some(d) } else { None }
                })
            });
            if let (Some(delta), Some(pos)) = (scroll, respuesta.hover_pos()) {
                let antes = self.zoom;
                let factor = (1.0 + delta * 0.0015).clamp(0.85, 1.15);
                self.zoom = (self.zoom * factor).clamp(0.05, 40.0);
                let origen = rect.center() + self.pan;
                let offset = pos - origen;
                let ratio = self.zoom / antes;
                self.pan += offset * (1.0 - ratio);
            }

            match self.modo {
                ModoVista::DosD => {
                    if respuesta.dragged_by(egui::PointerButton::Primary) {
                        self.pan += respuesta.drag_delta();
                    }
                }
                ModoVista::TresD => {
                    // Órbita: arrastre primario o secundario.
                    if respuesta.dragged() {
                        let d = respuesta.drag_delta();
                        self.yaw += d.x * 0.008;
                        self.pitch = (self.pitch + d.y * 0.008).clamp(-1.35, 1.35);
                    }
                }
            }

            if respuesta.double_clicked() {
                self.reset_camara();
            }

            // Clic: seleccionar cuerpo más cercano.
            if respuesta.clicked()
                && let Some(pos) = respuesta.interact_pointer_pos()
            {
                self.seleccionado = self.pick_cuerpo(pos, rect);
            }

            self.dibujar_escena(ctx, &painter, rect);
        });

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
            if i.key_pressed(egui::Key::F) {
                self.reset_camara();
            }
            if i.key_pressed(egui::Key::Num2) {
                self.modo = ModoVista::DosD;
            }
            if i.key_pressed(egui::Key::Num3) {
                self.modo = ModoVista::TresD;
            }
            if i.key_pressed(egui::Key::OpenBracket) || i.key_pressed(egui::Key::PageUp) {
                self.escenario_siguiente(-1);
            }
            if i.key_pressed(egui::Key::CloseBracket) || i.key_pressed(egui::Key::PageDown) {
                self.escenario_siguiente(1);
            }
        });
    }
}

impl AppFractal {
    fn pick_cuerpo(&self, screen: Pos2, rect: Rect) -> Option<usize> {
        let cm = baricentro(&self.cuerpos);
        let mut mejor = None;
        let mut mejor_d = 28.0_f32;
        for (i, c) in self.cuerpos.iter().enumerate() {
            let p = self.proyectar_rel(
                (c.posicion.x - cm.x) as f32,
                (c.posicion.y - cm.y) as f32,
                (c.posicion.z - cm.z) as f32,
                rect,
            );
            let d = (p - screen).length();
            if d < mejor_d {
                mejor_d = d;
                mejor = Some(i);
            }
        }
        mejor
    }

    fn proyectar_rel(&self, x: f32, y: f32, z: f32, rect: Rect) -> Pos2 {
        match self.modo {
            ModoVista::DosD => {
                let mitad = self.alcance_malla() as f32;
                let cx = rect.center().x + self.pan.x;
                let cy = rect.center().y + self.pan.y;
                let sx = rect.width() * 0.45 / mitad;
                let sy = rect.height() * 0.45 / mitad;
                let s = sx.min(sy) * self.zoom;
                Pos2::new(cx + x * s, cy - y * s)
            }
            ModoVista::TresD => self.proyectar_3d(x, y, z, rect),
        }
    }

    fn proyectar_3d(&self, x: f32, y: f32, z: f32, rect: Rect) -> Pos2 {
        let escala = self.alcance_malla() as f32;
        let xn = x / escala;
        let yn = y / escala;
        let zn = z / escala;

        let cy = self.yaw.cos();
        let sy = self.yaw.sin();
        let cp = self.pitch.cos();
        let sp = self.pitch.sin();

        // Rotación yaw (Y) luego pitch (X).
        let x1 = xn * cy + zn * sy;
        let z1 = -xn * sy + zn * cy;
        let y2 = yn * cp - z1 * sp;
        let z2 = yn * sp + z1 * cp;

        let dist = 2.8_f32;
        let z_cam = z2 + dist;
        let f = 1.6 / z_cam.max(0.15);
        let s = rect.width().min(rect.height()) * 0.38 * self.zoom;
        let cx = rect.center().x + self.pan.x;
        let cy = rect.center().y + self.pan.y;
        Pos2::new(cx + x1 * f * s, cy - y2 * f * s)
    }

    /// Profundidad aproximada para ordenar cuerpos en 3D (mayor = más lejos).
    fn profundidad_3d(&self, x: f32, y: f32, z: f32) -> f32 {
        let escala = self.alcance_malla() as f32;
        let xn = x / escala;
        let yn = y / escala;
        let zn = z / escala;
        let cy = self.yaw.cos();
        let sy = self.yaw.sin();
        let cp = self.pitch.cos();
        let sp = self.pitch.sin();
        let z1 = -xn * sy + zn * cy;
        yn * sp + z1 * cp
    }

    fn dibujar_escena(&mut self, ctx: &egui::Context, painter: &egui::Painter, rect: Rect) {
        painter.rect_filled(rect, 0.0, Color32::from_rgb(8, 10, 18));

        if self.mostrar_malla {
            self.dibujar_malla(painter, rect);
        }

        for (i, estela) in self.estelas.iter().enumerate() {
            if estela.len() < 2 {
                continue;
            }
            let color = color_planeta(&self.cuerpos[i].id, i).gamma_multiply(0.55);
            let puntos: Vec<Pos2> =
                estela.iter().map(|p| self.proyectar_rel(p.x, p.y, p.z, rect)).collect();
            painter.add(egui::Shape::line(puntos, Stroke::new(1.5_f32, color)));
        }

        let cm = baricentro(&self.cuerpos);
        let mut orden: Vec<usize> = (0..self.cuerpos.len()).collect();
        if self.modo == ModoVista::TresD {
            orden.sort_by(|&a, &b| {
                let pa = &self.cuerpos[a].posicion;
                let pb = &self.cuerpos[b].posicion;
                let da = self.profundidad_3d(
                    (pa.x - cm.x) as f32,
                    (pa.y - cm.y) as f32,
                    (pa.z - cm.z) as f32,
                );
                let db = self.profundidad_3d(
                    (pb.x - cm.x) as f32,
                    (pb.y - cm.y) as f32,
                    (pb.z - cm.z) as f32,
                );
                db.partial_cmp(&da).unwrap_or(std::cmp::Ordering::Equal)
            });
        }

        for &i in &orden {
            let c = &self.cuerpos[i];
            let centro = self.proyectar_rel(
                (c.posicion.x - cm.x) as f32,
                (c.posicion.y - cm.y) as f32,
                (c.posicion.z - cm.z) as f32,
                rect,
            );
            let base = (rect.width().min(rect.height()) * 0.02).clamp(6.0, 22.0);
            let radio_px = if self.modo == ModoVista::TresD {
                let prof = self.profundidad_3d(
                    (c.posicion.x - cm.x) as f32,
                    (c.posicion.y - cm.y) as f32,
                    (c.posicion.z - cm.z) as f32,
                );
                (base * (1.15 - 0.25 * prof)).clamp(5.0, 26.0)
            } else {
                base
            };

            let tex = self.texturas.obtener(ctx, &c.id, i);
            let side = radio_px * 2.2;
            let img_rect = Rect::from_center_size(centro, Vec2::splat(side));
            painter.image(
                tex.id(),
                img_rect,
                Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
                Color32::WHITE,
            );

            if self.seleccionado == Some(i) {
                painter.circle_stroke(centro, radio_px + 4.0, Stroke::new(2.0_f32, Color32::WHITE));
            } else {
                painter.circle_stroke(
                    centro,
                    radio_px + 1.0,
                    Stroke::new(1.0_f32, Color32::from_white_alpha(80)),
                );
            }
            painter.text(
                centro + Vec2::new(0.0, radio_px + 10.0),
                egui::Align2::CENTER_TOP,
                &c.nombre,
                egui::FontId::proportional(12.0),
                Color32::from_gray(200),
            );
        }

        let modo = match self.modo {
            ModoVista::DosD => "2D",
            ModoVista::TresD => "3D (arrastre: órbita)",
        };
        painter.text(
            rect.left_bottom() + Vec2::new(12.0, -14.0),
            egui::Align2::LEFT_BOTTOM,
            format!(
                "{modo} · Espacio: pausa · G: malla · R: reiniciar · 2/3: vista · F/doble clic: cámara · rueda: zoom"
            ),
            egui::FontId::proportional(12.0),
            Color32::from_gray(140),
        );
    }

    /// Malla centrada en el baricentro, con alcance que sigue al span del sistema.
    fn dibujar_malla(&self, painter: &egui::Painter, rect: Rect) {
        let alcance = self.alcance_malla();
        // Densidad adaptativa: más celdas en sistemas grandes / 3D.
        let n = if self.cuerpos.len() >= 6 {
            36
        } else if self.modo == ModoVista::TresD {
            30
        } else {
            28
        };
        let soft = alcance * 0.14;
        let amp = alcance * 0.22;
        let max_disp = alcance * 0.18;
        let stroke = Stroke::new(1.1_f32, Color32::from_rgba_unmultiplied(90, 140, 190, 110));
        let cm = baricentro(&self.cuerpos);

        let nodo = |ix: i32, iy: i32| -> (f32, f32, f32) {
            let x = -alcance + (2.0 * alcance) * (ix as f64) / (n as f64);
            let y = -alcance + (2.0 * alcance) * (iy as f64) / (n as f64);
            let z0 = 0.0_f64;
            let mut dx = 0.0;
            let mut dy = 0.0;
            let mut dz = 0.0;
            for c in &self.cuerpos {
                let rx = (c.posicion.x - cm.x) - x;
                let ry = (c.posicion.y - cm.y) - y;
                let rz = (c.posicion.z - cm.z) - z0;
                let r2 = rx * rx + ry * ry + rz * rz + soft * soft;
                let w = amp * (alcance * alcance) / r2;
                let inv = w / r2.sqrt();
                dx += rx * inv;
                dy += ry * inv;
                dz += rz * inv - amp * 0.15 * (alcance * alcance) / r2; // “pozo” visual en Z
            }
            let mag = (dx * dx + dy * dy + dz * dz).sqrt();
            if mag > max_disp {
                dx *= max_disp / mag;
                dy *= max_disp / mag;
                dz *= max_disp / mag;
            }
            ((x + dx) as f32, (y + dy) as f32, (z0 + dz) as f32)
        };

        for iy in 0..=n {
            let mut fila = Vec::with_capacity((n + 1) as usize);
            for ix in 0..=n {
                let (x, y, z) = nodo(ix, iy);
                fila.push(self.proyectar_rel(x, y, z, rect));
            }
            painter.add(egui::Shape::line(fila, stroke));
        }
        for ix in 0..=n {
            let mut col = Vec::with_capacity((n + 1) as usize);
            for iy in 0..=n {
                let (x, y, z) = nodo(ix, iy);
                col.push(self.proyectar_rel(x, y, z, rect));
            }
            painter.add(egui::Shape::line(col, stroke));
        }
    }
}
