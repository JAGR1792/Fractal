//! Fractal Local — escritorio egui/eframe con física in-process.
//!
//! Sin Axum, sin Vue, sin WASM: `fractal-fisica` corre en el mismo proceso.
//! Modos 2D (defecto) y 3D, malla que sigue al sistema, sandbox de masas/velocidades.

mod escenario;
mod fondo;
mod mision;
mod texturas;

use eframe::egui::{self, Color32, Pos2, Rect, Sense, Stroke, Vec2};
use fractal_fisica::prelude::*;

use escenario::{
    EscenarioCargado, EscenarioMeta, TrayectoriaPeriodica, geometria_robusta, geometria_sistema,
    muestrear_trayectoria,
};
use mision::EstadoMision;
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
    /// Si true y hay trayectoria, usa Verlet en vez del bucle (casi siempre diverge).
    fisica_real: bool,
    /// Tope de encuadre (= escala inicial × factor) para no “congelar” al alejarse.
    span_tope: f64,
    /// Se activó pausa automática por eyección / disolución.
    pausa_por_eyeccion: bool,
    /// Panel de misión (burns, fuerzas, ground track).
    mision: EstadoMision,
    /// Distancia de cámara 3D (órbita); menor = más cerca.
    distancia_camara: f32,
    /// Seguir al cuerpo seleccionado con la cámara.
    seguir_seleccion: bool,
}

