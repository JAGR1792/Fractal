//! Métricas físicas del sistema: energía, momento y diagnósticos.
//!
//! Estas métricas permiten:
//!
//! 1. **Validar** que el simulador conserva energía y momento (tests)
//! 2. **Educar**: mostrar al estudiante qué significa cada magnitud
//! 3. **Diagnosticar**: detectar cuándo una simulación se vuelve inestable

use crate::constantes::G;
use crate::cuerpo::Cuerpo;
use crate::vector::Vec3;

/// Energía mecánica total del sistema: `E = K + U`.
///
/// * `K = Σ 0.5 * m_i * |v_i|²` (cinética)
/// * `U = -Σ_{i<j} G * m_i * m_j / |r_ij|` (gravitacional)
///
/// En un sistema aislado, `E` debe conservarse (no cambiar con el tiempo).
/// Velocity Verlet garantiza que la oscilación de `E` sea acotada.
///
/// # Retorna
///
/// * `f64` — energía total en julios (J)
///
/// # Ejemplo
///
/// ```
/// use fractal_fisica::cuerpo::Cuerpo;
/// use fractal_fisica::metricas::energia_total;
/// use fractal_fisica::vector::Vec3;
///
/// let cuerpos = vec![
///     Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero()),
///     Cuerpo::nuevo("t", "T", 5.972e24, 6.371e6,
///         Vec3::new(1.496e11, 0.0, 0.0), Vec3::new(0.0, 0.0, 0.0)),
/// ];
/// let e = energia_total(&cuerpos);
/// // La energía de un sistema ligado es negativa
/// assert!(e < 0.0);
/// ```
pub fn energia_total(cuerpos: &[Cuerpo]) -> f64 {
    let mut cinetica = 0.0;
    let mut potencial = 0.0;

    for cuerpo in cuerpos {
        cinetica += cuerpo.energia_cinetica();
    }

    for i in 0..cuerpos.len() {
        for j in (i + 1)..cuerpos.len() {
            let distancia = cuerpos[i].posicion.distancia(&cuerpos[j].posicion);
            if distancia > 0.0 {
                potencial -= G * cuerpos[i].masa * cuerpos[j].masa / distancia;
            }
        }
    }

    cinetica + potencial
}

/// Momento lineal total del sistema: `P = Σ m_i * v_i`.
///
/// En un sistema aislado, `P` debe conservarse exactamente.
/// Velocity Verlet lo conserva por construcción (tercera ley de Newton).
///
/// # Retorna
///
/// * `Vec3` — momento total en kg·m/s
pub fn momento_total(cuerpos: &[Cuerpo]) -> Vec3 {
    let mut total = Vec3::cero();
    for cuerpo in cuerpos {
        total += cuerpo.momento();
    }
    total
}

/// Momento angular total del sistema: `L = Σ r_i × p_i`.
///
/// También se conserva en un sistema aislado con fuerzas centrales.
///
/// # Retorna
///
/// * `Vec3` — momento angular total en kg·m²/s
pub fn momento_angular_total(cuerpos: &[Cuerpo]) -> Vec3 {
    let mut total = Vec3::cero();
    for cuerpo in cuerpos {
        total += cuerpo.posicion.cruz(&cuerpo.momento());
    }
    total
}

/// Diagnóstico completo del sistema en un instante dado.
///
/// Agrupa las métricas más útiles para validación y visualización.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Diagnostico {
    /// Energía cinética total (J)
    pub energia_cinetica: f64,
    /// Energía potencial gravitacional total (J)
    pub energia_potencial: f64,
    /// Energía mecánica total (J)
    pub energia_total: f64,
    /// Momento lineal total (kg·m/s)
    pub momento: Vec3,
    /// Momento angular total (kg·m²/s)
    pub momento_angular: Vec3,
}

/// Calcula el diagnóstico completo del sistema.
pub fn diagnosticar(cuerpos: &[Cuerpo]) -> Diagnostico {
    let mut cinetica = 0.0;
    let mut potencial = 0.0;

    for cuerpo in cuerpos {
        cinetica += cuerpo.energia_cinetica();
    }

    for i in 0..cuerpos.len() {
        for j in (i + 1)..cuerpos.len() {
            let distancia = cuerpos[i].posicion.distancia(&cuerpos[j].posicion);
            if distancia > 0.0 {
                potencial -= G * cuerpos[i].masa * cuerpos[j].masa / distancia;
            }
        }
    }

    Diagnostico {
        energia_cinetica: cinetica,
        energia_potencial: potencial,
        energia_total: cinetica + potencial,
        momento: momento_total(cuerpos),
        momento_angular: momento_angular_total(cuerpos),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn energia_de_sistema_ligado_es_negativa() {
        let cuerpos = vec![
            Cuerpo::nuevo("a", "A", 1e30, 1e8, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo(
                "b",
                "B",
                1e24,
                1e6,
                Vec3::new(1e11, 0.0, 0.0),
                Vec3::new(0.0, 1000.0, 0.0),
            ),
        ];
        assert!(energia_total(&cuerpos) < 0.0);
    }

    #[test]
    fn momento_total_en_reposo_es_cero() {
        let cuerpos = vec![
            Cuerpo::nuevo("a", "A", 1.0, 1.0, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo("b", "B", 1.0, 1.0, Vec3::new(1.0, 0.0, 0.0), Vec3::cero()),
        ];
        assert_eq!(momento_total(&cuerpos), Vec3::cero());
    }

    #[test]
    fn momento_se_conserva_con_velocidades_opuestas() {
        let cuerpos = vec![
            Cuerpo::nuevo("a", "A", 2.0, 1.0, Vec3::cero(), Vec3::new(1.0, 0.0, 0.0)),
            Cuerpo::nuevo("b", "B", 2.0, 1.0, Vec3::new(10.0, 0.0, 0.0), Vec3::new(-1.0, 0.0, 0.0)),
        ];
        let p = momento_total(&cuerpos);
        assert!(p.norma() < 1e-15);
    }

    #[test]
    fn diagnostico_contiene_todas_las_metricas() {
        let cuerpos = vec![
            Cuerpo::nuevo("a", "A", 1e30, 1e8, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo(
                "b",
                "B",
                1e24,
                1e6,
                Vec3::new(1e11, 0.0, 0.0),
                Vec3::new(0.0, 1000.0, 0.0),
            ),
        ];
        let diag = diagnosticar(&cuerpos);
        assert!(diag.energia_cinetica >= 0.0);
        assert!(diag.energia_potencial <= 0.0);
        assert_eq!(diag.energia_total, diag.energia_cinetica + diag.energia_potencial);
    }
}
