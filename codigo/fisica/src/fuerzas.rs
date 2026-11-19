//! Modelos de fuerza estilo GMAT (capas activables).
//!
//! Por defecto solo Newton N-cuerpos. Opcionalmente se suma el término
//! cuadrupolar J₂ del cuerpo primario (Tierra) y se puede fijar un
//! primario para perturbaciones relativas.

use crate::constantes::{G, J2_TIERRA, MASA_TIERRA, RADIO_TIERRA};
use crate::cuerpo::Cuerpo;
use crate::gravedad::calcular_aceleraciones;
use crate::vector::Vec3;

/// Capas de fuerza activables (inspirado en `Ex_ForceModels` de GMAT).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModeloFuerzas {
    /// Gravedad newtoniana N-cuerpos (siempre recomendada).
    pub newton: bool,
    /// Perturbación J₂ del primario (achatamiento).
    pub j2: bool,
    /// Índice del cuerpo primario para J₂ (`None` → busca id tierra/earth/sol).
    pub primario: Option<usize>,
}

impl Default for ModeloFuerzas {
    fn default() -> Self {
        Self { newton: true, j2: false, primario: None }
    }
}

impl ModeloFuerzas {
    pub fn solo_newton() -> Self {
        Self::default()
    }

    pub fn con_j2() -> Self {
        Self { newton: true, j2: true, primario: None }
    }
}

fn indice_primario(cuerpos: &[Cuerpo], modelo: &ModeloFuerzas) -> Option<usize> {
    if let Some(i) = modelo.primario {
        return (i < cuerpos.len()).then_some(i);
    }
    cuerpos
        .iter()
        .position(|c| {
            matches!(c.id.as_str(), "tierra" | "earth" | "sol" | "sun" | "luna" | "moon")
                && c.masa >= MASA_TIERRA * 0.01
        })
        .or_else(|| {
            // El más masivo suele ser el primario.
            cuerpos
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.masa.partial_cmp(&b.1.masa).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(i, _)| i)
        })
}

/// Aceleración J₂ en el marco inercial, relativa al primario.
///
/// Fórmula clásica (Vallado) para potencial zonal J₂:
/// ```text
/// a = (μ J₂ R² / (2 r⁵)) * factores en x,y,z
/// ```
pub fn aceleracion_j2(r_rel: Vec3, mu: f64, radio_eq: f64, j2: f64) -> Vec3 {
    let r = r_rel.norma();
    if r < radio_eq * 0.5 || r < 1.0 {
        return Vec3::cero();
    }
    let z = r_rel.z;
    let r2 = r * r;
    let z2 = z * z;
    let factor = 1.5 * j2 * mu * radio_eq * radio_eq / (r2 * r2 * r);
    let comun = 5.0 * z2 / r2;
    Vec3::new(
        factor * r_rel.x * (comun - 1.0),
        factor * r_rel.y * (comun - 1.0),
        factor * r_rel.z * (comun - 3.0),
    )
}

/// Aceleraciones con el modelo de fuerzas activo.
pub fn calcular_aceleraciones_modelo(cuerpos: &[Cuerpo], modelo: &ModeloFuerzas) -> Vec<Vec3> {
    let n = cuerpos.len();
    let mut a = if modelo.newton { calcular_aceleraciones(cuerpos) } else { vec![Vec3::cero(); n] };

    if modelo.j2
        && let Some(ip) = indice_primario(cuerpos, modelo)
    {
        let primario = &cuerpos[ip];
        let mu = G * primario.masa;
        // Escala J₂: si el primario es Tierra usamos constantes IERS;
        // si no, usamos J₂_Tierra como orden de magnitud educativo.
        let (req, j2) = if primario.masa > MASA_TIERRA * 0.5 && primario.masa < MASA_TIERRA * 2.0 {
            (RADIO_TIERRA, J2_TIERRA)
        } else {
            (primario.radio.max(1.0), J2_TIERRA)
        };
        for i in 0..n {
            if i == ip {
                continue;
            }
            let r_rel = cuerpos[i].posicion.restar(&primario.posicion);
            a[i] += aceleracion_j2(r_rel, mu, req, j2);
        }
    }

    a
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constantes::RADIO_TIERRA;

    #[test]
    fn j2_en_ecuador_apunta_hacia_fuera_radial_xy() {
        // En ecuador (z=0) el término J₂ modifica la atracción efectiva.
        let r = Vec3::new(RADIO_TIERRA + 400e3, 0.0, 0.0);
        let mu = G * MASA_TIERRA;
        let a = aceleracion_j2(r, mu, RADIO_TIERRA, J2_TIERRA);
        // En ecuador: (5z²/r² - 1) = -1 → ax tiene signo opuesto a x * factor positivo
        // factor > 0, (comun-1)= -1 → ax < 0 (hacia el origen) refuerzo.
        assert!(a.x < 0.0);
        assert!(a.y.abs() < 1e-12);
    }

    #[test]
    fn modelo_newton_coincide_con_gravedad() {
        let cuerpos = vec![
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
                1000.0,
                1.0,
                Vec3::new(RADIO_TIERRA + 400e3, 0.0, 0.0),
                Vec3::cero(),
            ),
        ];
        let a0 = calcular_aceleraciones(&cuerpos);
        let a1 = calcular_aceleraciones_modelo(&cuerpos, &ModeloFuerzas::solo_newton());
        assert_eq!(a0, a1);
    }
}
