//! Panel de misión estilo GMAT-lite: burns, Hohmann, targeting, fuerzas, track.

use eframe::egui::{self, Color32, Pos2, Rect, Sense, Stroke, Vec2};
use fractal_fisica::prelude::*;

#[derive(Debug, Clone)]
pub struct EstadoMision {
    pub modelo: ModeloFuerzas,
    pub integrador: Integrador,
    pub dv_burn: f32,
    pub eje: EjeBurn,
    pub r2_hohmann_km: f32,
    pub apoapsis_target_km: f32,
    pub ultimo_mensaje: String,
    pub mostrar_ground_track: bool,
    pub track: Vec<LatLon>,
    pub iluminacion: Iluminacion,
}

impl Default for EstadoMision {
    fn default() -> Self {
        Self {
            modelo: ModeloFuerzas::solo_newton(),
            integrador: Integrador::VelocityVerlet,
            dv_burn: 10.0,
            eje: EjeBurn::Velocity,
            r2_hohmann_km: 42_164.0,
            apoapsis_target_km: 42_164.0,
            ultimo_mensaje: String::new(),
            mostrar_ground_track: true,
            track: Vec::new(),
            iluminacion: Iluminacion::Sol,
        }
    }
}

impl EstadoMision {
    pub fn reset_track(&mut self) {
        self.track.clear();
    }

    /// Índice del primario (más masivo) e índice del “vehículo” (selección o no-primario).
    pub fn indices(cuerpos: &[Cuerpo], seleccionado: Option<usize>) -> Option<(usize, usize)> {
        if cuerpos.len() < 2 {
            return None;
        }
        let primario = cuerpos
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.masa.partial_cmp(&b.1.masa).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(i, _)| i)?;
        let veh = seleccionado
            .filter(|&i| i != primario)
            .or_else(|| (0..cuerpos.len()).find(|&i| i != primario))?;
        Some((primario, veh))
    }

    pub fn registrar_track(
        &mut self,
        cuerpos: &[Cuerpo],
        seleccionado: Option<usize>,
        tiempo: f64,
    ) {
        let Some((primario, veh)) = Self::indices(cuerpos, seleccionado) else {
            return;
        };
        let rel = cuerpos[veh].posicion.restar(&cuerpos[primario].posicion);
        let ll = ground_track(rel, tiempo, OMEGA_TIERRA);
        self.track.push(ll);
        if self.track.len() > 3600 {
            let sobra = self.track.len() - 3600;
            self.track.drain(0..sobra);
        }

        let dir_sol = fractal_fisica::orbital::direccion_sol(cuerpos, cuerpos[primario].posicion);
        self.iluminacion = iluminacion_satelite(
            cuerpos[veh].posicion,
            cuerpos[primario].posicion,
            dir_sol,
            cuerpos[primario].radio,
        );
    }
}

