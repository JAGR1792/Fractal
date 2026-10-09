//! Estado instantáneo del sistema y simulación completa.
//!
//! Un `Estado` es una fotografía del sistema en un instante de tiempo.
//! La simulación produce una secuencia de estados.

use crate::cuerpo::Cuerpo;
use crate::integrador::paso_velocity_verlet;

/// Estado instantáneo del sistema en un tiempo dado.
///
/// # Campos
///
/// * `tiempo` — tiempo simulado en segundos desde el inicio
/// * `cuerpos` — snapshot de posiciones y velocidades de cada cuerpo
///
/// # Uso
///
/// ```
/// use fractal_fisica::estado::Estado;
/// use fractal_fisica::cuerpo::Cuerpo;
/// use fractal_fisica::vector::Vec3;
///
/// let cuerpos = vec![
///     Cuerpo::nuevo("t", "T", 1.0, 1.0, Vec3::cero(), Vec3::cero()),
/// ];
/// let estado = Estado::nuevo(0.0, &cuerpos);
/// assert_eq!(estado.tiempo, 0.0);
/// ```
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Estado {
    /// Tiempo simulado en segundos desde t=0
    pub tiempo: f64,
    /// Posiciones y velocidades de cada cuerpo en este instante
    pub cuerpos: Vec<Cuerpo>,
}

impl Estado {
    /// Crea un estado nuevo a partir de los cuerpos actuales.
    pub fn nuevo(tiempo: f64, cuerpos: &[Cuerpo]) -> Self {
        Self { tiempo, cuerpos: cuerpos.to_vec() }
    }
}

/// Simulación completa de un sistema N-cuerpos.
///
/// Ejecuta `pasos` iteraciones de Velocity Verlet y registra el estado
/// del sistema cada `cada_n_pasos` pasos.
///
/// # Argumentos
///
/// * `cuerpos` — estado inicial del sistema
/// * `dt` — paso temporal en segundos
/// * `pasos` — número total de pasos a simular
/// * `cada_n_pasos` — cada cuántos pasos registrar un estado (1 = todos)
///
/// # Retorna
///
/// * `Vec<Estado>` — secuencia de estados registrados
///
/// # Ejemplo
///
/// ```
/// use fractal_fisica::cuerpo::Cuerpo;
/// use fractal_fisica::estado::simular;
/// use fractal_fisica::vector::Vec3;
///
/// let cuerpos = vec![
///     Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero()),
///     Cuerpo::nuevo("t", "T", 5.972e24, 6.371e6,
///         Vec3::new(1.496e11, 0.0, 0.0), Vec3::new(0.0, 29780.0, 0.0)),
/// ];
/// // Simular 1 día con pasos de 1 hora, registrar cada 6 horas
/// let historial = simular(&cuerpos, 3600.0, 24, 6);
/// assert_eq!(historial.len(), 5); // t=0, 6h, 12h, 18h, 24h
/// ```
pub fn simular(cuerpos: &[Cuerpo], dt: f64, pasos: usize, cada_n_pasos: usize) -> Vec<Estado> {
    assert!(cada_n_pasos > 0, "cada_n_pasos debe ser al menos 1");

    let mut estado_actual = cuerpos.to_vec();
    let mut historial = Vec::with_capacity(pasos / cada_n_pasos + 1);

    // registrar estado inicial
    historial.push(Estado::nuevo(0.0, &estado_actual));

    for paso in 1..=pasos {
        paso_velocity_verlet(&mut estado_actual, dt);

        if paso % cada_n_pasos == 0 {
            historial.push(Estado::nuevo(paso as f64 * dt, &estado_actual));
        }
    }

    historial
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vector::Vec3;

    #[test]
    fn simular_regresa_estados_interpolados() {
        let cuerpos = vec![
            Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo(
                "t",
                "T",
                5.972e24,
                6.371e6,
                Vec3::new(1.496e11, 0.0, 0.0),
                Vec3::new(0.0, 29780.0, 0.0),
            ),
        ];
        let historial = simular(&cuerpos, 3600.0, 24, 6);
        assert_eq!(historial.len(), 5);
        assert_eq!(historial[0].tiempo, 0.0);
        assert_eq!(historial[4].tiempo, 86400.0); // 24 horas
    }

    #[test]
    fn simular_con_cada_n_pasos_uno_registra_todo() {
        let cuerpos = vec![Cuerpo::nuevo("a", "A", 1.0, 1.0, Vec3::cero(), Vec3::cero())];
        let historial = simular(&cuerpos, 1.0, 10, 1);
        assert_eq!(historial.len(), 11); // t=0 + 10 pasos
    }
}
