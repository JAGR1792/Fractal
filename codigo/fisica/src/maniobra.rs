//! Maniobras impulsivas (burns) estilo GMAT.
//!
//! Un burn impulsivo cambia la velocidad al instante sin cambiar la posición.
//! El marco VNB (Velocity–Normal–Binormal) es el más didáctico en LEO.

use crate::constantes::G;
use crate::cuerpo::Cuerpo;
use crate::vector::Vec3;

/// Direcciones locales alrededor de un cuerpo en órbita.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EjeBurn {
    /// Tangente a la velocidad (progrado / retrógrado).
    Velocity,
    /// Normal orbital (ĥ = r̂ × v̂).
    Normal,
    /// Completa la terna derecha: b̂ = v̂ × n̂.
    Binormal,
}

/// Triedro VNB en la posición/velocidad actuales (respecto a un primario inercial).
pub fn triedro_vnb(pos_rel: Vec3, vel_rel: Vec3) -> Option<(Vec3, Vec3, Vec3)> {
    let v_hat = vel_rel.normalizar()?;
    let h = pos_rel.cruz(&vel_rel);
    let n_hat = h.normalizar()?;
    let b_hat = v_hat.cruz(&n_hat);
    Some((v_hat, n_hat, b_hat))
}

/// Aplica un Δv impulsivo (m/s) en el eje VNB del cuerpo `idx` respecto al primario.
pub fn burn_impulsivo_vnb(
    cuerpos: &mut [Cuerpo],
    idx: usize,
    primario: usize,
    eje: EjeBurn,
    delta_v: f64,
) -> Result<(), String> {
    if idx >= cuerpos.len() || primario >= cuerpos.len() {
        return Err("índice fuera de rango".into());
    }
    if idx == primario {
        return Err("no se aplica burn al primario".into());
    }
    let pos_rel = cuerpos[idx].posicion.restar(&cuerpos[primario].posicion);
    let vel_rel = cuerpos[idx].velocidad.restar(&cuerpos[primario].velocidad);
    let (v_hat, n_hat, b_hat) = triedro_vnb(pos_rel, vel_rel)
        .ok_or_else(|| "triedro VNB indefinido (v≈0 o r∥v)".to_string())?;
    let dir = match eje {
        EjeBurn::Velocity => v_hat,
        EjeBurn::Normal => n_hat,
        EjeBurn::Binormal => b_hat,
    };
    cuerpos[idx].velocidad += dir.escalar(delta_v);
    Ok(())
}

/// Parámetros y Δv de una transferencia de Hohmann entre órbitas circulares.
#[derive(Debug, Clone, Copy)]
pub struct Hohmann {
    pub r1: f64,
    pub r2: f64,
    pub mu: f64,
    /// Burn en periapsis de la elipse de transferencia (m/s).
    pub dv1: f64,
    /// Burn en apoapsis para circularizar (m/s).
    pub dv2: f64,
    /// Tiempo de vuelo de la media elipse (s).
    pub tiempo_vuelo: f64,
}

impl Hohmann {
    /// Calcula Hohmann r1→r2 alrededor de un centro con parámetro gravitacional μ.
    pub fn nuevo(r1: f64, r2: f64, mu: f64) -> Result<Self, String> {
        if r1 <= 0.0 || r2 <= 0.0 || mu <= 0.0 {
            return Err("r1, r2, μ deben ser > 0".into());
        }
        let a_t = 0.5 * (r1 + r2);
        let v1 = (mu / r1).sqrt();
        let v2 = (mu / r2).sqrt();
        let vt_p = (mu * (2.0 / r1 - 1.0 / a_t)).sqrt();
        let vt_a = (mu * (2.0 / r2 - 1.0 / a_t)).sqrt();
        let dv1 = vt_p - v1;
        let dv2 = v2 - vt_a;
        let tiempo_vuelo = std::f64::consts::PI * (a_t * a_t * a_t / mu).sqrt();
        Ok(Self { r1, r2, mu, dv1, dv2, tiempo_vuelo })
    }

