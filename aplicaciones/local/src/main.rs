//! Fractal Local — escritorio egui/eframe con física in-process.
//!
//! Sin Axum, sin Vue, sin WASM: `fractal-fisica` corre en el mismo proceso.
//! Modos 2D (defecto) y 3D, malla que sigue al sistema, sandbox de masas/velocidades.

mod escenario;
mod texturas;

use eframe::egui::{self, Color32, Pos2, Rect, Sense, Stroke, Vec2};
use fractal_fisica::prelude::*;

use escenario::{
    EscenarioCargado, EscenarioMeta, TrayectoriaPeriodica, baricentro, geometria_robusta,
    geometria_sistema, muestrear_trayectoria,
};
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

/// Presets de cámara inspirados en el notebook de órbitas periódicas (cenital / oblicua / perfil).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PresetCamara {
    Cenital,
    Oblicua,
    Perfil,
}

impl PresetCamara {
    fn etiqueta(self) -> &'static str {
        match self {
            Self::Cenital => "Cenital",
            Self::Oblicua => "Oblicua",
            Self::Perfil => "Perfil",
        }
    }

    fn angulos(self) -> (f32, f32) {
        match self {
            // Quasi top-down: se ve la figura plana completa (como el plot 2D del Observable).
            Self::Cenital => (0.15, 1.32),
            // Vista de presentación: algo de profundidad sin perder la figura.
            Self::Oblicua => (0.55, 0.55),
            // Desde el borde del plano orbital.
            Self::Perfil => (1.55, 0.12),
        }
    }
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
    /// Nombres de cuerpos eyectados (cámara sigue al núcleo).
    escapados: Vec<String>,
    /// Si true, el zoom sigue automáticamente al sistema (recomendado en caos).
    auto_camara: bool,
    /// Estelas largas + fade (figuras del catálogo periódico).
    modo_presentacion: bool,
    preset_camara: PresetCamara,
    /// Órbita lenta de cámara en 3D (solo presentación).
    orbitar_camara: bool,
    /// Coreografía precomputada (un período en bucle). `None` → Verlet en vivo.
    trayectoria: Option<TrayectoriaPeriodica>,
    /// Fase ∈ [0, 1) sobre el período cuando hay trayectoria.
    fase_orbita: f64,
    /// Si true y hay trayectoria, ignora el bucle y integra Verlet (diverge: didáctico).
    integrar_en_vivo: bool,
}

impl AppFractal {
    fn nueva(_cc: &eframe::CreationContext<'_>) -> Self {
        let catalogo = escenario::listar_escenarios();
        // Arranca en una figura periódica (presentación); caos queda disponible en el selector.
        let preferido = catalogo
            .iter()
            .find(|m| m.id == "orbit_butterfly")
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
        let periodica = esc.id.starts_with("orbit_") || esc.id == "tres_cuerpos";
        let (yaw, pitch) = PresetCamara::Oblicua.angulos();
        Self {
            catalogo,
            escenario_id: esc.id,
            escenario_nombre: esc.nombre,
            cuerpos: esc.cuerpos,
            estelas: vec![Vec::new(); n],
            tiempo: 0.0,
            pausado: false,
            velocidad: 1.0,
            mostrar_malla: !periodica,
            dt: esc.dt,
            escala: esc.escala,
            zoom: 1.0,
            pan: Vec2::ZERO,
            modo: ModoVista::DosD,
            yaw,
            pitch,
            seleccionado: None,
            texturas: CatalogoTexturas::nuevo(),
            span_suave: span.max(esc.escala),
            escapados: Vec::new(),
            auto_camara: true,
            modo_presentacion: periodica,
            preset_camara: PresetCamara::Oblicua,
            orbitar_camara: false,
            trayectoria: esc.trayectoria,
            fase_orbita: 0.0,
            integrar_en_vivo: false,
        }
    }

    fn aplicar_escenario(&mut self, esc: EscenarioCargado) {
        let (_, span) = geometria_sistema(&esc.cuerpos);
        let periodica = esc.id.starts_with("orbit_") || esc.id == "tres_cuerpos";
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
        self.escapados.clear();
        self.auto_camara = true;
        self.modo_presentacion = periodica;
        self.trayectoria = esc.trayectoria;
        self.fase_orbita = 0.0;
        self.integrar_en_vivo = false;
        if periodica {
            self.mostrar_malla = false;
        }
        self.aplicar_preset_camara(self.preset_camara);
        // Coloca cuerpos en fase 0 de la coreografía si existe.
        if let Some(tray) = self.trayectoria.clone() {
            muestrear_trayectoria(&tray, 0.0, &mut self.cuerpos);
            if self.modo_presentacion {
                self.precargar_estela_desde_trayectoria(&tray);
            }
        }
    }