pub fn ui_panel_mision(
    ui: &mut egui::Ui,
    estado: &mut EstadoMision,
    cuerpos: &mut [Cuerpo],
    seleccionado: Option<usize>,
    dt: f64,
) {
    ui.heading("Misión");
    ui.label("Burns VNB · Hohmann · targeting · fuerzas (GMAT-lite).");
    ui.separator();

    ui.label("Integrador");
    ui.horizontal(|ui| {
        ui.selectable_value(&mut estado.integrador, Integrador::VelocityVerlet, "Verlet");
        ui.selectable_value(&mut estado.integrador, Integrador::Rk4, "RK4");
    });

    ui.separator();
    ui.label("Fuerzas");
    ui.checkbox(&mut estado.modelo.newton, "Newton N-cuerpos");
    ui.checkbox(&mut estado.modelo.j2, "J₂ primario")
        .on_hover_text("Achatamiento del primario (Tierra). Útil en LEO.");

    ui.separator();
    let indices = EstadoMision::indices(cuerpos, seleccionado);
    if let Some((ip, iv)) = indices {
        ui.monospace(format!(
            "primario: {} · vehículo: {}",
            cuerpos[ip].nombre, cuerpos[iv].nombre
        ));

        if let Some(el) = elementos_kepler(&cuerpos[iv], &cuerpos[ip]) {
            ui.monospace(format!("a = {:.1} km", el.a / 1e3));
            ui.monospace(format!("e = {:.5}", el.e));
            ui.monospace(format!("i = {:.2}°", el.i.to_degrees()));
            ui.monospace(format!("rp/ra = {:.0}/{:.0} km", el.rp / 1e3, el.ra / 1e3));
            if el.periodo.is_finite() {
                ui.monospace(format!("T = {:.1} min", el.periodo / 60.0));
            }
        }

        let luz = match estado.iluminacion {
            Iluminacion::Sol => ("☀ Sol", Color32::from_rgb(255, 220, 120)),
            Iluminacion::Penumbra => ("◐ Penumbra", Color32::from_rgb(200, 160, 100)),
            Iluminacion::Umbra => ("🌑 Umbra", Color32::from_rgb(120, 140, 200)),
        };
        ui.colored_label(luz.1, luz.0);

        ui.separator();
        ui.label("Burn impulsivo (m/s)");
        ui.add(egui::Slider::new(&mut estado.dv_burn, -500.0..=500.0).suffix(" m/s"));
        ui.horizontal(|ui| {
            ui.selectable_value(&mut estado.eje, EjeBurn::Velocity, "V");
            ui.selectable_value(&mut estado.eje, EjeBurn::Normal, "N");
            ui.selectable_value(&mut estado.eje, EjeBurn::Binormal, "B");
        });
        if ui.button("Aplicar Δv").clicked() {
            match burn_impulsivo_vnb(cuerpos, iv, ip, estado.eje, estado.dv_burn as f64) {
                Ok(()) => {
                    estado.ultimo_mensaje =
                        format!("Burn {:.1} m/s en {:?}", estado.dv_burn, estado.eje);
                }
                Err(e) => estado.ultimo_mensaje = e,
            }
        }

        ui.separator();
        ui.label("Hohmann → r₂ (km desde centro)");
        ui.add(egui::Slider::new(&mut estado.r2_hohmann_km, 6_600.0..=50_000.0));
        if ui.button("Δv₁ Hohmann (progrado)").clicked() {
            let r1 = cuerpos[iv].posicion.distancia(&cuerpos[ip].posicion);
            let mu = G * cuerpos[ip].masa;
            match Hohmann::nuevo(r1, estado.r2_hohmann_km as f64 * 1e3, mu) {
                Ok(h) => match burn_impulsivo_vnb(cuerpos, iv, ip, EjeBurn::Velocity, h.dv1) {
                    Ok(()) => {
                        estado.ultimo_mensaje = format!(
                            "Hohmann Δv₁={:.1} m/s · Δv₂≈{:.1} m/s · ToF {:.0} min",
                            h.dv1,
                            h.dv2,
                            h.tiempo_vuelo / 60.0
                        );
                    }
                    Err(e) => estado.ultimo_mensaje = e,
                },
                Err(e) => estado.ultimo_mensaje = e,
            }
        }
        if ui.button("Δv₂ circularizar (aprox)").clicked() {
            let r = cuerpos[iv].posicion.distancia(&cuerpos[ip].posicion);
            let mu = G * cuerpos[ip].masa;
            // Circularizar en el radio actual.
            let v_circ = (mu / r).sqrt();
            let vel_rel = cuerpos[iv].velocidad.restar(&cuerpos[ip].velocidad);
            let v_now = vel_rel.norma();
            let dv = v_circ - v_now;
            match burn_impulsivo_vnb(cuerpos, iv, ip, EjeBurn::Velocity, dv) {
                Ok(()) => estado.ultimo_mensaje = format!("Circularizar Δv={dv:.1} m/s"),
                Err(e) => estado.ultimo_mensaje = e,
            }
        }

        ui.separator();
        ui.label("Target apoapsis (km)");
        ui.add(egui::Slider::new(&mut estado.apoapsis_target_km, 6_600.0..=50_000.0));
        if ui.button("Resolver Δv (secante)").clicked() {
            let pasos = 800usize;
            match target_apoapsis_dv(
                cuerpos,
                iv,
                ip,
                estado.apoapsis_target_km as f64 * 1e3,
                pasos,
                dt.max(1.0),
            ) {
                Ok(dv) => {
                    estado.dv_burn = dv as f32;
                    estado.eje = EjeBurn::Velocity;
                    estado.ultimo_mensaje = format!("Targeting → Δv={dv:.2} m/s (aplica con Burn)");
                }
                Err(e) => estado.ultimo_mensaje = e,
            }
        }
    } else {
        ui.label("Selecciona un vehículo (no el primario).");
    }

    ui.separator();
    ui.checkbox(&mut estado.mostrar_ground_track, "Ground track");
    if ui.button("Limpiar track").clicked() {
        estado.reset_track();
    }

    if !estado.ultimo_mensaje.is_empty() {
        ui.separator();
        ui.colored_label(Color32::from_rgb(160, 220, 180), &estado.ultimo_mensaje);
    }
}