    pub fn dv_total(self) -> f64 {
        self.dv1.abs() + self.dv2.abs()
    }
}

/// Radio orbital actual respecto al primario (norma de posición relativa).
pub fn radio_orbital(cuerpo: &Cuerpo, primario: &Cuerpo) -> f64 {
    cuerpo.posicion.distancia(&primario.posicion)
}

/// μ = G · m_primario.
pub fn mu_de(primario: &Cuerpo) -> f64 {
    G * primario.masa
}

/// Targeting 1D: busca Δv en eje Velocity para alcanzar un apoapsis objetivo.
///
/// Diferential corrector de juguete (secante), estilo GMAT DC en 1 variable.
pub fn target_apoapsis_dv(
    cuerpos: &[Cuerpo],
    idx: usize,
    primario: usize,
    apoapsis_objetivo: f64,
    pasos_propagacion: usize,
    dt: f64,
) -> Result<f64, String> {
    use crate::fuerzas::ModeloFuerzas;
    use crate::integrador::paso_con_modelo;

    if idx >= cuerpos.len() || primario >= cuerpos.len() {
        return Err("índice fuera de rango".into());
    }
    let modelo = ModeloFuerzas::solo_newton();

    let medir = |dv: f64| -> f64 {
        let mut c = cuerpos.to_vec();
        let _ = burn_impulsivo_vnb(&mut c, idx, primario, EjeBurn::Velocity, dv);
        let mut r_max = radio_orbital(&c[idx], &c[primario]);
        for _ in 0..pasos_propagacion {
            paso_con_modelo(&mut c, dt, &modelo);
            let r = radio_orbital(&c[idx], &c[primario]);
            if r > r_max {
                r_max = r;
            }
        }
        r_max - apoapsis_objetivo
    };

    let mut dv0 = 0.0;
    let mut dv1 = 50.0; // m/s semilla
    let mut f0 = medir(dv0);
    let mut f1 = medir(dv1);
    for _ in 0..12 {
        if (f1 - f0).abs() < 1e-9 {
            break;
        }
        let dv2 = dv1 - f1 * (dv1 - dv0) / (f1 - f0);
        dv0 = dv1;
        f0 = f1;
        dv1 = dv2.clamp(-3000.0, 3000.0);
        f1 = medir(dv1);
        if f1.abs() < apoapsis_objetivo * 1e-4 {
            return Ok(dv1);
        }
    }
    Ok(dv1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constantes::{MASA_TIERRA, RADIO_TIERRA};

    #[test]
    fn hohmann_leo_a_geo_dv_razonable() {
        let r1 = RADIO_TIERRA + 300e3;
        let r2 = 42_164e3; // GEO aprox
        let mu = G * MASA_TIERRA;
        let h = Hohmann::nuevo(r1, r2, mu).unwrap();
        // Valores de referencia ~3.9 + 1.5 km/s
        assert!(h.dv1 > 2000.0 && h.dv1 < 4500.0);
        assert!(h.dv2 > 1000.0 && h.dv2 < 2500.0);
        assert!(h.tiempo_vuelo > 10_000.0);
    }

    #[test]
    fn burn_progrado_aumenta_energia() {
        let mut cuerpos = vec![
            Cuerpo::nuevo(
                "tierra",
                "Tierra",
                MASA_TIERRA,
                RADIO_TIERRA,
                Vec3::cero(),
                Vec3::cero(),
            ),
            Cuerpo::nuevo(
                "sat",
                "Sat",
                500.0,
                1.0,
                Vec3::new(RADIO_TIERRA + 400e3, 0.0, 0.0),
                Vec3::new(0.0, 7660.0, 0.0),
            ),
        ];
        let e0 = cuerpos[1].energia_cinetica();
        burn_impulsivo_vnb(&mut cuerpos, 1, 0, EjeBurn::Velocity, 100.0).unwrap();
        assert!(cuerpos[1].energia_cinetica() > e0);
    }
}