    /// Dibuja de golpe la figura completa del período (listo para proyectar en clase).
    fn precargar_estela_desde_trayectoria(&mut self, tray: &TrayectoriaPeriodica) {
        let n = self.cuerpos.len().min(3);
        self.estelas = vec![Vec::new(); self.cuerpos.len()];
        if tray.muestras.is_empty() || n == 0 {
            return;
        }
        // Centroide medio de la coreografía (marco de estela).
        let mut cx = 0.0_f64;
        let mut cy = 0.0_f64;
        for m in &tray.muestras {
            for (x, y) in m.xy.iter().take(n) {
                cx += *x;
                cy += *y;
            }
        }
        let denom = (tray.muestras.len() * n) as f64;
        cx /= denom;
        cy /= denom;
        for m in &tray.muestras {
            for (i, (x, y)) in m.xy.iter().take(n).enumerate() {
                self.estelas[i].push(PuntoEstela {
                    x: (*x - cx) as f32,
                    y: (*y - cy) as f32,
                    z: 0.0,
                });
            }
        }
    }

    fn aplicar_preset_camara(&mut self, preset: PresetCamara) {
        self.preset_camara = preset;
        let (yaw, pitch) = preset.angulos();
        self.yaw = yaw;
        self.pitch = pitch;
        if preset == PresetCamara::Cenital && self.modo == ModoVista::TresD {
            // Cenital en 3D; en 2D ya es vista plana.
        }
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
        let usa_coreografia = self.trayectoria.is_some() && !self.integrar_en_vivo;
        if usa_coreografia {
            let tray = self.trayectoria.as_ref().unwrap();
            let periodo = tray.periodo_si.max(1.0);
            // Avance de fase proporcional a velocidad de reproducción.
            let df = (pasos as f64) * self.dt / periodo;
            self.fase_orbita = (self.fase_orbita + df).rem_euclid(1.0);
            self.tiempo += (pasos as f64) * self.dt;
            let fase = self.fase_orbita;
            let tray = tray.clone();
            muestrear_trayectoria(&tray, fase, &mut self.cuerpos);
        } else {
            for _ in 0..pasos {
                paso_velocity_verlet(&mut self.cuerpos, self.dt);
                self.tiempo += self.dt;
            }
        }
        self.registrar_estela();
        self.actualizar_span_suave();
    }

    fn actualizar_span_suave(&mut self) {
        let (_centro, span, escapados_idx) = geometria_robusta(&self.cuerpos);
        self.escapados = escapados_idx
            .iter()
            .filter_map(|&i| self.cuerpos.get(i).map(|c| c.nombre.clone()))
            .collect();
        let objetivo = span.max(self.escala * 0.05);
        // EMA: reacciona a expansión del núcleo (no a eyecciones lejanas).
        let alfa = if objetivo > self.span_suave * 1.02 {
            0.35
        } else if objetivo < self.span_suave * 0.85 {
            0.08
        } else {
            0.12
        };
        self.span_suave = self.span_suave * (1.0 - alfa) + objetivo * alfa;
    }

    fn registrar_estela(&mut self) {
        let max = if self.modo_presentacion { 4200 } else { 1400 };
        let cm = baricentro(&self.cuerpos);
        for (i, c) in self.cuerpos.iter().enumerate() {
            let p = PuntoEstela {
                x: (c.posicion.x - cm.x) as f32,
                y: (c.posicion.y - cm.y) as f32,
                z: (c.posicion.z - cm.z) as f32,
            };
            self.estelas[i].push(p);
            if self.estelas[i].len() > max {
                let sobra = self.estelas[i].len() - max;
                self.estelas[i].drain(0..sobra);
            }
        }
    }