/// Mini-mapa de ground track (equirectangular).
pub fn dibujar_ground_track(painter: &egui::Painter, rect: Rect, track: &[LatLon]) {
    if track.is_empty() {
        return;
    }
    let stroke = Stroke::new(1.4_f32, Color32::from_rgba_unmultiplied(100, 220, 160, 200));
    let a_ecuador = Stroke::new(1.0_f32, Color32::from_rgba_unmultiplied(255, 255, 255, 40));
    let mid_y = rect.center().y;
    painter
        .line_segment([Pos2::new(rect.left(), mid_y), Pos2::new(rect.right(), mid_y)], a_ecuador);

    let proyectar = |ll: LatLon| -> Pos2 {
        let u = (ll.lon / std::f64::consts::PI + 1.0) * 0.5; // 0..1
        let v = 0.5 - ll.lat / std::f64::consts::PI; // 0..1
        Pos2::new(rect.left() + u as f32 * rect.width(), rect.top() + v as f32 * rect.height())
    };

    let puntos: Vec<Pos2> = track.iter().copied().map(proyectar).collect();
    // Evitar saltos ±180° de longitud.
    let mut segmento = Vec::new();
    for w in puntos.windows(2) {
        if (w[0].x - w[1].x).abs() > rect.width() * 0.4 {
            if segmento.len() >= 2 {
                painter.add(egui::Shape::line(segmento.clone(), stroke));
            }
            segmento.clear();
            segmento.push(w[1]);
        } else {
            if segmento.is_empty() {
                segmento.push(w[0]);
            }
            segmento.push(w[1]);
        }
    }
    if segmento.len() >= 2 {
        painter.add(egui::Shape::line(segmento, stroke));
    }
    if let Some(last) = puntos.last() {
        painter.circle_filled(*last, 3.0, Color32::from_rgb(120, 255, 180));
    }
}

/// Reserva un rectángulo inferior para el ground track (si está activo).
pub fn rect_ground_track(rect_escena: Rect, activo: bool) -> Option<Rect> {
    if !activo {
        return None;
    }
    let h = (rect_escena.height() * 0.22).clamp(90.0, 160.0);
    Some(Rect::from_min_max(
        Pos2::new(rect_escena.left() + 8.0, rect_escena.bottom() - h - 8.0),
        Pos2::new(rect_escena.left() + rect_escena.width() * 0.42, rect_escena.bottom() - 8.0),
    ))
}

pub fn fondo_track(painter: &egui::Painter, rect: Rect) {
    painter.rect_filled(rect, 4.0, Color32::from_rgba_unmultiplied(12, 18, 28, 200));
    painter.rect_stroke(
        rect,
        4.0,
        Stroke::new(1.0_f32, Color32::from_rgba_unmultiplied(80, 120, 160, 100)),
        egui::StrokeKind::Outside,
    );
    painter.text(
        rect.left_top() + Vec2::new(8.0, 4.0),
        egui::Align2::LEFT_TOP,
        "Ground track",
        egui::FontId::proportional(11.0),
        Color32::from_gray(160),
    );
}

/// Interactuar con el mini-mapa no debe robar el drag de la escena.
#[allow(dead_code)]
pub fn sense_track() -> Sense {
    Sense::hover()
}
