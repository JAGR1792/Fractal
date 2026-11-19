//! Escenarios iniciales para la app local.
//!
//! El figure-8 de Chenciner–Montgomery está escalado a unidades SI
//! para usarlo con `fractal-fisica` (G de CODATA, masas en kg, metros).

use fractal_fisica::prelude::*;

/// Escala de longitud del figure-8 (metros).
const ESCALA_L: f64 = 1.0e9;
/// Masa de cada cuerpo del figure-8 (kg).
const MASA: f64 = 1.0e24;
/// Radio visual / físico (m) — solo visualización y colisiones.
const RADIO: f64 = ESCALA_L * 0.04;

/// Condiciones iniciales del figure-8 (G = 1, m = 1), Chenciner & Montgomery.
const X1: f64 = 0.970_004_36;
const Y1: f64 = -0.243_087_53;
const VX1: f64 = 0.466_203_685_0;
const VY1: f64 = 0.432_365_730_0;

/// Escala de velocidad SI: `v' = v · √(G · M / L)`.
fn escala_velocidad() -> f64 {
    (G * MASA / ESCALA_L).sqrt()
}

/// Tres cuerpos iguales en la coreografía figure-8.
pub fn tres_cuerpos_figure8() -> Vec<Cuerpo> {
    let vs = escala_velocidad();
    let p1 = Vec3::new(X1 * ESCALA_L, Y1 * ESCALA_L, 0.0);
    let p2 = Vec3::new(-X1 * ESCALA_L, -Y1 * ESCALA_L, 0.0);
    let p3 = Vec3::cero();
    let v1 = Vec3::new(VX1 * vs, VY1 * vs, 0.0);
    let v2 = Vec3::new(VX1 * vs, VY1 * vs, 0.0);
    let v3 = Vec3::new(-2.0 * VX1 * vs, -2.0 * VY1 * vs, 0.0);

    vec![
        Cuerpo::nuevo("a", "A", MASA, RADIO, p1, v1),
        Cuerpo::nuevo("b", "B", MASA, RADIO, p2, v2),
        Cuerpo::nuevo("c", "C", MASA, RADIO, p3, v3),
    ]
}

/// Escala espacial de referencia (para cámara y malla).
pub fn escala_espacial() -> f64 {
    ESCALA_L
}

/// Paso temporal recomendado (s) para el figure-8 escalado.
pub fn dt_recomendado() -> f64 {
    // Tiempo característico τ ≈ √(L³ / (G M)); el periodo ~ 6.3 τ.
    let tau = (ESCALA_L * ESCALA_L * ESCALA_L / (G * MASA)).sqrt();
    tau / 400.0
}