    fn reset_camara(&mut self) {
        self.zoom = 1.0;
        self.pan = Vec2::ZERO;
        self.aplicar_preset_camara(self.preset_camara);
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
            // Si hay eyección hiperveloz, menos subpasos para no “teletransportar” el núcleo.
            let vmax = self.cuerpos.iter().map(|c| c.velocidad.norma()).fold(0.0_f64, f64::max);
            let tope = if vmax > 5.0e4 { 12 } else { 64 };
            let subpasos = ((8.0 * self.velocidad).round() as usize).clamp(1, tope);
            self.avanzar(subpasos);
            if self.orbitar_camara && self.modo == ModoVista::TresD {
                self.yaw += 0.004 * self.velocidad.clamp(0.2, 2.0);
            }
            ctx.request_repaint();
        } else if self.orbitar_camara && self.modo == ModoVista::TresD {
            self.yaw += 0.003;
            ctx.request_repaint();
        }

        egui::TopBottomPanel::top("barra").show(ctx, |ui| {
            ui.horizontal_wrapped(|ui| {
                ui.heading("Fractal Local");
                ui.separator();

                let mut elegido = self.escenario_id.clone();
                egui::ComboBox::from_id_salt("escenario")
                    .selected_text(&self.escenario_nombre)
                    .width(240.0)
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
                if ui.button("⌖ Cámara").on_hover_text("Reset zoom/pan al preset actual").clicked()
                {
                    self.reset_camara();
                }

                ui.separator();
                ui.label("Vista");
                ui.selectable_value(&mut self.modo, ModoVista::DosD, "2D");
                ui.selectable_value(&mut self.modo, ModoVista::TresD, "3D");

                ui.separator();
                ui.label("Cámara");
                let mut preset = self.preset_camara;
                for p in [PresetCamara::Cenital, PresetCamara::Oblicua, PresetCamara::Perfil] {
                    if ui.selectable_label(preset == p, p.etiqueta()).clicked() {
                        preset = p;
                    }
                }
                if preset != self.preset_camara {
                    self.aplicar_preset_camara(preset);
                    if preset != PresetCamara::Cenital {
                        self.modo = ModoVista::TresD;
                    }
                }

                ui.separator();
                ui.label("Velocidad");
                ui.add(egui::Slider::new(&mut self.velocidad, 0.1..=4.0));
                ui.checkbox(&mut self.mostrar_malla, "Malla gravitatoria");
                ui.checkbox(&mut self.auto_camara, "Auto-cámara")
                    .on_hover_text("Sigue al núcleo ligado; ignora eyecciones lejanas");
                ui.checkbox(&mut self.modo_presentacion, "Presentación")
                    .on_hover_text("Estelas largas con fade — figuras del catálogo periódico");
                ui.checkbox(&mut self.orbitar_camara, "Orbitar")
                    .on_hover_text("Gira la cámara 3D despacio (útil en proyección)");
                if self.trayectoria.is_some() {
                    ui.checkbox(&mut self.integrar_en_vivo, "Integrar en vivo")
                        .on_hover_text(
                            "OFF = coreografía (período en bucle, como Observable). ON = Verlet (diverge: la mayoría son inestables).",
                        );
                }
                ui.separator();
                ui.monospace(format!("t = {:.3e} s", self.tiempo));
                if self.trayectoria.is_some() && !self.integrar_en_vivo {
                    ui.monospace(format!("fase {:.1}%", self.fase_orbita * 100.0));
                }
                let e = energia_total(&self.cuerpos);
                ui.monospace(format!("E = {:.6e} J", e));
                ui.monospace(format!("zoom {:.2}×", self.zoom));
                if !self.escapados.is_empty() {
                    ui.colored_label(
                        Color32::from_rgb(255, 180, 90),
                        format!("Eyección: {} (cámara en el núcleo)", self.escapados.join(", ")),
                    );
                }
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
            ui.heading("Presentar");
            ui.weak(
                "Órbitas periódicas planas (Observable/@rreusser · IPB): mariposa, libélula, yin-yang, madeja, polilla, Broucke, figure-8.",
            );
            ui.label("Consejo: 2D o cámara Cenital + Presentación ON para ver la figura de la estela.");
            if self.trayectoria.is_some() {
                ui.colored_label(
                    Color32::from_rgb(120, 200, 160),
                    "Coreografía: un período precomputado en bucle (las demás familias divergen en vivo).",
                );
            }
            ui.add_space(8.0);
            ui.weak("Atajos: Espacio pausa · G malla · R reiniciar · 2/3 vista · [ ] escenario · F cámara · P presentación · 1 cenital · Shift+2/3 oblicua/perfil · O orbitar");
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
            if i.key_pressed(egui::Key::Num2) && !i.modifiers.shift {
                self.modo = ModoVista::DosD;
            }
            if i.key_pressed(egui::Key::Num3) && !i.modifiers.shift {
                self.modo = ModoVista::TresD;
            }
            if i.key_pressed(egui::Key::OpenBracket) || i.key_pressed(egui::Key::PageUp) {
                self.escenario_siguiente(-1);
            }
            if i.key_pressed(egui::Key::CloseBracket) || i.key_pressed(egui::Key::PageDown) {
                self.escenario_siguiente(1);
            }
            if i.key_pressed(egui::Key::P) {
                self.modo_presentacion = !self.modo_presentacion;
            }
            if i.key_pressed(egui::Key::Num1) {
                self.aplicar_preset_camara(PresetCamara::Cenital);
            }
            if i.key_pressed(egui::Key::Num2) && i.modifiers.shift {
                self.aplicar_preset_camara(PresetCamara::Oblicua);
                self.modo = ModoVista::TresD;
            }
            if i.key_pressed(egui::Key::Num3) && i.modifiers.shift {
                self.aplicar_preset_camara(PresetCamara::Perfil);
                self.modo = ModoVista::TresD;
            }
            if i.key_pressed(egui::Key::O) {
                self.orbitar_camara = !self.orbitar_camara;
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

        if self.auto_camara {
            // Recentra suavemente tras pan manual / eyecciones.
            self.pan *= 0.92;
        }

        if self.mostrar_malla {
            match self.modo {
                ModoVista::DosD => self.dibujar_malla_2d(painter, rect),
                ModoVista::TresD => self.dibujar_malla_3d(painter, rect),
            }
        }

        for (i, estela) in self.estelas.iter().enumerate() {
            if estela.len() < 2 {
                continue;
            }
            let base = color_planeta(&self.cuerpos[i].id, i);
            let puntos: Vec<Pos2> =
                estela.iter().map(|p| self.proyectar_rel(p.x, p.y, p.z, rect)).collect();
            if self.modo_presentacion {
                // Fade de cola → cabeza (como las estelas WebGL del notebook).
                let n = puntos.len().saturating_sub(1).max(1);
                let grosor = 2.2_f32;
                for (k, w) in puntos.windows(2).enumerate() {
                    let t = (k as f32) / (n as f32);
                    let a = (28.0 + 200.0 * t * t) as u8;
                    let col = Color32::from_rgba_unmultiplied(base.r(), base.g(), base.b(), a);
                    painter.line_segment([w[0], w[1]], Stroke::new(grosor, col));
                }
            } else {
                let color = base.gamma_multiply(0.55);
                painter.add(egui::Shape::line(puntos, Stroke::new(1.5_f32, color)));
            }
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
                "{modo} · {} · P: presentación · 1 cenital · Shift+2/3 oblicua/perfil · O: orbitar · [ ]: órbita",
                self.preset_camara.etiqueta()
            ),
            egui::FontId::proportional(12.0),
            Color32::from_gray(140),
        );
    }

    /// Desplazamiento del campo en un punto relativo al CM (suavizado).
    fn campo_en(&self, x: f64, y: f64, z: f64, alcance: f64) -> (f64, f64, f64) {
        let soft = alcance * 0.14;
        let amp = alcance * 0.20;
        let max_disp = alcance * 0.16;
        let cm = baricentro(&self.cuerpos);
        let mut dx = 0.0;
        let mut dy = 0.0;
        let mut dz = 0.0;
        for c in &self.cuerpos {
            let rx = (c.posicion.x - cm.x) - x;
            let ry = (c.posicion.y - cm.y) - y;
            let rz = (c.posicion.z - cm.z) - z;
            let r2 = rx * rx + ry * ry + rz * rz + soft * soft;
            let w = amp * (alcance * alcance) / r2;
            let inv = w / r2.sqrt();
            dx += rx * inv;
            dy += ry * inv;
            dz += rz * inv;
        }
        let mag = (dx * dx + dy * dy + dz * dz).sqrt();
        if mag > max_disp {
            dx *= max_disp / mag;
            dy *= max_disp / mag;
            dz *= max_disp / mag;
        }
        (dx, dy, dz)
    }

    /// Malla 2D: sábana en el plano orbital (XY) con pozos de potencial.
    fn dibujar_malla_2d(&self, painter: &egui::Painter, rect: Rect) {
        let alcance = self.alcance_malla();
        let n = if self.cuerpos.len() >= 6 { 36 } else { 28 };
        let stroke = Stroke::new(1.1_f32, Color32::from_rgba_unmultiplied(90, 140, 190, 120));

        let nodo = |ix: i32, iy: i32| -> (f32, f32, f32) {
            let x = -alcance + (2.0 * alcance) * (ix as f64) / (n as f64);
            let y = -alcance + (2.0 * alcance) * (iy as f64) / (n as f64);
            let (dx, dy, dz) = self.campo_en(x, y, 0.0, alcance);
            // En 2D el “pozo” se lee como hundimiento visual en Z proyectada.
            ((x + dx) as f32, (y + dy) as f32, (dz - 0.12 * alcance) as f32)
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

    /// Malla 3D: retícula cúbica (no la sábana 2D) deformada por el campo.
    fn dibujar_malla_3d(&self, painter: &egui::Painter, rect: Rect) {
        let alcance = self.alcance_malla();
        let n = 8; // aristas por eje — legible sin tapar planetas
        let stroke = Stroke::new(1.0_f32, Color32::from_rgba_unmultiplied(100, 170, 210, 95));
        let stroke_eje = Stroke::new(1.4_f32, Color32::from_rgba_unmultiplied(255, 176, 0, 90));

        let nodo = |ix: i32, iy: i32, iz: i32| -> (f32, f32, f32) {
            let x = -alcance + (2.0 * alcance) * (ix as f64) / (n as f64);
            let y = -alcance + (2.0 * alcance) * (iy as f64) / (n as f64);
            let z = -alcance + (2.0 * alcance) * (iz as f64) / (n as f64);
            let (dx, dy, dz) = self.campo_en(x, y, z, alcance);
            ((x + dx) as f32, (y + dy) as f32, (z + dz) as f32)
        };

        // Líneas paralelas a X / Y / Z (caja volumétrica).
        for iy in 0..=n {
            for iz in 0..=n {
                // Evitar saturar: solo caras + algunas internas.
                if iy != 0 && iy != n && iz != 0 && iz != n && (iy + iz) % 2 == 1 {
                    continue;
                }
                let mut linea = Vec::with_capacity((n + 1) as usize);
                for ix in 0..=n {
                    let (x, y, z) = nodo(ix, iy, iz);
                    linea.push(self.proyectar_rel(x, y, z, rect));
                }
                painter.add(egui::Shape::line(linea, stroke));
            }
        }
        for ix in 0..=n {
            for iz in 0..=n {
                if ix != 0 && ix != n && iz != 0 && iz != n && (ix + iz) % 2 == 1 {
                    continue;
                }
                let mut linea = Vec::with_capacity((n + 1) as usize);
                for iy in 0..=n {
                    let (x, y, z) = nodo(ix, iy, iz);
                    linea.push(self.proyectar_rel(x, y, z, rect));
                }
                painter.add(egui::Shape::line(linea, stroke));
            }
        }
        for ix in 0..=n {
            for iy in 0..=n {
                if ix != 0 && ix != n && iy != 0 && iy != n && (ix + iy) % 2 == 1 {
                    continue;
                }
                let mut linea = Vec::with_capacity((n + 1) as usize);
                for iz in 0..=n {
                    let (x, y, z) = nodo(ix, iy, iz);
                    linea.push(self.proyectar_rel(x, y, z, rect));
                }
                painter.add(egui::Shape::line(linea, stroke));
            }
        }

        // Ejes del marco local (referencia 3D).
        let o = self.proyectar_rel(0.0, 0.0, 0.0, rect);
        let ex = self.proyectar_rel(alcance as f32 * 0.55, 0.0, 0.0, rect);
        let ey = self.proyectar_rel(0.0, alcance as f32 * 0.55, 0.0, rect);
        let ez = self.proyectar_rel(0.0, 0.0, alcance as f32 * 0.55, rect);
        painter.line_segment([o, ex], stroke_eje);
        painter.line_segment(
            [o, ey],
            Stroke::new(1.4_f32, Color32::from_rgba_unmultiplied(79, 209, 197, 100)),
        );
        painter.line_segment(
            [o, ez],
            Stroke::new(1.4_f32, Color32::from_rgba_unmultiplied(180, 140, 255, 100)),
        );
    }
}
