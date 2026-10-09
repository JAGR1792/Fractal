//! Cálculo de aceleraciones gravitacionales.
//!
//! # Modelo
//!
//! Implementa la ley de gravitación universal de Newton:
//!
//! ```text
//! a_i = Σ_{j≠i} G * m_j / |r_ij|³ * r_ij
//! ```
//!
//! donde `r_ij = r_j - r_i` es el vector que apunta de `i` hacia `j`.
//!
//! # ¿Por qué O(N²) directo?
//!
//! Para el Sistema Solar (N=9) y escenarios educativos (N<100),
//! la fuerza bruta es más rápida que Barnes-Hut o FMM por bajo overhead.
//! Ver ADR-0001 y plan Etapa 7.

use crate::constantes::G;
use crate::cuerpo::Cuerpo;
use crate::vector::Vec3;

/// Calcula la aceleración gravitacional de cada cuerpo del sistema.
///
/// # Algoritmo
///
/// Para cada cuerpo `i`, suma las contribuciones de todos los demás `j`:
///
/// ```text
/// a_i += G * m_j / |r_ij|³ * r_ij
/// ```
///
/// # Complejidad
///
/// * Tiempo: O(N²) donde N es el número de cuerpos
/// * Memoria: O(N) para el vector de resultado
///
/// # Argumentos
///
/// * `cuerpos` — slice de cuerpos con masa, posición y velocidad actual
///
/// # Retorna
///
/// * `Vec<Vec3>` — aceleración de cada cuerpo en m/s², en el mismo orden que `cuerpos`
///
/// # Ejemplo
///
/// ```
/// use fractal_fisica::cuerpo::Cuerpo;
/// use fractal_fisica::gravedad::calcular_aceleraciones;
/// use fractal_fisica::vector::Vec3;
///
/// let cuerpos = vec![
///     Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero()),
///     Cuerpo::nuevo("tierra", "Tierra", 5.972e24, 6.371e6,
///         Vec3::new(1.496e11, 0.0, 0.0), Vec3::new(0.0, 29780.0, 0.0)),
/// ];
/// let a = calcular_aceleraciones(&cuerpos);
/// assert_eq!(a.len(), 2);
/// // La aceleración del Sol es despreciable pero no cero
/// assert!(a[0].norma() > 0.0);
/// // La Tierra siente la atracción del Sol
/// assert!(a[1].norma() > 0.0);
/// ```
pub fn calcular_aceleraciones(cuerpos: &[Cuerpo]) -> Vec<Vec3> {
    let n = cuerpos.len();
    let mut aceleraciones = vec![Vec3::cero(); n];

    for i in 0..n {
        for j in 0..n {
            if i == j {
                continue; // un cuerpo no se atrae a sí mismo
            }

            // vector de i hacia j
            let r_ij = cuerpos[j].posicion.restar(&cuerpos[i].posicion);
            let distancia = r_ij.norma();

            // evitar división por cero en colisiones exactas
            if distancia < 1.0 {
                continue;
            }

            // a_i += G * m_j / |r_ij|³ * r_ij
            let factor = G * cuerpos[j].masa / (distancia * distancia * distancia);
            aceleraciones[i] += r_ij.escalar(factor);
        }
    }

    aceleraciones
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sistema_de_un_cuerpo_no_acelera() {
        let cuerpos =
            vec![Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero())];
        let a = calcular_aceleraciones(&cuerpos);
        assert_eq!(a.len(), 1);
        assert_eq!(a[0], Vec3::cero());
    }

    #[test]
    fn dos_cuerpos_se_atraen_mutuamente() {
        let cuerpos = vec![
            Cuerpo::nuevo("a", "A", 1e30, 1e8, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo("b", "B", 1e24, 1e6, Vec3::new(1e11, 0.0, 0.0), Vec3::cero()),
        ];
        let a = calcular_aceleraciones(&cuerpos);
        // A atrae hacia B (dirección +X)
        assert!(a[0].x > 0.0);
        // B atrae hacia A (dirección -X)
        assert!(a[1].x < 0.0);
        // Tercera ley: magnitudes proporcionales a masas
        let razon = a[1].norma() / a[0].norma();
        assert!((razon - 1e30 / 1e24).abs() < 1e-6);
    }

    #[test]
    fn simetra_de_fuerzas_tercera_ley() {
        let cuerpos = vec![
            Cuerpo::nuevo("a", "A", 1e30, 1e8, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo("b", "B", 1e24, 1e6, Vec3::new(1e11, 0.0, 0.0), Vec3::cero()),
        ];
        let a = calcular_aceleraciones(&cuerpos);
        // a_a * m_a = -a_b * m_b  (conservación de momento)
        let momento_total = a[0].escalar(cuerpos[0].masa) + a[1].escalar(cuerpos[1].masa);
        assert!(momento_total.norma() < 1e-10);
    }
}