impl AppFractal {
    fn nueva(_cc: &eframe::CreationContext<'_>) -> Self {
        let catalogo = escenario::listar_escenarios();
        // AppEscritorio: arranca en Sistema Solar para ver texturas reales de inmediato.
        let preferido = catalogo
            .iter()
            .find(|m| m.id == "sistema_solar")
            .or_else(|| catalogo.iter().find(|m| m.id == "leo_hohmann"))
            .or_else(|| catalogo.iter().find(|m| m.id == "tres_cuerpos"))
            .or_else(|| catalogo.first())
            .map(|m| m.id.clone())
            .unwrap_or_else(|| "sistema_solar".into());

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
            modo: ModoVista::TresD,
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
            fisica_real: false,
            span_tope: span.max(esc.escala) * 10.0,
            pausa_por_eyeccion: false,
            mision: EstadoMision::default(),
            distancia_camara: 2.8,
            seguir_seleccion: false,
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
        self.distancia_camara = 2.8;
        self.seguir_seleccion = false;
        self.seleccionado = None;
        self.span_suave = span.max(esc.escala);
        self.span_tope = self.span_suave * 10.0;
        self.escapados.clear();
        self.auto_camara = true;
        self.modo_presentacion = periodica;
        self.trayectoria = esc.trayectoria;
        self.fase_orbita = 0.0;
        self.fisica_real = false;
        self.pausa_por_eyeccion = false;
        self.mision = EstadoMision::default();
        // Escenarios de misión: auto-selecciona el vehículo y enciende track.
        if matches!(
            self.escenario_id.as_str(),
            "leo_hohmann" | "formacion_safety" | "tierra_luna_l2" | "dos_cuerpos"
        ) {
            self.mision.mostrar_ground_track = true;
            if let Some((_, veh)) = EstadoMision::indices(&self.cuerpos, None) {
                self.seleccionado = Some(veh);
            }
            if self.escenario_id == "leo_hohmann" {
                self.mision.modelo.j2 = true;
            }
        }
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
        let usa_coreografia = self.trayectoria.is_some() && !self.fisica_real;
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
            // dt adaptativo: si alguien ya va muy rápido, no “teletransportar”.
            let vmax = self.cuerpos.iter().map(|c| c.velocidad.norma()).fold(0.0_f64, f64::max);
            let dt = if vmax > 5.0e4 { self.dt * (5.0e4 / vmax).clamp(0.02, 1.0) } else { self.dt };
            let modelo = self.mision.modelo;
            let integrador = self.mision.integrador;
            for _ in 0..pasos {
                paso(&mut self.cuerpos, dt, &modelo, integrador);
                // Colisiones físicas → escombros ardientes (no eyección mágica).
                while resolver_colisiones(&mut self.cuerpos) > 0 {
                    self.seleccionado = None;
                }
                enfriar_y_purgar(&mut self.cuerpos, dt);
                self.tiempo += dt;
            }
            self.sincronizar_estelas();
        }
        self.registrar_estela();
        self.mision.registrar_track(&self.cuerpos, self.seleccionado, self.tiempo);
        self.actualizar_span_suave();
    }

    fn sincronizar_estelas(&mut self) {
        while self.estelas.len() < self.cuerpos.len() {
            self.estelas.push(Vec::new());
        }
        self.estelas.truncate(self.cuerpos.len());
        if let Some(i) = self.seleccionado
            && i >= self.cuerpos.len()
        {
            self.seleccionado = None;
        }
    }

    fn actualizar_span_suave(&mut self) {
        let (_centro, span, escapados_idx) = geometria_robusta(&self.cuerpos);
        self.escapados = escapados_idx
            .iter()
            .filter_map(|&i| self.cuerpos.get(i).map(|c| c.nombre.clone()))
            .collect();
        let objetivo = span.max(self.escala * 0.05).min(self.span_tope);
        // EMA: reacciona a expansión del núcleo (no a eyecciones lejanas).
        let alfa = if objetivo > self.span_suave * 1.02 {
            0.22
        } else if objetivo < self.span_suave * 0.85 {
            0.08
        } else {
            0.12
        };
        self.span_suave = (self.span_suave * (1.0 - alfa) + objetivo * alfa).min(self.span_tope);

        // Si la física real disolvió el sistema, pausar: el “congelado” engaña.
        if self.fisica_real && !self.escapados.is_empty() && !self.pausa_por_eyeccion {
            let vmax = self.cuerpos.iter().map(|c| c.velocidad.norma()).fold(0.0_f64, f64::max);
            let disuelto = self.escapados.len() + 1 >= self.cuerpos.len() || vmax > 2.0e5;
            if disuelto || span >= self.span_tope * 0.95 {
                self.pausado = true;
                self.pausa_por_eyeccion = true;
            }
        }
    }

    fn registrar_estela(&mut self) {
        let max = if self.modo_presentacion { 4200 } else { 1400 };
        let cm = self.centro_vista();
        let escapados: std::collections::HashSet<usize> =
            geometria_robusta(&self.cuerpos).2.into_iter().collect();
        for (i, c) in self.cuerpos.iter().enumerate() {
            if escapados.contains(&i) || c.es_escombro() {
                continue; // no contaminar la figura con eyecciones / escombros
            }
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

    /// Centro de cámara: selección, o núcleo ligado (ignora eyecciones).
    fn centro_vista(&self) -> Vec3 {
        if self.seguir_seleccion
            && let Some(i) = self.seleccionado
            && let Some(c) = self.cuerpos.get(i)
            && !c.es_escombro()
        {
            return c.posicion;
        }
        geometria_robusta(&self.cuerpos).0
    }

    fn reset_camara(&mut self) {
        self.zoom = 1.0;
        self.pan = Vec2::ZERO;
        self.distancia_camara = 2.8;
        self.seguir_seleccion = false;
        self.aplicar_preset_camara(self.preset_camara);
    }

    /// Encuadra el sistema (o la selección) con un zoom cómodo.
    fn encuadrar(&mut self) {
        self.pan = Vec2::ZERO;
        if self.seleccionado.is_some() {
            self.seguir_seleccion = true;
            self.zoom = (self.zoom.max(1.0) * 2.5).clamp(1.5, 80.0);
            self.distancia_camara = 1.6;
        } else {
            self.seguir_seleccion = false;
            self.zoom = 1.0;
            self.distancia_camara = 2.8;
        }
        if self.modo == ModoVista::TresD && self.preset_camara == PresetCamara::Cenital {
            self.aplicar_preset_camara(PresetCamara::Oblicua);
        }
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
                if ui.selectable_value(&mut self.modo, ModoVista::TresD, "3D").clicked()
                    && self.mostrar_malla
                    && self.preset_camara == PresetCamara::Cenital
                {
                    // El pozo se lee mejor en oblicua que cenital.
                    self.aplicar_preset_camara(PresetCamara::Oblicua);
                }

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
                ui.checkbox(&mut self.mostrar_malla, "Pozo gravitatorio")
                    .on_hover_text("2D: sábana · 3D: tejido/curvatura (potencial Φ)");
                ui.checkbox(&mut self.auto_camara, "Auto-cámara")
                    .on_hover_text("Recentra al núcleo; se apaga al hacer zoom/pan manual");
                ui.checkbox(&mut self.seguir_seleccion, "Seguir selección")
                    .on_hover_text("La cámara mira al cuerpo seleccionado");
                ui.checkbox(&mut self.modo_presentacion, "Presentación")
                    .on_hover_text("Estelas largas con fade — figuras del catálogo periódico");
                ui.checkbox(&mut self.orbitar_camara, "Orbitar")
                    .on_hover_text("Gira la cámara 3D despacio (útil en proyección)");
                ui.add(
                    egui::Slider::new(&mut self.zoom, 0.02..=250.0)
                        .logarithmic(true)
                        .text("Zoom"),
                );
                if self.modo == ModoVista::TresD {
                    ui.add(
                        egui::Slider::new(&mut self.distancia_camara, 0.55..=8.0)
                            .text("Dist. cámara"),
                    );
                }
                if ui.button("⊡ Encuadrar").on_hover_text("Doble clic · enfoca sistema o selección").clicked()
                {
                    self.encuadrar();
                }
                if self.trayectoria.is_some() {
                    let antes = self.fisica_real;
                    ui.checkbox(&mut self.fisica_real, "Física real ⚠")
                        .on_hover_text(
                            "OFF (recomendado): coreografía — un período en bucle, la figura se mantiene.\n\
                             ON: integra con Verlet de verdad. Casi todas estas órbitas son inestables: \
                             en segundos alguien sale disparado y parece «congelado» al alejarse.",
                        );
                    if self.fisica_real && !antes {
                        self.pausa_por_eyeccion = false;
                        self.estelas = vec![Vec::new(); self.cuerpos.len()];
                    }
                    if !self.fisica_real && antes {
                        // Volver al bucle limpio.
                        self.reiniciar();
                    }
                }
                ui.separator();
                ui.monospace(format!("t = {:.3e} s", self.tiempo));
                if self.trayectoria.is_some() && !self.fisica_real {
                    ui.monospace(format!("fase {:.1}%", self.fase_orbita * 100.0));
                }
                let e = energia_total(&self.cuerpos);
                ui.monospace(format!("E = {:.6e} J", e));
                ui.monospace(format!(
                    "zoom {:.2}× · dist {:.2}",
                    self.zoom, self.distancia_camara
                ));
                let (n_real, n_tex) = self.texturas.conteo();
                if n_tex > 0 {
                    let col = if n_real == n_tex {
                        Color32::from_rgb(120, 200, 160)
                    } else {
                        Color32::from_rgb(255, 180, 90)
                    };
                    ui.colored_label(col, format!("texturas {n_real}/{n_tex}"));
                }
                if self.pausa_por_eyeccion {
                    ui.colored_label(
                        Color32::from_rgb(255, 120, 100),
                        "Sistema disuelto (eyección). Reinicia o desactiva Física real.",
                    );
                } else if !self.escapados.is_empty() {
                    ui.colored_label(
                        Color32::from_rgb(255, 180, 90),
                        format!("Eyección: {} — cámara en el núcleo", self.escapados.join(", ")),
                    );
                }
            });
        });

        egui::SidePanel::right("sandbox").default_width(280.0).resizable(true).show(ctx, |ui| {
            egui::ScrollArea::vertical().show(ui, |ui| {
            mision::ui_panel_mision(
                ui,
                &mut self.mision,
                &mut self.cuerpos,
                self.seleccionado,
                self.dt,
            );
            ui.separator();
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
                    "Por defecto: coreografía (período en bucle). «Física real» integra Verlet y casi siempre eyecta — por eso parece que se congelan.",
                );
            }
            ui.add_space(6.0);
            ui.label("Texturas");
            for c in &self.cuerpos {
                let ok = self.texturas.es_real(&c.id);
                let ruta = self.texturas.ruta_de(&c.id);
                let msg = match (ok, ruta) {
                    (true, Some(p)) => format!("✓ {} ← {}", c.nombre, p.file_name().and_then(|n| n.to_str()).unwrap_or("?")),
                    (_, Some(p)) => format!("✗ {} (falló {})", c.nombre, p.display()),
                    _ => format!("✗ {} (sin PNG)", c.nombre),
                };
                ui.colored_label(
                    if ok { Color32::from_rgb(120, 200, 160) } else { Color32::from_rgb(255, 140, 100) },
                    msg,
                );
            }
            ui.add_space(8.0);
            ui.weak("Atajos: rueda zoom · Alt+rueda dist · Shift/medio pan 3D · C encuadrar · +/- zoom · Espacio pausa · G malla · R reiniciar · F reset cam · P presentación · O orbitar");
            }); // ScrollArea
        });

        egui::CentralPanel::default().show(ctx, |ui| {
            let (respuesta, painter) =
                ui.allocate_painter(ui.available_size(), Sense::click_and_drag());
            let rect = respuesta.rect;

            // Zoom exponencial hacia el cursor (rueda). Alt = distancia 3D.
            let (scroll, alt) = ui.input(|i| {
                let d = i.smooth_scroll_delta.y;
                (d, i.modifiers.alt)
            });
            if respuesta.hovered() && scroll.abs() > 0.0 {
                if alt && self.modo == ModoVista::TresD {
                    // Acercar/alejar la órbita de cámara.
                    let f = (1.0 - scroll * 0.0018).clamp(0.82, 1.22);
                    self.distancia_camara = (self.distancia_camara * f).clamp(0.55, 8.0);
                } else if let Some(pos) = respuesta.hover_pos() {
                    let antes = self.zoom;
                    // Exponencial: un “notch” de rueda ≈ ×1.12
                    let pasos = (scroll / 40.0).clamp(-4.0, 4.0);
                    self.zoom = (self.zoom * 1.12f32.powf(pasos)).clamp(0.02, 250.0);
                    let origen = rect.center() + self.pan;
                    let offset = pos - origen;
                    let ratio = self.zoom / antes.max(1e-4);
                    self.pan += offset * (1.0 - ratio);
                    // Al hacer zoom agresivo, aflojar auto-cámara para no pelear.
                    if (self.zoom - antes).abs() / antes > 0.05 {
                        self.auto_camara = false;
                    }
                }
            }

            match self.modo {
                ModoVista::DosD => {
                    if respuesta.dragged_by(egui::PointerButton::Primary)
                        || respuesta.dragged_by(egui::PointerButton::Middle)
                    {
                        self.pan += respuesta.drag_delta();
                        self.auto_camara = false;
                    }
                }
                ModoVista::TresD => {
                    let shift = ui.input(|i| i.modifiers.shift);
                    if (respuesta.dragged_by(egui::PointerButton::Primary) && shift)
                        || respuesta.dragged_by(egui::PointerButton::Middle)
                    {
                        // Pan en 3D (Shift+arrastre o rueda central).
                        self.pan += respuesta.drag_delta();
                        self.auto_camara = false;
                    } else if respuesta.dragged_by(egui::PointerButton::Primary)
                        || respuesta.dragged_by(egui::PointerButton::Secondary)
                    {
                        let d = respuesta.drag_delta();
                        self.yaw += d.x * 0.007;
                        self.pitch = (self.pitch + d.y * 0.007).clamp(-1.45, 1.45);
                    }
                }
            }

            if respuesta.double_clicked() {
                self.encuadrar();
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
            if i.key_pressed(egui::Key::C) {
                self.encuadrar();
            }
            if i.key_pressed(egui::Key::Equals) || i.key_pressed(egui::Key::Plus) {
                self.zoom = (self.zoom * 1.25).clamp(0.02, 250.0);
            }
            if i.key_pressed(egui::Key::Minus) {
                self.zoom = (self.zoom / 1.25).clamp(0.02, 250.0);
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
        let cm = self.centro_vista();
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

        let dist = self.distancia_camara.clamp(0.55, 8.0);
        let z_cam = z2 + dist;
        let f = 1.65 / z_cam.max(0.12);
        let s = rect.width().min(rect.height()) * 0.40 * self.zoom;
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

    /// Radio visual en metros de mundo: exagerado para verse, pero **sin solapar**.
    ///
    /// En Sistema Solar, un Sol dibujado “a ojo” se come a Mercurio. Aquí el radio
    /// visual nunca supera ~38 % de la distancia al vecino más cercano.
    fn radio_visual_mundo(&self, idx: usize) -> f64 {
        let c = &self.cuerpos[idx];
        let exag = if self.cuerpos.len() >= 6 {
            350.0
        } else if c.es_escombro() {
            40.0
        } else {
            90.0
        };
        let mut r = c.radio * exag;
        let mut dmin = f64::INFINITY;
        for (j, o) in self.cuerpos.iter().enumerate() {
            if j == idx {
                continue;
            }
            dmin = dmin.min(c.posicion.distancia(&o.posicion));
        }
        if dmin.is_finite() && dmin > 0.0 {
            r = r.min(dmin * 0.38);
        }
        r.max(c.radio * 0.5).max(1.0)
    }

    /// Radio en pantalla: proyecta el radio visual de mundo (escala con zoom).
    fn radio_pantalla(&self, idx: usize, rect: Rect, prof: f32) -> f32 {
        let c = &self.cuerpos[idx];
        let vista = self.centro_vista();
        let r = self.radio_visual_mundo(idx);
        let p0 = self.proyectar_rel(
            (c.posicion.x - vista.x) as f32,
            (c.posicion.y - vista.y) as f32,
            (c.posicion.z - vista.z) as f32,
            rect,
        );
        // Offset a lo largo de +X del mundo → tamaño aparente.
        let p1 = self.proyectar_rel(
            (c.posicion.x - vista.x + r) as f32,
            (c.posicion.y - vista.y) as f32,
            (c.posicion.z - vista.z) as f32,
            rect,
        );
        let mut px = p0.distance(p1);
        if self.modo == ModoVista::TresD {
            px *= 1.08 - 0.15 * prof.clamp(-1.0, 1.5);
        }
        // Piso suave: se ven los planetas lejanos sin hinchar al Sol.
        let min_px = if c.es_escombro() {
            2.0
        } else if self.cuerpos.len() >= 6 {
            2.8
        } else {
            5.0
        };
        let max_px = rect.width().min(rect.height()) * 0.22;
        px.clamp(min_px, max_px)
    }

    fn color_escombro(calor: f64) -> Color32 {
        let t = calor.clamp(0.0, 1.0) as f32;
        // Blanco-amarillo → naranja → rojo oscuro → ceniza.
        let r = (255.0) as u8;
        let g = (40.0 + 180.0 * t * t) as u8;
        let b = (20.0 + 40.0 * t) as u8;
        let a = (60.0 + 195.0 * t) as u8;
        Color32::from_rgba_unmultiplied(r, g, b, a)
    }

    fn dibujar_escena(&mut self, ctx: &egui::Context, painter: &egui::Painter, rect: Rect) {
        fondo::dibujar(painter, rect, self.pan, self.yaw, self.pitch, self.zoom);

        // Precarga texturas reales cuanto antes (HUD del panel las consulta).
        for (i, c) in self.cuerpos.iter().enumerate() {
            let _ = self.texturas.obtener(ctx, &c.id, i);
        }

        if self.auto_camara && !self.seguir_seleccion {
            // Recentra suave solo si no estamos siguiendo / arrastrando a mano.
            self.pan *= 0.94;
        }

        if self.mostrar_malla {
            match self.modo {
                ModoVista::DosD => self.dibujar_malla_2d(painter, rect),
                ModoVista::TresD => self.dibujar_pozo_3d(painter, rect),
            }
        }

        let vista = self.centro_vista();
        for (i, estela) in self.estelas.iter().enumerate() {
            if estela.len() < 2 || i >= self.cuerpos.len() || self.cuerpos[i].es_escombro() {
                continue;
            }
            let base = color_planeta(&self.cuerpos[i].id, i);
            let puntos: Vec<Pos2> =
                estela.iter().map(|p| self.proyectar_rel(p.x, p.y, p.z, rect)).collect();
            if self.modo_presentacion {
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

        let mut orden: Vec<usize> = (0..self.cuerpos.len()).collect();
        if self.modo == ModoVista::TresD {
            orden.sort_by(|&a, &b| {
                let pa = &self.cuerpos[a].posicion;
                let pb = &self.cuerpos[b].posicion;
                let da = self.profundidad_3d(
                    (pa.x - vista.x) as f32,
                    (pa.y - vista.y) as f32,
                    (pa.z - vista.z) as f32,
                );
                let db = self.profundidad_3d(
                    (pb.x - vista.x) as f32,
                    (pb.y - vista.y) as f32,
                    (pb.z - vista.z) as f32,
                );
                db.partial_cmp(&da).unwrap_or(std::cmp::Ordering::Equal)
            });
        }

        let escapados: std::collections::HashSet<usize> =
            geometria_robusta(&self.cuerpos).2.into_iter().collect();

        for &i in &orden {
            let c = &self.cuerpos[i];
            let rx = (c.posicion.x - vista.x) as f32;
            let ry = (c.posicion.y - vista.y) as f32;
            let rz = (c.posicion.z - vista.z) as f32;
            let centro = self.proyectar_rel(rx, ry, rz, rect);
            let prof = self.profundidad_3d(rx, ry, rz);
            let radio_px = self.radio_pantalla(i, rect, prof);

            // Eyecciones: marcador en el borde en vez de un punto perdido al infinito.
            if escapados.contains(&i) && !c.es_escombro() {
                let dir = (centro - rect.center()).normalized();
                let borde = rect.center() + dir * (rect.width().min(rect.height()) * 0.46);
                painter.circle_filled(borde, 5.0, color_planeta(&c.id, i));
                painter.text(
                    borde + Vec2::new(0.0, 10.0),
                    egui::Align2::CENTER_TOP,
                    format!("{} ↗", c.nombre),
                    egui::FontId::proportional(11.0),
                    Color32::from_rgb(255, 170, 120),
                );
                continue;
            }

            if c.es_escombro() {
                // Roca ardiente: núcleo blanco-naranja + halo que se apaga.
                let col = Self::color_escombro(c.calor);
                let halo = radio_px * (1.4 + 0.8 * c.calor as f32);
                painter.circle_filled(
                    centro,
                    halo,
                    Color32::from_rgba_unmultiplied(col.r(), col.g() / 2, 0, (col.a() / 3).max(20)),
                );
                painter.circle_filled(centro, radio_px, col);
                continue;
            }

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

        if let Some(track_rect) = mision::rect_ground_track(rect, self.mision.mostrar_ground_track)
        {
            mision::fondo_track(painter, track_rect);
            mision::dibujar_ground_track(painter, track_rect.shrink(14.0), &self.mision.track);
        }

        let modo = match self.modo {
            ModoVista::DosD => "2D",
            ModoVista::TresD => "3D · pozo Φ",
        };
        let integ = self.mision.integrador.etiqueta();
        painter.text(
            rect.left_bottom() + Vec2::new(12.0, -14.0),
            egui::Align2::LEFT_BOTTOM,
            format!(
                "{modo} · {} · {integ} · P presentación · G pozo · R reiniciar · [ ] órbita",
                self.preset_camara.etiqueta()
            ),
            egui::FontId::proportional(12.0),
            Color32::from_gray(140),
        );
    }

    /// Potencial newtoniano suavizado Φ (negativo cerca de masas) → profundidad del pozo.
    fn potencial_en(&self, x: f64, y: f64, alcance: f64) -> f64 {
        let vista = self.centro_vista();
        let soft = (alcance * 0.08).max(1.0);
        let mut phi = 0.0_f64;
        let mut m_tot = 0.0_f64;
        for c in &self.cuerpos {
            m_tot += c.masa;
            let rx = (c.posicion.x - vista.x) - x;
            let ry = (c.posicion.y - vista.y) - y;
            let r = (rx * rx + ry * ry + soft * soft).sqrt();
            phi -= c.masa / r;
        }
        if m_tot <= 0.0 {
            return 0.0;
        }
        // Normaliza: 0 lejos, ~1 en el pozo más profundo típico.
        let escala_phi = m_tot / (alcance * 0.35).max(soft);
        (-phi / escala_phi).clamp(0.0, 1.35)
    }

    /// Malla 2D: sábana en el plano orbital con pozos.
    fn dibujar_malla_2d(&self, painter: &egui::Painter, rect: Rect) {
        let alcance = self.alcance_malla();
        let n = if self.cuerpos.len() >= 6 { 36 } else { 28 };
        let stroke = Stroke::new(1.1_f32, Color32::from_rgba_unmultiplied(90, 140, 190, 120));

        let nodo = |ix: i32, iy: i32| -> (f32, f32, f32) {
            let x = -alcance + (2.0 * alcance) * (ix as f64) / (n as f64);
            let y = -alcance + (2.0 * alcance) * (iy as f64) / (n as f64);
            let profund = self.potencial_en(x, y, alcance);
            let z = -profund * alcance * 0.55;
            (x as f32, y as f32, z as f32)
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

    /// Tejido 3D tipo «sábana elástica» / pozo gravitatorio (potencial Φ → hundimiento Z).
    ///
    /// No es la rejilla cúbica: se ve la curvatura del espacio-tiempo de juguete,
    /// con color más cálido en el fondo del pozo.
    fn dibujar_pozo_3d(&self, painter: &egui::Painter, rect: Rect) {
        let alcance = self.alcance_malla();
        let n = if self.cuerpos.len() >= 6 { 22 } else { 28 };

        let mut nodos =
            vec![vec![(0.0_f32, 0.0_f32, 0.0_f32, 0.0_f64); (n + 1) as usize]; (n + 1) as usize];
        for iy in 0..=n {
            for ix in 0..=n {
                let x = -alcance + (2.0 * alcance) * (ix as f64) / (n as f64);
                let y = -alcance + (2.0 * alcance) * (iy as f64) / (n as f64);
                let profund = self.potencial_en(x, y, alcance);
                let z = -profund * alcance * 0.62;
                nodos[iy as usize][ix as usize] = (x as f32, y as f32, z as f32, profund);
            }
        }

        let color_prof = |p: f64| -> Color32 {
            let t = (p / 1.2).clamp(0.0, 1.0) as f32;
            // Azul frío lejos → ámbar en el pozo.
            let r = (70.0 + 160.0 * t) as u8;
            let g = (130.0 + 40.0 * (1.0 - t)) as u8;
            let b = (200.0 * (1.0 - 0.55 * t)) as u8;
            let a = (85.0 + 90.0 * t) as u8;
            Color32::from_rgba_unmultiplied(r, g, b, a)
        };

        for iy in 0..=n {
            for ix in 0..n {
                let (x0, y0, z0, p0) = nodos[iy as usize][ix as usize];
                let (x1, y1, z1, p1) = nodos[iy as usize][ix as usize + 1];
                let a = self.proyectar_rel(x0, y0, z0, rect);
                let b = self.proyectar_rel(x1, y1, z1, rect);
                let col = color_prof(0.5 * (p0 + p1));
                painter.line_segment([a, b], Stroke::new(1.15_f32, col));
            }
        }
        for ix in 0..=n {
            for iy in 0..n {
                let (x0, y0, z0, p0) = nodos[iy as usize][ix as usize];
                let (x1, y1, z1, p1) = nodos[iy as usize + 1][ix as usize];
                let a = self.proyectar_rel(x0, y0, z0, rect);
                let b = self.proyectar_rel(x1, y1, z1, rect);
                let col = color_prof(0.5 * (p0 + p1));
                painter.line_segment([a, b], Stroke::new(1.15_f32, col));
            }
        }

        // Plano de referencia (z=0) muy suave — ancla visual del «tejido».
        let z0 = 0.0_f32;
        let corners = [
            (-alcance as f32, -alcance as f32),
            (alcance as f32, -alcance as f32),
            (alcance as f32, alcance as f32),
            (-alcance as f32, alcance as f32),
        ];
        let stroke_ref = Stroke::new(1.0_f32, Color32::from_rgba_unmultiplied(255, 255, 255, 28));
        for i in 0..4 {
            let (x0, y0) = corners[i];
            let (x1, y1) = corners[(i + 1) % 4];
            painter.line_segment(
                [self.proyectar_rel(x0, y0, z0, rect), self.proyectar_rel(x1, y1, z0, rect)],
                stroke_ref,
            );
        }
    }
}
